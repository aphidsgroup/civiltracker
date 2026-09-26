import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for the legacy `PATCH` / `DELETE /api/expenses/[id]` handlers found at
 * d1e35c5.
 *
 * Both handlers only required `expenses.view`, decided "may edit" from a hard-coded role
 * list, looked the expense up without any site binding, and then wrote it with an
 * unscoped `update({ where: { id } })` outside any transaction. Editing a PENDING expense
 * left its open approval showing the old amount and title; deleting it left the approval
 * open in the queue, pointing at a soft-deleted expense.
 *
 * Now: the live principal must hold `expenses.update` (any expense of the tenant) or
 * `expenses.create` (only its own) before any read; the lookup is pinned to the exact
 * company, a live site of that company and — for a creator-only principal — its own
 * rows; and the expense, its single mutable linked approval, the timeline entry and the
 * audit record move in one transaction, or nothing moves.
 *
 * `@/lib/permissions` is the real matrix.
 */
const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    expense: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    approval: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    approvalTimeline: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  }

  // The interactive transaction client is a distinct object, so a write issued on the
  // global client instead of `tx` is caught by the global spies staying untouched.
  const tx = {
    expense: { updateMany: vi.fn() },
    approval: { findMany: vi.fn(), updateMany: vi.fn() },
    approvalTimeline: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  }

  return {
    auth: vi.fn(),
    requireUser: vi.fn(),
    requireModuleEnabled: vi.fn(),
    prisma,
    tx,
    state: { rolledBack: false },
  }
})

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/auth/require-module', () => ({ requireModuleEnabled: mocks.requireModuleEnabled }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))

const { PATCH, DELETE } = await import('@/app/api/expenses/[id]/route')

const SITES: Record<string, Row> = {
  site_1: { id: 'site_1', companyId: 'company_1', deletedAt: null },
  site_2: { id: 'site_2', companyId: 'company_1', deletedAt: null },
  site_dead: { id: 'site_dead', companyId: 'company_1', deletedAt: new Date('2026-01-01') },
  site_other: { id: 'site_other', companyId: 'company_2', deletedAt: null },
}

function expense(overrides: Row): Row {
  const siteId = (overrides.siteId ?? 'site_1') as string
  return {
    companyId: 'company_1',
    siteId,
    createdById: 'user_site_engineer',
    approvalStatus: 'PENDING',
    amount: 1000,
    category: 'MATERIAL',
    paymentMode: 'CASH',
    paidTo: 'Supplier',
    description: 'Cement bags',
    billNumber: 'B-1',
    notes: null,
    deletedAt: null,
    ...overrides,
    site: SITES[siteId],
  }
}

const EXPENSES: Row[] = [
  expense({ id: 'e_open' }),
  expense({ id: 'e_no_approval' }),
  expense({ id: 'e_review' }),
  expense({ id: 'e_two_open' }),
  expense({ id: 'e_cross_site_approval' }),
  expense({ id: 'e_approved', approvalStatus: 'APPROVED' }),
  expense({ id: 'e_other_creator', createdById: 'someone_else' }),
  expense({ id: 'e_dead_site', siteId: 'site_dead' }),
  expense({ id: 'e_other_tenant', companyId: 'company_2', siteId: 'site_other' }),
  // Stamped company_1 but pinned to another tenant's site.
  expense({ id: 'e_cross_bound', siteId: 'site_other' }),
]

function approval(overrides: Row): Row {
  return { companyId: 'company_1', siteId: 'site_1', entityType: 'EXPENSE', deletedAt: null, currentStatus: 'PENDING', ...overrides }
}

const APPROVALS: Row[] = [
  approval({ id: 'a_open', entityId: 'e_open', currentStatus: 'PENDING' }),
  approval({ id: 'a_review', entityId: 'e_review', currentStatus: 'PENDING_REVIEW' }),
  approval({ id: 'a_two_1', entityId: 'e_two_open', currentStatus: 'PENDING' }),
  approval({ id: 'a_two_2', entityId: 'e_two_open', entityType: 'BILL', currentStatus: 'SUBMITTED' }),
  approval({ id: 'a_cross_site', entityId: 'e_cross_site_approval', siteId: 'site_2' }),
  // Another tenant's approval for the same id is not linked to this expense.
  approval({ id: 'a_foreign', entityId: 'e_open', companyId: 'company_2', siteId: 'site_other' }),
]

const siteRelation = (row: Row, key: string) => (key === 'site' ? ((row.site as Row | null) ?? null) : undefined)

