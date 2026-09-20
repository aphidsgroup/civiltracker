import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression cover for approval rows that predate site binding, or that were written
 * straight to the database: `siteId` is null on an entity type that only ever lives
 * under one site. Every read and transition below must refuse such a row before it can
 * resolve or mutate a same-company record on an arbitrary site.
 */
const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    site: { findFirst: vi.fn() },
    approval: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    approvalTimeline: { create: vi.fn() },
    expense: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    salaryRun: { findFirst: vi.fn(), updateMany: vi.fn() },
    dailyProgressReport: { findFirst: vi.fn() },
    material: { findFirst: vi.fn() },
    document: { findFirst: vi.fn() },
    purchaseOrder: { findFirst: vi.fn() },
  }

  const tx = {
    approval: {
      update: vi.fn((args: unknown) => prisma.approval.update(args)),
      updateMany: vi.fn((args: unknown) => prisma.approval.updateMany(args)),
    },
    approvalTimeline: { create: vi.fn((args: unknown) => prisma.approvalTimeline.create(args)) },
    expense: {
      findFirst: vi.fn((args: unknown) => prisma.expense.findFirst(args)),
      update: vi.fn((args: unknown) => prisma.expense.update(args)),
      updateMany: vi.fn((args: unknown) => prisma.expense.updateMany(args)),
    },
    salaryRun: { updateMany: vi.fn((args: unknown) => prisma.salaryRun.updateMany(args)) },
  }

  return {
    requireUser: vi.fn(),
    hasPermission: vi.fn(),
    revalidatePath: vi.fn(),
    logActivity: vi.fn(),
    syncSiteBudget: vi.fn(),
    prisma,
    tx,
  }
})

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/permissions', () => ({ hasPermission: mocks.hasPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('@/lib/budget', () => ({ syncSiteBudget: mocks.syncSiteBudget }))

const {
  getApprovalByIdAction,
  approveApprovalAction,
  rejectApprovalAction,
  markApprovalPaidAction,
} = await import('@/actions/approvals')

/** No approval row, no timeline row, no linked row and no audit trail may be written. */
function expectNoWrites() {
  expect(mocks.prisma.approval.create).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.update).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
  expect(mocks.prisma.expense.update).not.toHaveBeenCalled()
  expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.salaryRun.updateMany).not.toHaveBeenCalled()
  expect(mocks.logActivity).not.toHaveBeenCalled()
  expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
  expect(mocks.revalidatePath).not.toHaveBeenCalled()
}

/** The entity must never even be resolved: a company-only lookup matches any site. */
function expectNoEntityResolution() {
  expect(mocks.prisma.expense.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.salaryRun.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.dailyProgressReport.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.material.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.document.findFirst).not.toHaveBeenCalled()
}

function nullSiteApproval(entityType: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'legacy_approval',
    companyId: 'company_1',
    siteId: null,
    currentStatus: 'PENDING',
    entityType,
    entityId: 'entity_on_any_site',
    title: 'Legacy request without a site',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({ id: 'user_1', name: 'Admin', email: 'admin@acme.test', role: 'COMPANY_ADMIN', companyId: 'company_1' })
  mocks.hasPermission.mockReturnValue(false)
  mocks.prisma.$transaction.mockImplementation(
    async (run: (client: typeof mocks.tx) => unknown) => run(mocks.tx)
  )
  // Every delegate is primed to succeed, so the only thing that can stop these flows
  // is the site-binding guard itself.
  mocks.prisma.approval.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.expense.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.salaryRun.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.expense.findFirst.mockResolvedValue({ id: 'entity_on_any_site', siteId: 'site_9', billAttachments: [] })
  mocks.prisma.salaryRun.findFirst.mockResolvedValue({ id: 'entity_on_any_site', items: [] })
  mocks.prisma.dailyProgressReport.findFirst.mockResolvedValue({ id: 'entity_on_any_site' })
  mocks.prisma.material.findFirst.mockResolvedValue({ id: 'entity_on_any_site' })
  mocks.prisma.document.findFirst.mockResolvedValue({ id: 'entity_on_any_site' })
  mocks.prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'entity_on_any_site', companyId: 'company_1' })
})

const SITE_BOUND_TYPES = ['EXPENSE', 'SALARY_RUN', 'BILL', 'DPR', 'MATERIAL_REQUEST', 'DOCUMENT', 'VARIATION'] as const

