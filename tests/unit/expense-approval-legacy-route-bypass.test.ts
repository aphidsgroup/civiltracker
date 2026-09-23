import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Route-level cover for the legacy bills endpoints `POST /api/expenses/[id]/approve`
 * and `/reject`.
 *
 * These two handlers were the last surface that still ran its own approval workflow:
 * they updated `Expense` directly and then issued a raw, unscoped
 * `UPDATE "Approval" ... WHERE "entityId" = $1` that matched every approval row of every
 * company pointing at that id. That bypassed the live principal, the exact approval
 * company/site binding, the linked entity re-resolution, the conditional status gate,
 * the transaction, the timeline entry, the audit record and the null-site fail-closed
 * rule — all of which live in the hardened approval actions.
 *
 * Nothing here mocks `@/actions/approvals`, so the assertions only pass when the routes
 * really derive an approval id from a company/site scoped lookup and then delegate to the
 * hardened transition.
 */
const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    $queryRaw: vi.fn(),
    approval: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    approvalTimeline: { create: vi.fn() },
    expense: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    salaryRun: { findFirst: vi.fn(), updateMany: vi.fn() },
    dailyProgressReport: { findFirst: vi.fn() },
    material: { findFirst: vi.fn() },
    document: { findFirst: vi.fn() },
    purchaseOrder: { findFirst: vi.fn() },
  }

  // The interactive transaction client forwards to the shared delegates, so a write
  // issued on the global client instead of `tx` leaves `mocks.tx` untouched.
  const tx = {
    approval: {
      update: vi.fn((args: unknown) => prisma.approval.update(args)),
      updateMany: vi.fn((args: unknown) => prisma.approval.updateMany(args)),
    },
    approvalTimeline: { create: vi.fn((args: unknown) => prisma.approvalTimeline.create(args)) },
    expense: {
      findFirst: vi.fn((args: unknown) => prisma.expense.findFirst(args)),
      updateMany: vi.fn((args: unknown) => prisma.expense.updateMany(args)),
    },
    salaryRun: {
      findFirst: vi.fn((args: unknown) => prisma.salaryRun.findFirst(args)),
      updateMany: vi.fn((args: unknown) => prisma.salaryRun.updateMany(args)),
    },
    dailyProgressReport: { findFirst: vi.fn((args: unknown) => prisma.dailyProgressReport.findFirst(args)) },
    material: { findFirst: vi.fn((args: unknown) => prisma.material.findFirst(args)) },
    document: { findFirst: vi.fn((args: unknown) => prisma.document.findFirst(args)) },
    purchaseOrder: { findFirst: vi.fn((args: unknown) => prisma.purchaseOrder.findFirst(args)) },
  }

  return {
    auth: vi.fn(),
    requireUser: vi.fn(),
    requireModuleEnabled: vi.fn(),
    hasPermission: vi.fn(),
    revalidatePath: vi.fn(),
    logActivity: vi.fn(),
    syncSiteBudget: vi.fn(),
    prisma,
    tx,
  }
})

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/auth/require-module', () => ({ requireModuleEnabled: mocks.requireModuleEnabled }))
vi.mock('@/lib/permissions', () => ({ hasPermission: mocks.hasPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('@/lib/budget', () => ({ syncSiteBudget: mocks.syncSiteBudget }))

const { POST: approveExpense } = await import('@/app/api/expenses/[id]/approve/route')
const { POST: rejectExpense } = await import('@/app/api/expenses/[id]/reject/route')

const COMPANY_ADMIN = {
  id: 'admin_1',
  name: 'Admin',
  email: 'admin@acme.test',
  role: 'COMPANY_ADMIN',
  companyId: 'company_1',
}

const OPEN_STATUSES = ['PENDING', 'SUBMITTED', 'PENDING_REVIEW']

function postRequest(url: string, body?: unknown) {
  // The bills UI posts with no body at all, so the handlers must tolerate an unparseable
  // request rather than depending on a payload.
  if (body === undefined) return new Request(url, { method: 'POST' })
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function expenseRow(overrides: Record<string, unknown> = {}) {
  return { id: 'expense_1', companyId: 'company_1', siteId: 'site_1', ...overrides }
}

function approvalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'approval_1',
    companyId: 'company_1',
    siteId: 'site_1',
    currentStatus: 'PENDING',
    entityType: 'EXPENSE',
    entityId: 'expense_1',
    title: 'Site bill',
    ...overrides,
  }
}

/** No expense row, approval row, timeline row or audit trail may be written. */
function expectNoWrites() {
  expect(mocks.prisma.expense.update).not.toHaveBeenCalled()
  expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.update).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
  expect(mocks.logActivity).not.toHaveBeenCalled()
  expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
  expectNoRawSql()
}

/** The raw `UPDATE "Approval" ... WHERE "entityId" = $1` is gone for good. */
function expectNoRawSql() {
  expect(mocks.prisma.$executeRaw).not.toHaveBeenCalled()
  expect(mocks.prisma.$executeRawUnsafe).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: 'admin_1', role: 'COMPANY_ADMIN', companyId: 'company_1' } })
  mocks.requireUser.mockResolvedValue(COMPANY_ADMIN)
  mocks.requireModuleEnabled.mockResolvedValue(undefined)
  mocks.hasPermission.mockReturnValue(true)
  mocks.prisma.$transaction.mockImplementation(
    async (run: (client: typeof mocks.tx) => unknown) => run(mocks.tx)
  )
  mocks.prisma.expense.findFirst.mockResolvedValue(expenseRow())
  mocks.prisma.expense.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.approval.findMany.mockResolvedValue([{ id: 'approval_1', currentStatus: 'PENDING' }])
  mocks.prisma.approval.findFirst.mockResolvedValue(approvalRow())
  mocks.prisma.approval.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.approvalTimeline.create.mockResolvedValue({ id: 'timeline_1' })
})