function principal(role: string, companyId: string | undefined = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

const ROLES_WITHOUT_EXPENSE_WRITE = ['ACCOUNTANT', 'SUPERVISOR', 'PURCHASE_MANAGER', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'] as const

function patchRequest(body: unknown) {
  return new Request('http://test/api/expenses/x', { method: 'PATCH', body: JSON.stringify(body) })
}

function deleteRequest(confirm: string) {
  return new Request('http://test/api/expenses/x', { method: 'DELETE', body: JSON.stringify({ dangerConfirmText: confirm }) })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function expectNoReads() {
  expect(mocks.prisma.expense.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.findMany).not.toHaveBeenCalled()
  expect(mocks.tx.approval.findMany).not.toHaveBeenCalled()
}

function expectNoWrites() {
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  expect(mocks.tx.expense.updateMany).not.toHaveBeenCalled()
  expect(mocks.tx.approval.updateMany).not.toHaveBeenCalled()
  expect(mocks.tx.approvalTimeline.create).not.toHaveBeenCalled()
  expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
  expectNoGlobalWrites()
}

/** Nothing is ever written outside the transaction client, and nothing raw. */
function expectNoGlobalWrites() {
  expect(mocks.prisma.expense.update).not.toHaveBeenCalled()
  expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.update).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
  expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
  expect(mocks.prisma.$executeRaw).not.toHaveBeenCalled()
  expect(mocks.prisma.$executeRawUnsafe).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.rolledBack = false
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.requireModuleEnabled.mockResolvedValue(undefined)

  const expenses = inMemoryDelegate(EXPENSES, siteRelation)
  const approvals = inMemoryDelegate(APPROVALS)
  mocks.prisma.expense.findFirst.mockImplementation(expenses.findFirst)
  mocks.tx.expense.updateMany.mockImplementation(expenses.updateMany)
  mocks.tx.approval.findMany.mockImplementation(approvals.findMany)
  mocks.tx.approval.updateMany.mockImplementation(approvals.updateMany)
  mocks.tx.approvalTimeline.create.mockResolvedValue({ id: 'timeline_1' })
  mocks.tx.auditLog.create.mockResolvedValue({ id: 'audit_1' })

  // A throw inside the callback is a rollback: nothing the callback wrote commits.
  mocks.prisma.$transaction.mockImplementation(async (run: (client: typeof mocks.tx) => unknown) => {
    try {
      return await run(mocks.tx)
    } catch (error) {
      mocks.state.rolledBack = true
      throw error
    }
  })
})

describe('legacy expense mutation entry gate', () => {
  it.each([
    ['PATCH', () => PATCH(patchRequest({ amount: 10 }), params('e_open'))],
    ['DELETE', () => DELETE(deleteRequest('Cement bags'), params('e_open'))],
  ])('%s refuses a revoked principal before any read', async (_verb, call) => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    const response = await call()
    expect(response.status).toBe(401)
    expectNoReads()
    expectNoWrites()
    expect(mocks.auth).not.toHaveBeenCalled()
  })

  it.each(ROLES_WITHOUT_EXPENSE_WRITE)('refuses an active %s before any read, on both verbs', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    expect((await PATCH(patchRequest({ amount: 10 }), params('e_open'))).status).toBe(403)
    expect((await DELETE(deleteRequest('Cement bags'), params('e_open'))).status).toBe(403)
    expectNoReads()
    expectNoWrites()
  })

  it('refuses a SUPER_ADMIN, which carries no tenant context, before any read', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root', name: 'Root', email: 'root@platform.test', role: 'SUPER_ADMIN' })

    expect((await PATCH(patchRequest({ amount: 10 }), params('e_open'))).status).toBe(403)
    expect((await DELETE(deleteRequest('Cement bags'), params('e_open'))).status).toBe(403)
    expectNoReads()
    expectNoWrites()
  })

  it('refuses when the EXPENSES module is disabled, before any read', async () => {
    mocks.requireModuleEnabled.mockRejectedValue(new Error('Module EXPENSES is not enabled for this company'))

    expect((await PATCH(patchRequest({ amount: 10 }), params('e_open'))).status).toBe(403)
    expect((await DELETE(deleteRequest('Cement bags'), params('e_open'))).status).toBe(403)
    expectNoReads()
    expectNoWrites()
  })
})

