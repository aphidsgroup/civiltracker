import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Route-level cover for the approval REST surface. The server actions were hardened
 * first, but the API handlers reimplemented the workflow with their own, far more
 * permissive rules: a stale JWT was trusted, the linked entity was never resolved
 * inside the approval tenant, a site-bound entity could be attached to a site-null
 * request, and the transition was a bare global `update` with an unscoped linked write.
 *
 * These tests drive the handlers themselves — nothing here mocks `@/actions/approvals`,
 * so the assertions only pass when the route really delegates to the hardened action.
 */
const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    site: { findFirst: vi.fn() },
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
    expense: { updateMany: vi.fn((args: unknown) => prisma.expense.updateMany(args)) },
    salaryRun: { updateMany: vi.fn((args: unknown) => prisma.salaryRun.updateMany(args)) },
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

const { GET: listApprovals, POST: createApproval } = await import('@/app/api/approvals/route')
const { GET: detailApproval } = await import('@/app/api/approvals/[id]/route')
const { POST: approveApproval } = await import('@/app/api/approvals/[id]/approve/route')
const { POST: rejectApproval } = await import('@/app/api/approvals/[id]/reject/route')

const COMPANY_ADMIN = {
  id: 'admin_1',
  name: 'Admin',
  email: 'admin@acme.test',
  role: 'COMPANY_ADMIN',
  companyId: 'company_1',
}

const OPEN_STATUSES = ['PENDING', 'SUBMITTED', 'PENDING_REVIEW']

function postRequest(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function approvalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'approval_1',
    companyId: 'company_1',
    siteId: 'site_1',
    currentStatus: 'PENDING',
    entityType: 'EXPENSE',
    entityId: 'expense_1',
    title: 'Site expense',
    ...overrides,
  }
}

/** No approval row, timeline row, linked row or audit trail may be written. */
function expectNoWrites() {
  expect(mocks.prisma.approval.create).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.update).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
  expect(mocks.prisma.expense.update).not.toHaveBeenCalled()
  expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.salaryRun.updateMany).not.toHaveBeenCalled()
  expect(mocks.logActivity).not.toHaveBeenCalled()
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
  mocks.prisma.approval.findMany.mockResolvedValue([])
  mocks.prisma.approval.findFirst.mockResolvedValue(approvalRow())
  mocks.prisma.approval.create.mockResolvedValue({ id: 'approval_new' })
  mocks.prisma.approval.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.approvalTimeline.create.mockResolvedValue({ id: 'timeline_1' })
  mocks.prisma.expense.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.salaryRun.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.site.findFirst.mockResolvedValue({ id: 'site_1', companyId: 'company_1' })
  mocks.prisma.expense.findFirst.mockResolvedValue({ id: 'expense_1', billAttachments: [] })
  mocks.prisma.salaryRun.findFirst.mockResolvedValue({ id: 'salary_1', items: [] })
  mocks.prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'po_1', companyId: 'company_1' })
})