describe('POST /api/expenses/[id]/approve derives the approval from an exact tenant scope', () => {
  it('resolves the expense in the caller company and the approval on that exact company and site', async () => {
    const response = await approveExpense(
      postRequest('http://localhost/api/expenses/expense_1/approve'),
      routeParams('expense_1')
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })

    expect(mocks.prisma.expense.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'expense_1', companyId: 'company_1', deletedAt: null }),
      })
    )
    expect(mocks.prisma.approval.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityId: 'expense_1',
          entityType: { in: ['EXPENSE', 'BILL'] },
          companyId: 'company_1',
          siteId: 'site_1',
          deletedAt: null,
        }),
      })
    )
  })

  it('transitions atomically through the conditional gate instead of updating the expense directly', async () => {
    const response = await approveExpense(
      postRequest('http://localhost/api/expenses/expense_1/approve'),
      routeParams('expense_1')
    )

    expect(response.status).toBe(200)
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.approval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'approval_1',
          companyId: 'company_1',
          deletedAt: null,
          currentStatus: { in: OPEN_STATUSES },
        },
        data: expect.objectContaining({ currentStatus: 'APPROVED', approvedById: 'admin_1' }),
      })
    )
    expect(mocks.tx.expense.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'expense_1', companyId: 'company_1', deletedAt: null, siteId: 'site_1' },
      })
    )
    // The bare `expense.update` by id and the raw approval UPDATE are what the bypass was.
    expect(mocks.prisma.expense.update).not.toHaveBeenCalled()
    expect(mocks.prisma.approval.update).not.toHaveBeenCalled()
    expectNoRawSql()
  })

  it('writes exactly one timeline entry and one audit record', async () => {
    await approveExpense(
      postRequest('http://localhost/api/expenses/expense_1/approve'),
      routeParams('expense_1')
    )

    expect(mocks.tx.approvalTimeline.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.approvalTimeline.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 'company_1',
          approvalId: 'approval_1',
          actorUserId: 'admin_1',
          action: 'APPROVED',
          toStatus: 'APPROVED',
        }),
      })
    )
    expect(mocks.logActivity).toHaveBeenCalledTimes(1)
    expect(mocks.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'APPROVE', companyId: 'company_1', recordId: 'expense_1' })
    )
  })

  it('refuses an expense outside the caller company before any lookup or write', async () => {
    mocks.prisma.expense.findFirst.mockResolvedValue(null)

    const response = await approveExpense(
      postRequest('http://localhost/api/expenses/expense_of_another_company/approve'),
      routeParams('expense_of_another_company')
    )

    expect(response.status).toBe(404)
    expect(mocks.prisma.approval.findMany).not.toHaveBeenCalled()
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('never matches a malformed site-null approval row, because the lookup is site exact', async () => {
    // The legacy raw UPDATE matched this row by entityId alone. The scoped lookup cannot
    // see it, so the request fails closed instead of transitioning it.
    mocks.prisma.approval.findMany.mockResolvedValue([])

    const response = await approveExpense(
      postRequest('http://localhost/api/expenses/expense_1/approve'),
      routeParams('expense_1')
    )

    expect(response.status).toBe(404)
    expect(mocks.prisma.approval.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ siteId: 'site_1' }) })
    )
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('refuses a malformed expense that carries no site binding', async () => {
    mocks.prisma.expense.findFirst.mockResolvedValue(expenseRow({ siteId: null }))

    const response = await approveExpense(
      postRequest('http://localhost/api/expenses/expense_1/approve'),
      routeParams('expense_1')
    )

    expect(response.status).toBe(403)
    expect(mocks.prisma.approval.findMany).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('refuses rather than guesses when several open approvals point at the expense', async () => {
    mocks.prisma.approval.findMany.mockResolvedValue([
      { id: 'approval_1', currentStatus: 'PENDING' },
      { id: 'approval_2', currentStatus: 'SUBMITTED' },
    ])

    const response = await approveExpense(
      postRequest('http://localhost/api/expenses/expense_1/approve'),
      routeParams('expense_1')
    )

    expect(response.status).toBe(409)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('refuses an approval that is already processed', async () => {
    mocks.prisma.approval.findMany.mockResolvedValue([{ id: 'approval_1', currentStatus: 'APPROVED' }])

    const response = await approveExpense(
      postRequest('http://localhost/api/expenses/expense_1/approve'),
      routeParams('expense_1')
    )

    expect(response.status).toBe(409)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('refuses a stale principal before touching the database', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    const response = await approveExpense(
      postRequest('http://localhost/api/expenses/expense_1/approve'),
      routeParams('expense_1')
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(mocks.prisma.expense.findFirst).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('refuses a role without the expense approve permission', async () => {
    mocks.requireUser.mockResolvedValue({ ...COMPANY_ADMIN, role: 'SITE_ENGINEER' })
    mocks.hasPermission.mockReturnValue(false)

    const response = await approveExpense(
      postRequest('http://localhost/api/expenses/expense_1/approve'),
      routeParams('expense_1')
    )

    expect(response.status).toBe(403)
    expect(mocks.prisma.expense.findFirst).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('still refuses when the expenses module is disabled for the company', async () => {
    mocks.requireModuleEnabled.mockRejectedValue(new Error('Module EXPENSES is not enabled for this company'))

    const response = await approveExpense(
      postRequest('http://localhost/api/expenses/expense_1/approve'),
      routeParams('expense_1')
    )

    expect(response.status).toBe(403)
    expectNoWrites()
  })

  it('rolls back without audit when the linked expense is unreachable inside the transaction', async () => {
    // The scoped re-resolution inside the transaction is the one that carries a site.
    mocks.prisma.expense.findFirst.mockImplementation(async (args: { where?: Record<string, unknown> }) =>
      args?.where && 'siteId' in args.where ? null : expenseRow()
    )

    const response = await approveExpense(
      postRequest('http://localhost/api/expenses/expense_1/approve'),
      routeParams('expense_1')
    )

    expect(response.status).toBe(404)
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
    expectNoRawSql()
  })

  it('binds the approval lookup to the company of the expense for a SUPER_ADMIN', async () => {
    mocks.requireUser.mockResolvedValue({
      id: 'root_1',
      name: 'Root',
      email: 'root@civiltracker.test',
      role: 'SUPER_ADMIN',
    })
    mocks.prisma.expense.findFirst.mockResolvedValue(
      expenseRow({ id: 'expense_9', companyId: 'company_2', siteId: 'site_9' })
    )
    mocks.prisma.approval.findFirst.mockResolvedValue(
      approvalRow({ id: 'approval_9', companyId: 'company_2', siteId: 'site_9', entityId: 'expense_9' })
    )
    mocks.prisma.approval.findMany.mockResolvedValue([{ id: 'approval_9', currentStatus: 'PENDING' }])

    const response = await approveExpense(
      postRequest('http://localhost/api/expenses/expense_9/approve'),
      routeParams('expense_9')
    )

    expect(response.status).toBe(200)
    expect(mocks.prisma.approval.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 'company_2', siteId: 'site_9' }),
      })
    )
    expect(mocks.tx.expense.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'expense_9', companyId: 'company_2', deletedAt: null, siteId: 'site_9' },
      })
    )
  })
})

describe('POST /api/expenses/[id]/reject derives the approval from an exact tenant scope', () => {
  it('transitions atomically and carries the legacy rationale when the caller sends none', async () => {
    const response = await rejectExpense(
      postRequest('http://localhost/api/expenses/expense_1/reject'),
      routeParams('expense_1')
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
    expect(mocks.tx.approval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'approval_1',
          companyId: 'company_1',
          deletedAt: null,
          currentStatus: { in: OPEN_STATUSES },
        },
        data: expect.objectContaining({
          currentStatus: 'REJECTED',
          rejectedById: 'admin_1',
          rejectionReason: 'Rejected via Bills page',
        }),
      })
    )
    expect(mocks.tx.expense.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'expense_1', companyId: 'company_1', deletedAt: null, siteId: 'site_1' },
        data: expect.objectContaining({ approvalStatus: 'REJECTED', rejectionNote: 'Rejected via Bills page' }),
      })
    )
    expect(mocks.prisma.expense.update).not.toHaveBeenCalled()
    expectNoRawSql()
  })

  it('uses the caller rationale when one is supplied', async () => {
    const response = await rejectExpense(
      postRequest('http://localhost/api/expenses/expense_1/reject', { reason: 'Duplicate bill' }),
      routeParams('expense_1')
    )

    expect(response.status).toBe(200)
    expect(mocks.tx.approval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rejectionReason: 'Duplicate bill' }) })
    )
  })

  it('writes exactly one timeline entry and one audit record', async () => {
    await rejectExpense(
      postRequest('http://localhost/api/expenses/expense_1/reject'),
      routeParams('expense_1')
    )

    expect(mocks.tx.approvalTimeline.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.approvalTimeline.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approvalId: 'approval_1', action: 'REJECTED', toStatus: 'REJECTED' }),
      })
    )
    expect(mocks.logActivity).toHaveBeenCalledTimes(1)
    expect(mocks.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REJECT', companyId: 'company_1', recordId: 'expense_1' })
    )
  })

  it('refuses an expense outside the caller company before any lookup or write', async () => {
    mocks.prisma.expense.findFirst.mockResolvedValue(null)

    const response = await rejectExpense(
      postRequest('http://localhost/api/expenses/expense_of_another_company/reject'),
      routeParams('expense_of_another_company')
    )

    expect(response.status).toBe(404)
    expect(mocks.prisma.approval.findMany).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('never matches a malformed site-null approval row, because the lookup is site exact', async () => {
    mocks.prisma.approval.findMany.mockResolvedValue([])

    const response = await rejectExpense(
      postRequest('http://localhost/api/expenses/expense_1/reject'),
      routeParams('expense_1')
    )

    expect(response.status).toBe(404)
    expect(mocks.prisma.approval.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ siteId: 'site_1' }) })
    )
    expectNoWrites()
  })

  it('refuses rather than guesses when several open approvals point at the expense', async () => {
    mocks.prisma.approval.findMany.mockResolvedValue([
      { id: 'approval_1', currentStatus: 'PENDING' },
      { id: 'approval_2', currentStatus: 'PENDING_REVIEW' },
    ])

    const response = await rejectExpense(
      postRequest('http://localhost/api/expenses/expense_1/reject'),
      routeParams('expense_1')
    )

    expect(response.status).toBe(409)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('refuses a stale principal before touching the database', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Account is inactive'))

    const response = await rejectExpense(
      postRequest('http://localhost/api/expenses/expense_1/reject'),
      routeParams('expense_1')
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expectNoWrites()
  })

  it('refuses a role without the expense reject permission', async () => {
    mocks.requireUser.mockResolvedValue({ ...COMPANY_ADMIN, role: 'SITE_ENGINEER' })
    mocks.hasPermission.mockReturnValue(false)

    const response = await rejectExpense(
      postRequest('http://localhost/api/expenses/expense_1/reject'),
      routeParams('expense_1')
    )

    expect(response.status).toBe(403)
    expect(mocks.prisma.expense.findFirst).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('fails closed when the conditional transition matches nothing', async () => {
    mocks.prisma.approval.updateMany.mockResolvedValue({ count: 0 })

    const response = await rejectExpense(
      postRequest('http://localhost/api/expenses/expense_1/reject'),
      routeParams('expense_1')
    )

    expect(response.status).toBe(409)
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expectNoRawSql()
  })
})