describe('legacy expense mutation tenant scope', () => {
  it.each(['e_other_tenant', 'e_cross_bound', 'e_dead_site', 'does_not_exist'])(
    'answers %s as not found on both verbs without any write',
    async (id) => {
      expect((await PATCH(patchRequest({ amount: 10 }), params(id))).status).toBe(404)
      expect((await DELETE(deleteRequest('Cement bags'), params(id))).status).toBe(404)
      expectNoWrites()
    }
  )

  it('pins the lookup to the live company and a live site of that company', async () => {
    await PATCH(patchRequest({ amount: 10 }), params('e_open'))

    expect(mocks.prisma.expense.findFirst.mock.calls[0][0].where).toEqual({
      id: 'e_open',
      companyId: 'company_1',
      deletedAt: null,
      site: { is: { companyId: 'company_1', deletedAt: null } },
    })
  })

  it("answers another member's expense as not found for a creator-only principal", async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    const foreign = await PATCH(patchRequest({ amount: 10 }), params('e_other_creator'))
    const missing = await PATCH(patchRequest({ amount: 10 }), params('does_not_exist'))

    expect(foreign.status).toBe(404)
    expect(await foreign.json()).toEqual(await missing.json())
    expect(mocks.prisma.expense.findFirst.mock.calls[0][0].where).toMatchObject({ createdById: 'user_site_engineer' })
    expect((await DELETE(deleteRequest('Cement bags'), params('e_other_creator'))).status).toBe(404)
    expectNoWrites()
  })

  it('lets a creator edit its own pending expense', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    expect((await PATCH(patchRequest({ notes: 'fixed' }), params('e_open'))).status).toBe(200)
    expect(mocks.tx.expense.updateMany.mock.calls[0][0].where).toMatchObject({ createdById: 'user_site_engineer' })
  })

  it('refuses a non-pending expense without a transaction', async () => {
    expect((await PATCH(patchRequest({ amount: 10 }), params('e_approved'))).status).toBe(400)
    expect((await DELETE(deleteRequest('Cement bags'), params('e_approved'))).status).toBe(400)
    expectNoWrites()
  })
})

describe('PATCH keeps the linked approval in step', () => {
  it('updates the expense, its mutable approval, a timeline entry and the audit record in one transaction', async () => {
    const response = await PATCH(patchRequest({ amount: '60000', description: 'Steel bars' }), params('e_open'))

    expect(response.status).toBe(200)
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)

    expect(mocks.tx.approval.findMany.mock.calls[0][0].where).toEqual({
      entityId: 'e_open',
      entityType: { in: ['EXPENSE', 'BILL'] },
      companyId: 'company_1',
      deletedAt: null,
    })

    const expenseWrite = mocks.tx.expense.updateMany.mock.calls[0][0]
    expect(expenseWrite.where).toEqual({
      id: 'e_open',
      companyId: 'company_1',
      siteId: 'site_1',
      deletedAt: null,
      approvalStatus: 'PENDING',
      site: { is: { companyId: 'company_1', deletedAt: null } },
    })
    expect(expenseWrite.data).toEqual({ amount: 60000, description: 'Steel bars' })

    const approvalWrite = mocks.tx.approval.updateMany.mock.calls[0][0]
    expect(approvalWrite.where).toEqual({
      id: 'a_open',
      companyId: 'company_1',
      siteId: 'site_1',
      deletedAt: null,
      currentStatus: { in: ['PENDING', 'SUBMITTED'] },
    })
    expect(approvalWrite.data).toMatchObject({ amount: 60000, priority: 'HIGH', title: 'Steel bars' })

    expect(mocks.tx.approvalTimeline.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company_1',
        approvalId: 'a_open',
        actorUserId: 'user_company_admin',
        fromStatus: 'PENDING',
        toStatus: 'PENDING',
      }),
    })
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: 'company_1', action: 'UPDATE', module: 'EXPENSE', recordId: 'e_open' }),
    })
    expectNoGlobalWrites()
  })

  it('updates an expense that has no approval without touching the approval tables', async () => {
    expect((await PATCH(patchRequest({ notes: 'n' }), params('e_no_approval'))).status).toBe(200)
    expect(mocks.tx.expense.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.tx.approval.updateMany).not.toHaveBeenCalled()
    expect(mocks.tx.approvalTimeline.create).not.toHaveBeenCalled()
    expect(mocks.tx.auditLog.create).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['an approval already under review', 'e_review'],
    ['two open approvals', 'e_two_open'],
    ['an approval bound to another site', 'e_cross_site_approval'],
  ])('refuses %s with a conflict and writes nothing', async (_label, id) => {
    const response = await PATCH(patchRequest({ amount: 10 }), params(id))

    expect(response.status).toBe(409)
    expect(mocks.tx.expense.updateMany).not.toHaveBeenCalled()
    expect(mocks.tx.approval.updateMany).not.toHaveBeenCalled()
    expect(mocks.tx.approvalTimeline.create).not.toHaveBeenCalled()
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expectNoGlobalWrites()
  })

  it('rolls the expense edit back when the approval moved on concurrently', async () => {
    mocks.tx.approval.updateMany.mockResolvedValue({ count: 0 })

    const response = await PATCH(patchRequest({ amount: 10 }), params('e_open'))

    expect(response.status).toBe(409)
    expect(mocks.state.rolledBack).toBe(true)
    expect(mocks.tx.approvalTimeline.create).not.toHaveBeenCalled()
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('rolls back when the expense itself left PENDING concurrently', async () => {
    mocks.tx.expense.updateMany.mockResolvedValue({ count: 0 })

    const response = await PATCH(patchRequest({ amount: 10 }), params('e_open'))

    expect(response.status).toBe(409)
    expect(mocks.state.rolledBack).toBe(true)
    expect(mocks.tx.approval.updateMany).not.toHaveBeenCalled()
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
  })

  it.each([
    [{ amount: 'abc' }],
    [{ amount: -5 }],
    [{ category: 'NOT_A_CATEGORY' }],
    [{ paymentMode: 'BITCOIN' }],
    [{ description: '   ' }],
    [{}],
  ])('rejects invalid input %j before any transaction', async (body) => {
    expect((await PATCH(patchRequest(body), params('e_open'))).status).toBe(400)
    expectNoWrites()
  })
})