describe('POST /api/approvals validates like the hardened create action', () => {
  it('refuses a site-null site-bound submission before any approval or timeline write', async () => {
    const response = await createApproval(
      postRequest('http://localhost/api/approvals', {
        entityType: 'EXPENSE',
        entityId: 'expense_on_any_site',
        title: 'Expense without a site',
      })
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: expect.stringMatching(/site/i) })
    expect(mocks.prisma.expense.findFirst).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('refuses a submission whose entity does not exist inside the approval tenant and site', async () => {
    mocks.prisma.expense.findFirst.mockResolvedValue(null)

    const response = await createApproval(
      postRequest('http://localhost/api/approvals', {
        siteId: 'site_1',
        entityType: 'EXPENSE',
        entityId: 'expense_of_another_company',
        title: 'Cross tenant expense',
      })
    )

    expect(response.status).toBe(404)
    expectNoWrites()
  })

  it('resolves the linked entity strictly inside the approval company and site', async () => {
    const response = await createApproval(
      postRequest('http://localhost/api/approvals', {
        siteId: 'site_1',
        entityType: 'EXPENSE',
        entityId: 'expense_1',
        title: 'Site expense',
        amount: 5000,
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true, data: { id: 'approval_new' } })
    expect(mocks.prisma.expense.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'expense_1',
          companyId: 'company_1',
          siteId: 'site_1',
          deletedAt: null,
        }),
      })
    )
    expect(mocks.prisma.approval.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 'company_1', siteId: 'site_1', requestedById: 'admin_1' }),
      })
    )
    expect(mocks.prisma.approvalTimeline.create).toHaveBeenCalledTimes(1)
  })

  it('refuses a site that is outside the caller company', async () => {
    mocks.prisma.site.findFirst.mockResolvedValue(null)

    const response = await createApproval(
      postRequest('http://localhost/api/approvals', {
        siteId: 'site_of_another_company',
        entityType: 'EXPENSE',
        entityId: 'expense_1',
        title: 'Cross tenant site',
      })
    )

    expect(response.status).toBe(404)
    expectNoWrites()
  })

  it('refuses the unsupported VARIATION workflow', async () => {
    const response = await createApproval(
      postRequest('http://localhost/api/approvals', {
        siteId: 'site_1',
        entityType: 'VARIATION',
        entityId: 'variation_1',
        title: 'Variation',
      })
    )

    expect(response.status).toBe(400)
    expectNoWrites()
  })

  it('refuses a stale JWT principal before touching the database', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    const response = await createApproval(
      postRequest('http://localhost/api/approvals', {
        siteId: 'site_1',
        entityType: 'EXPENSE',
        entityId: 'expense_1',
        title: 'Site expense',
      })
    )

    expect(response.status).toBe(401)
    expectNoWrites()
  })
})

describe('approval API reads fail closed on malformed legacy rows', () => {
  it('excludes site-null site-bound rows from the list query', async () => {
    const response = await listApprovals(new Request('http://localhost/api/approvals'))

    expect(response.status).toBe(200)
    expect(mocks.prisma.approval.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'company_1',
          deletedAt: null,
          OR: [{ siteId: { not: null } }, { entityType: { in: ['PURCHASE_ORDER'] } }],
        }),
      })
    )
  })

  it('excludes site-null site-bound rows from the detail query', async () => {
    await detailApproval(new Request('http://localhost/api/approvals/approval_1'), routeParams('approval_1'))

    expect(mocks.prisma.approval.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'approval_1',
          companyId: 'company_1',
          deletedAt: null,
          OR: [{ siteId: { not: null } }, { entityType: { in: ['PURCHASE_ORDER'] } }],
        }),
      })
    )
  })

  it('never returns a malformed legacy row that reaches the handler anyway', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(
      approvalRow({ siteId: null, entityType: 'EXPENSE', title: 'Legacy leak' })
    )

    const response = await detailApproval(
      new Request('http://localhost/api/approvals/legacy_1'),
      routeParams('legacy_1')
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.not.toHaveProperty('data')
  })

  it('still details a company level PURCHASE_ORDER approval that has no site', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(
      approvalRow({ siteId: null, entityType: 'PURCHASE_ORDER', entityId: 'po_1' })
    )

    const response = await detailApproval(
      new Request('http://localhost/api/approvals/po_1'),
      routeParams('po_1')
    )

    expect(response.status).toBe(200)
  })
})

