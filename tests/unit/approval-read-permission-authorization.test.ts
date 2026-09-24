import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Same-tenant authorization cover for the three approval *read* actions.
 *
 * `requireUser` and the company predicate only answer "who is this, and which tenant do
 * they belong to". They say nothing about whether the principal may see the approval
 * queue at all. A Server Action is a public POST endpoint, so an active member of the
 * same company whose role carries no `approvals.view` — VENDOR, SUBCONTRACTOR, CLIENT,
 * SUPERVISOR — could invoke these directly and enumerate approval rows, pipeline totals,
 * comment threads, timelines and linked bill attachment URLs, none of which the UI would
 * ever route them to.
 *
 * `@/lib/permissions` is deliberately NOT mocked here: the point of these tests is the
 * real role → permission matrix, not a stubbed answer about it. Denial must land before
 * any Prisma call, so the refusal cannot be inferred from timing or from a row count.
 */
const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    approval: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    approvalTimeline: { create: vi.fn() },
    approvalComment: { create: vi.fn() },
    site: { findFirst: vi.fn() },
    expense: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    salaryRun: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    dailyProgressReport: { findFirst: vi.fn(), findUnique: vi.fn() },
    material: { findFirst: vi.fn(), findUnique: vi.fn() },
    document: { findFirst: vi.fn(), findUnique: vi.fn() },
    purchaseOrder: { findFirst: vi.fn(), findUnique: vi.fn() },
  }

  return {
    requireUser: vi.fn(),
    revalidatePath: vi.fn(),
    logActivity: vi.fn(),
    syncSiteBudget: vi.fn(),
    prisma,
  }
})

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('@/lib/budget', () => ({ syncSiteBudget: mocks.syncSiteBudget }))

const { getApprovalsAction, getApprovalStatsAction, getApprovalByIdAction } = await import(
  '@/actions/approvals'
)

/**
 * Active, same-company roles that the real matrix does not grant `approvals.view`.
 * VENDOR is the reported case; the others share the exact same exposure.
 */
const ROLES_WITHOUT_APPROVAL_READ = ['VENDOR', 'SUBCONTRACTOR', 'CLIENT', 'SUPERVISOR'] as const

/** Roles the matrix does grant `approvals.view`, which must keep working unchanged. */
const ROLES_WITH_APPROVAL_READ = [
  'COMPANY_ADMIN',
  'PROJECT_MANAGER',
  'ACCOUNTANT',
  'PURCHASE_MANAGER',
  'SITE_ENGINEER',
] as const

function principal(role: string, companyId: string | undefined = 'company_1') {
  return { id: 'user_1', name: 'Member', email: 'member@acme.test', role, companyId }
}

/** No approval data may be read, counted or aggregated on any delegate. */
function expectNoApprovalReads() {
  expect(mocks.prisma.approval.findMany).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.findUnique).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.count).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.aggregate).not.toHaveBeenCalled()
  expect(mocks.prisma.expense.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.salaryRun.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.dailyProgressReport.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.material.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.document.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.purchaseOrder.findFirst).not.toHaveBeenCalled()
}

/** The site-binding predicate every well-formed list/count read composes. */
const WELL_FORMED_SITE_PREDICATE = {
  OR: [{ siteId: { not: null } }, { entityType: { in: ['PURCHASE_ORDER'] } }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.approval.findMany.mockResolvedValue([])
  mocks.prisma.approval.count.mockResolvedValue(0)
  mocks.prisma.approval.aggregate.mockResolvedValue({ _sum: { amount: null } })
  mocks.prisma.approval.findFirst.mockResolvedValue({
    id: 'approval_1',
    companyId: 'company_1',
    siteId: 'site_1',
    entityType: 'EXPENSE',
    entityId: 'expense_1',
    currentStatus: 'PENDING',
    title: 'Expense',
  })
  mocks.prisma.expense.findFirst.mockResolvedValue({ id: 'expense_1', billAttachments: [] })
})

describe('getApprovalsAction requires approvals.view', () => {
  it.each(ROLES_WITHOUT_APPROVAL_READ)(
    'denies an active same-company %s before any Prisma query',
    async (role) => {
      mocks.requireUser.mockResolvedValue(principal(role))

      await expect(getApprovalsAction()).rejects.toThrow(/approvals\.view/)

      expectNoApprovalReads()
    }
  )

  it('denies a role without approvals.view even when it supplies filters', async () => {
    mocks.requireUser.mockResolvedValue(principal('VENDOR'))

    await expect(
      getApprovalsAction({ status: 'PENDING', entityType: 'BILL', search: 'invoice' })
    ).rejects.toThrow(/approvals\.view/)

    expectNoApprovalReads()
  })

  it.each(ROLES_WITH_APPROVAL_READ)(
    'still lists for an authorized %s, scoped to its own tenant',
    async (role) => {
      mocks.requireUser.mockResolvedValue(principal(role))

      await getApprovalsAction({ status: 'PENDING' })

      expect(mocks.prisma.approval.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 'company_1',
            deletedAt: null,
            currentStatus: 'PENDING',
            ...WELL_FORMED_SITE_PREDICATE,
          }),
        })
      )
    }
  )

  it('keeps the cross-company scope for a SUPER_ADMIN', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPER_ADMIN', undefined))

    await getApprovalsAction()

    const where = mocks.prisma.approval.findMany.mock.calls[0][0].where
    expect(where).not.toHaveProperty('companyId')
    expect(where).toMatchObject({ deletedAt: null, ...WELL_FORMED_SITE_PREDICATE })
  })
})