describe('DELETE retires the linked approvals with the expense', () => {
  it('soft-deletes the expense and cancels every mutable linked approval in one transaction', async () => {
    const response = await DELETE(deleteRequest('Cement bags'), params('e_two_open'))

    expect(response.status).toBe(200)
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)

    const expenseWrite = mocks.tx.expense.updateMany.mock.calls[0][0]
    expect(expenseWrite.where).toMatchObject({ id: 'e_two_open', companyId: 'company_1', siteId: 'site_1', deletedAt: null, approvalStatus: 'PENDING' })
    expect(expenseWrite.data.deletedAt).toBeInstanceOf(Date)

    const approvalWrites = mocks.tx.approval.updateMany.mock.calls.map((call) => call[0])
    expect(approvalWrites.map((write) => write.where.id)).toEqual(['a_two_1', 'a_two_2'])
    for (const write of approvalWrites) {
      expect(write.where).toMatchObject({ companyId: 'company_1', siteId: 'site_1', deletedAt: null, currentStatus: { in: ['PENDING', 'SUBMITTED'] } })
      expect(write.data).toMatchObject({ currentStatus: 'CANCELLED' })
      expect(write.data.deletedAt).toBeInstanceOf(Date)
    }

    const timelines = mocks.tx.approvalTimeline.create.mock.calls.map((call) => call[0].data)
    expect(timelines).toEqual([
      expect.objectContaining({ approvalId: 'a_two_1', fromStatus: 'PENDING', toStatus: 'CANCELLED', companyId: 'company_1' }),
      expect.objectContaining({ approvalId: 'a_two_2', fromStatus: 'SUBMITTED', toStatus: 'CANCELLED', companyId: 'company_1' }),
    ])
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: 'company_1', action: 'DELETE', module: 'EXPENSE', recordId: 'e_two_open' }),
    })
    expectNoGlobalWrites()
  })

  it('soft-deletes an expense that has no approval', async () => {
    expect((await DELETE(deleteRequest('Cement bags'), params('e_no_approval'))).status).toBe(200)
    expect(mocks.tx.expense.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.tx.approval.updateMany).not.toHaveBeenCalled()
  })

  it.each([
    ['an approval already under review', 'e_review'],
    ['an approval bound to another site', 'e_cross_site_approval'],
  ])('refuses %s with a conflict and writes nothing', async (_label, id) => {
    expect((await DELETE(deleteRequest('Cement bags'), params(id))).status).toBe(409)
    expect(mocks.tx.expense.updateMany).not.toHaveBeenCalled()
    expect(mocks.tx.approval.updateMany).not.toHaveBeenCalled()
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expectNoGlobalWrites()
  })

  it('refuses a wrong confirmation phrase without a transaction', async () => {
    expect((await DELETE(deleteRequest('nope'), params('e_open'))).status).toBe(400)
    expectNoWrites()
  })

  it('rolls the expense delete back when an approval cannot be cancelled', async () => {
    mocks.tx.approval.updateMany.mockResolvedValue({ count: 0 })

    const response = await DELETE(deleteRequest('Cement bags'), params('e_open'))

    expect(response.status).toBe(409)
    expect(mocks.state.rolledBack).toBe(true)
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
  })
})