describe('POST /api/approvals/[id]/approve uses the hardened transition', () => {
  it('rejects a stale JWT principal before any transition', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Account is inactive'))

    const response = await approveApproval(
      postRequest('http://localhost/api/approvals/approval_1/approve', {}),
      routeParams('approval_1')
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expectNoWrites()
  })

  it('transitions conditionally inside the approval tenant instead of a bare global update', async () => {
    const response = await approveApproval(
      postRequest('http://localhost/api/approvals/approval_1/approve', { note: 'Approved by finance' }),
      routeParams('approval_1')
    )

    expect(response.status).toBe(200)
    expect(mocks.prisma.approval.update).not.toHaveBeenCalled()
    expect(mocks.tx.approval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'approval_1',
          companyId: 'company_1',
          deletedAt: null,
          currentStatus: { in: OPEN_STATUSES },
        },
      })
    )
    expect(mocks.tx.expense.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'expense_1', companyId: 'company_1', deletedAt: null, siteId: 'site_1' },
      })
    )
    expect(mocks.tx.approvalTimeline.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ note: 'Approved by finance' }) })
    )
  })

  it('refuses a malformed site-null site-bound approval before any write', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(approvalRow({ siteId: null }))

    const response = await approveApproval(
      postRequest('http://localhost/api/approvals/legacy_1/approve', {}),
      routeParams('legacy_1')
    )

    expect(response.status).toBe(403)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('refuses an approval outside the caller company', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(null)

    const response = await approveApproval(
      postRequest('http://localhost/api/approvals/other_company_1/approve', {}),
      routeParams('other_company_1')
    )

    expect(response.status).toBe(404)
    expectNoWrites()
  })

  it('refuses a role without the entity approve permission', async () => {
    mocks.requireUser.mockResolvedValue({ ...COMPANY_ADMIN, role: 'SITE_ENGINEER' })
    mocks.hasPermission.mockReturnValue(false)

    const response = await approveApproval(
      postRequest('http://localhost/api/approvals/approval_1/approve', {}),
      routeParams('approval_1')
    )

    expect(response.status).toBe(403)
    expectNoWrites()
  })

  it('refuses an approval that is already closed', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(approvalRow({ currentStatus: 'REJECTED' }))

    const response = await approveApproval(
      postRequest('http://localhost/api/approvals/approval_1/approve', {}),
      routeParams('approval_1')
    )

    expect(response.status).toBe(409)
    expectNoWrites()
  })

  it('fails without audit when the linked expense is outside the approval tenant', async () => {
    mocks.prisma.expense.updateMany.mockResolvedValue({ count: 0 })

    const response = await approveApproval(
      postRequest('http://localhost/api/approvals/approval_1/approve', {}),
      routeParams('approval_1')
    )

    expect(response.status).toBe(404)
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
  })
})

describe('POST /api/approvals/[id]/reject uses the hardened transition', () => {
  it('still demands a rejection rationale', async () => {
    const response = await rejectApproval(
      postRequest('http://localhost/api/approvals/approval_1/reject', { reason: '' }),
      routeParams('approval_1')
    )

    expect(response.status).toBe(400)
    expectNoWrites()
  })

  it('transitions conditionally inside the approval tenant instead of a bare global update', async () => {
    const response = await rejectApproval(
      postRequest('http://localhost/api/approvals/approval_1/reject', { reason: 'Not budgeted' }),
      routeParams('approval_1')
    )

    expect(response.status).toBe(200)
    expect(mocks.prisma.approval.update).not.toHaveBeenCalled()
    expect(mocks.tx.approval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'approval_1',
          companyId: 'company_1',
          deletedAt: null,
          currentStatus: { in: OPEN_STATUSES },
        },
      })
    )
    expect(mocks.tx.expense.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'expense_1', companyId: 'company_1', deletedAt: null, siteId: 'site_1' },
      })
    )
  })

  it('refuses a malformed site-null site-bound approval before any write', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(approvalRow({ siteId: null }))

    const response = await rejectApproval(
      postRequest('http://localhost/api/approvals/legacy_1/reject', { reason: 'Not budgeted' }),
      routeParams('legacy_1')
    )

    expect(response.status).toBe(403)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('moves the linked salary run with the rejection and fails closed when it is unreachable', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(
      approvalRow({ entityType: 'SALARY_RUN', entityId: 'salary_1' })
    )
    mocks.prisma.salaryRun.updateMany.mockResolvedValue({ count: 0 })

    const response = await rejectApproval(
      postRequest('http://localhost/api/approvals/approval_1/reject', { reason: 'Not budgeted' }),
      routeParams('approval_1')
    )

    expect(response.status).toBe(404)
    expect(mocks.tx.salaryRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'salary_1', companyId: 'company_1', siteId: 'site_1' },
      })
    )
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })
})