describe('getApprovalByIdAction refuses a legacy approval that carries no site', () => {
  it.each(['EXPENSE', 'SALARY_RUN'] as const)(
    'refuses to resolve a malformed site-null %s approval',
    async (entityType) => {
      mocks.prisma.approval.findFirst.mockResolvedValue(nullSiteApproval(entityType))

      await expect(getApprovalByIdAction('legacy_approval')).rejects.toThrow(/site/i)

      expectNoEntityResolution()
      expectNoWrites()
    }
  )

  it.each(SITE_BOUND_TYPES)('refuses a site-null %s approval', async (entityType) => {
    mocks.prisma.approval.findFirst.mockResolvedValue(nullSiteApproval(entityType))

    await expect(getApprovalByIdAction('legacy_approval')).rejects.toThrow(/site/i)

    expectNoEntityResolution()
    expectNoWrites()
  })

  it('still resolves a company level PURCHASE_ORDER approval that has no site', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(nullSiteApproval('PURCHASE_ORDER'))

    const result = await getApprovalByIdAction('legacy_approval')

    expect(mocks.prisma.purchaseOrder.findFirst).toHaveBeenCalledWith({
      where: { id: 'entity_on_any_site', companyId: 'company_1' },
    })
    expect(result.entityData).toEqual({ id: 'entity_on_any_site', companyId: 'company_1' })
  })
})

describe('approveApprovalAction refuses a legacy approval that carries no site', () => {
  it.each(['EXPENSE', 'SALARY_RUN'] as const)(
    'refuses to approve a malformed site-null %s approval before any transition',
    async (entityType) => {
      mocks.prisma.approval.findFirst.mockResolvedValue(nullSiteApproval(entityType))

      await expect(approveApprovalAction('legacy_approval', 'ok', 'APPROVE')).rejects.toThrow(/site/i)

      expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
      expectNoEntityResolution()
      expectNoWrites()
    }
  )

  it.each(SITE_BOUND_TYPES)('refuses to approve a site-null %s approval', async (entityType) => {
    mocks.prisma.approval.findFirst.mockResolvedValue(nullSiteApproval(entityType))

    await expect(approveApprovalAction('legacy_approval', 'ok', 'APPROVE')).rejects.toThrow(/site/i)

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('still approves a company level PURCHASE_ORDER approval that has no site', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(nullSiteApproval('PURCHASE_ORDER'))

    const result = await approveApprovalAction('legacy_approval', undefined, 'APPROVE')

    expect(result).toEqual({ id: 'legacy_approval', currentStatus: 'APPROVED' })
    expect(mocks.prisma.approval.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
    expect(mocks.prisma.salaryRun.updateMany).not.toHaveBeenCalled()
    expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
  })
})

describe('rejectApprovalAction refuses a legacy approval that carries no site', () => {
  it.each(['EXPENSE', 'SALARY_RUN'] as const)(
    'refuses to reject a malformed site-null %s approval before any transition',
    async (entityType) => {
      mocks.prisma.approval.findFirst.mockResolvedValue(nullSiteApproval(entityType))

      await expect(rejectApprovalAction('legacy_approval', 'Not budgeted')).rejects.toThrow(/site/i)

      expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
      expectNoEntityResolution()
      expectNoWrites()
    }
  )

  it.each(SITE_BOUND_TYPES)('refuses to reject a site-null %s approval', async (entityType) => {
    mocks.prisma.approval.findFirst.mockResolvedValue(nullSiteApproval(entityType))

    await expect(rejectApprovalAction('legacy_approval', 'Not budgeted')).rejects.toThrow(/site/i)

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('still rejects a company level PURCHASE_ORDER approval that has no site', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(nullSiteApproval('PURCHASE_ORDER'))

    const result = await rejectApprovalAction('legacy_approval', 'Not budgeted')

    expect(result).toEqual({ id: 'legacy_approval', currentStatus: 'REJECTED' })
    expect(mocks.prisma.approval.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
    expect(mocks.prisma.salaryRun.updateMany).not.toHaveBeenCalled()
  })
})

describe('markApprovalPaidAction refuses a legacy approval that carries no site', () => {
  it.each(['EXPENSE', 'SALARY_RUN'] as const)(
    'refuses to disburse a malformed site-null %s approval before any transition',
    async (entityType) => {
      mocks.prisma.approval.findFirst.mockResolvedValue(
        nullSiteApproval(entityType, { currentStatus: 'APPROVED' })
      )

      await expect(markApprovalPaidAction('legacy_approval', undefined, 'PAID')).rejects.toThrow(/site/i)

      expectNoEntityResolution()
      expectNoWrites()
    }
  )

  it.each(SITE_BOUND_TYPES)('refuses to disburse a site-null %s approval', async (entityType) => {
    mocks.prisma.approval.findFirst.mockResolvedValue(
      nullSiteApproval(entityType, { currentStatus: 'APPROVED' })
    )

    await expect(markApprovalPaidAction('legacy_approval', undefined, 'PAID')).rejects.toThrow(/site/i)

    expectNoWrites()
  })

  it('still disburses a company level PURCHASE_ORDER approval that has no site', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(
      nullSiteApproval('PURCHASE_ORDER', { currentStatus: 'APPROVED' })
    )

    await markApprovalPaidAction('legacy_approval', undefined, 'PAID')

    expect(mocks.prisma.approval.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
    expect(mocks.prisma.salaryRun.updateMany).not.toHaveBeenCalled()
  })
})