describe('getApprovalStatsAction requires approvals.view', () => {
  it.each(ROLES_WITHOUT_APPROVAL_READ)(
    'denies an active same-company %s before any count or aggregate',
    async (role) => {
      mocks.requireUser.mockResolvedValue(principal(role))

      await expect(getApprovalStatsAction()).rejects.toThrow(/approvals\.view/)

      expectNoApprovalReads()
    }
  )

  it.each(ROLES_WITH_APPROVAL_READ)(
    'still returns pipeline figures for an authorized %s, scoped to its own tenant',
    async (role) => {
      mocks.requireUser.mockResolvedValue(principal(role))
      mocks.prisma.approval.count.mockResolvedValue(3)
      mocks.prisma.approval.aggregate.mockResolvedValue({ _sum: { amount: 1250 } })

      const stats = await getApprovalStatsAction()

      expect(stats).toEqual({ pending: 3, urgent: 3, approvedWeek: 3, pendingAmount: 1250 })
      for (const call of mocks.prisma.approval.count.mock.calls) {
        expect(call[0].where).toMatchObject({
          companyId: 'company_1',
          deletedAt: null,
          ...WELL_FORMED_SITE_PREDICATE,
        })
      }
      expect(mocks.prisma.approval.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 'company_1',
            deletedAt: null,
            ...WELL_FORMED_SITE_PREDICATE,
          }),
        })
      )
    }
  )

  it('keeps the cross-company scope for a SUPER_ADMIN', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPER_ADMIN', undefined))

    await getApprovalStatsAction()

    for (const call of mocks.prisma.approval.count.mock.calls) {
      expect(call[0].where).not.toHaveProperty('companyId')
    }
  })
})

describe('getApprovalByIdAction requires approvals.view', () => {
  it.each(ROLES_WITHOUT_APPROVAL_READ)(
    'denies an active same-company %s before the approval row is fetched',
    async (role) => {
      mocks.requireUser.mockResolvedValue(principal(role))

      await expect(getApprovalByIdAction('approval_1')).rejects.toThrow(/approvals\.view/)

      expectNoApprovalReads()
    }
  )

  // The detail read carries the comment thread, the timeline and — for a bill — the
  // attachment URLs, so the refusal must not leak existence either.
  it('does not disclose whether the approval exists to a VENDOR', async () => {
    mocks.requireUser.mockResolvedValue(principal('VENDOR'))

    await expect(getApprovalByIdAction('approval_1')).rejects.toThrow(/approvals\.view/)
    await expect(getApprovalByIdAction('no_such_approval')).rejects.toThrow(/approvals\.view/)

    expectNoApprovalReads()
  })

  it.each(ROLES_WITH_APPROVAL_READ)(
    'still resolves the detail for an authorized %s, scoped to its own tenant',
    async (role) => {
      mocks.requireUser.mockResolvedValue(principal(role))

      const result = await getApprovalByIdAction('approval_1')

      expect(mocks.prisma.approval.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'approval_1', companyId: 'company_1', deletedAt: null },
        })
      )
      expect(result.entityData).toEqual({ id: 'expense_1', billAttachments: [] })
    }
  )

  it('keeps the cross-company scope for a SUPER_ADMIN', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPER_ADMIN', undefined))

    await getApprovalByIdAction('approval_1')

    expect(mocks.prisma.approval.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'approval_1', deletedAt: null } })
    )
  })

  // The permission gate is additive: it must not displace the malformed-row guard.
  it('still refuses a malformed site-null approval for an authorized reader', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))
    mocks.prisma.approval.findFirst.mockResolvedValue({
      id: 'legacy_approval',
      companyId: 'company_1',
      siteId: null,
      entityType: 'EXPENSE',
      entityId: 'expense_1',
      currentStatus: 'PENDING',
      title: 'Legacy',
    })

    await expect(getApprovalByIdAction('legacy_approval')).rejects.toThrow(/site/i)

    expect(mocks.prisma.expense.findFirst).not.toHaveBeenCalled()
  })
})
