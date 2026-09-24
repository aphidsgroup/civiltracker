import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    site: { findFirst: vi.fn(), findUnique: vi.fn() },
    approval: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    approvalTimeline: { create: vi.fn() },
    approvalComment: { create: vi.fn() },
    expense: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    salaryRun: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    dailyProgressReport: { findFirst: vi.fn(), findUnique: vi.fn() },
    material: { findFirst: vi.fn(), findUnique: vi.fn() },
    document: { findFirst: vi.fn(), findUnique: vi.fn() },
    purchaseOrder: { findFirst: vi.fn(), findUnique: vi.fn() },
  }

  // The interactive transaction client is a distinct object whose delegates forward to
  // the shared mocks, so every assertion below still sees the call while a write issued
  // on the global client instead of `tx` leaves these spies untouched.
  const tx = {
    approval: {
      create: vi.fn((args: unknown) => prisma.approval.create(args)),
      update: vi.fn((args: unknown) => prisma.approval.update(args)),
      updateMany: vi.fn((args: unknown) => prisma.approval.updateMany(args)),
    },
    approvalTimeline: { create: vi.fn((args: unknown) => prisma.approvalTimeline.create(args)) },
    expense: {
      findFirst: vi.fn((args: unknown) => prisma.expense.findFirst(args)),
      update: vi.fn((args: unknown) => prisma.expense.update(args)),
      updateMany: vi.fn((args: unknown) => prisma.expense.updateMany(args)),
    },
    salaryRun: {
      findFirst: vi.fn((args: unknown) => prisma.salaryRun.findFirst(args)),
      updateMany: vi.fn((args: unknown) => prisma.salaryRun.updateMany(args)),
    },
    // Every transition re-resolves its linked entity on the transaction client, so the
    // read-only delegates have to exist on `tx` too.
    dailyProgressReport: { findFirst: vi.fn((args: unknown) => prisma.dailyProgressReport.findFirst(args)) },
    material: { findFirst: vi.fn((args: unknown) => prisma.material.findFirst(args)) },
    document: { findFirst: vi.fn((args: unknown) => prisma.document.findFirst(args)) },
    purchaseOrder: { findFirst: vi.fn((args: unknown) => prisma.purchaseOrder.findFirst(args)) },
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
  createApprovalAction,
  getApprovalByIdAction,
  approveApprovalAction,
  rejectApprovalAction,
} = await import('@/actions/approvals')

const OPEN_STATUSES = ['PENDING', 'SUBMITTED', 'PENDING_REVIEW']

/** Company-level row with no site, or a row whose site is live. */
const SITE_SCOPE_PREDICATE = {
  OR: [
    { siteId: null, entityType: { in: ['PURCHASE_ORDER'] } },
    { site: { is: { deletedAt: null } } },
  ],
}

function expectNoApprovalMutations() {
  expect(mocks.prisma.approval.create).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.update).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
  expect(mocks.logActivity).not.toHaveBeenCalled()
  expect(mocks.prisma.expense.update).not.toHaveBeenCalled()
  expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.salaryRun.updateMany).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({ id: 'user_1', name: 'Admin', email: 'admin@acme.test', role: 'COMPANY_ADMIN', companyId: 'company_1' })
  mocks.hasPermission.mockReturnValue(false)
  mocks.prisma.$transaction.mockImplementation(
    async (run: (client: typeof mocks.tx) => unknown) => run(mocks.tx)
  )
  mocks.prisma.site.findFirst.mockResolvedValue({ id: 'site_1', companyId: 'company_1' })
  mocks.prisma.approval.create.mockResolvedValue({ id: 'approval_new' })
  mocks.prisma.approval.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.approval.update.mockResolvedValue({ id: 'approval_1' })
  mocks.prisma.expense.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.salaryRun.updateMany.mockResolvedValue({ count: 1 })
  // Each transition resolves its linked entity inside the transaction before it moves,
  // so every delegate resolves by default and only the case under test can refuse.
  mocks.prisma.expense.findFirst.mockResolvedValue({ id: 'expense_1' })
  mocks.prisma.salaryRun.findFirst.mockResolvedValue({ id: 'salary_1' })
  mocks.prisma.dailyProgressReport.findFirst.mockResolvedValue({ id: 'dpr_1' })
  mocks.prisma.material.findFirst.mockResolvedValue({ id: 'material_1' })
  mocks.prisma.document.findFirst.mockResolvedValue({ id: 'document_1' })
  mocks.prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'po_1' })
})

describe('createApprovalAction entity tenant binding', () => {
  // The COMPANY_ADMIN principal holds approvals.view and every submit permission, so the
  // create gate lets it through and tenant binding is what is under test here.
  beforeEach(() => {
    mocks.hasPermission.mockReturnValue(true)
  })

  it('rejects an entity that is not bound to the resolved company, before any write', async () => {
    mocks.prisma.expense.findFirst.mockResolvedValue(null)

    await expect(
      createApprovalAction({
        siteId: 'site_1',
        entityType: 'EXPENSE',
        entityId: 'other_company_expense',
        title: 'Cross-tenant expense',
      })
    ).rejects.toThrow(/entity not found or access denied/i)

    expect(mocks.prisma.expense.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'other_company_expense', companyId: 'company_1', deletedAt: null, siteId: 'site_1' },
      })
    )
    expectNoApprovalMutations()
  })

  it('requires the entity to match the supplied site when both are site bound', async () => {
    mocks.prisma.dailyProgressReport.findFirst.mockResolvedValue(null)

    await expect(
      createApprovalAction({
        siteId: 'site_1',
        entityType: 'DPR',
        entityId: 'dpr_on_site_2',
        title: 'DPR from another site',
      })
    ).rejects.toThrow(/entity not found or access denied/i)

    expect(mocks.prisma.dailyProgressReport.findFirst).toHaveBeenCalledWith({
      where: { id: 'dpr_on_site_2', companyId: 'company_1', siteId: 'site_1' },
    })
    expectNoApprovalMutations()
  })

  it('rejects the unsupported VARIATION entity type without touching the database', async () => {
    await expect(
      createApprovalAction({
        siteId: 'site_1',
        entityType: 'VARIATION',
        entityId: 'variation_1',
        title: 'Variation request',
      })
    ).rejects.toThrow(/variation/i)

    expectNoApprovalMutations()
  })

  it.each([
    ['EXPENSE', 'expense'],
    ['BILL', 'expense'],
    ['DPR', 'dailyProgressReport'],
    ['MATERIAL_REQUEST', 'material'],
    ['SALARY_RUN', 'salaryRun'],
    ['DOCUMENT', 'document'],
  ] as const)('refuses to bind a site bound %s to a request that carries no site', async (entityType, delegate) => {
    await expect(
      createApprovalAction({
        entityType,
        entityId: 'site_bound_entity',
        title: 'Site bound entity without a site',
      })
    ).rejects.toThrow(/site/i)

    expect(mocks.prisma[delegate].findFirst).not.toHaveBeenCalled()
    expectNoApprovalMutations()
  })

  it('still allows a company level PURCHASE_ORDER request without a site', async () => {
    mocks.prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'po_1', companyId: 'company_1' })

    await createApprovalAction({
      entityType: 'PURCHASE_ORDER',
      entityId: 'po_1',
      title: 'Purchase order',
    })

    expect(mocks.prisma.purchaseOrder.findFirst).toHaveBeenCalledWith({
      where: { id: 'po_1', companyId: 'company_1' },
    })
    expect(mocks.prisma.approval.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ siteId: null, entityId: 'po_1' }) })
    )
  })

  it('creates the approval once the entity resolves inside the tenant', async () => {
    mocks.prisma.dailyProgressReport.findFirst.mockResolvedValue({ id: 'dpr_1', companyId: 'company_1', siteId: 'site_1' })

    await createApprovalAction({
      siteId: 'site_1',
      entityType: 'DPR',
      entityId: 'dpr_1',
      title: 'DPR',
    })

    expect(mocks.prisma.approval.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ companyId: 'company_1', siteId: 'site_1', entityId: 'dpr_1' }) })
    )
    expect(mocks.prisma.approvalTimeline.create).toHaveBeenCalledTimes(1)
  })
})

describe('getApprovalByIdAction tenant scoping', () => {
  // The COMPANY_ADMIN principal holds approvals.view, so the read gate lets it through and
  // tenant scoping is what is under test. Every other permission stays denied.
  beforeEach(() => {
    mocks.hasPermission.mockImplementation((_role: unknown, permission: string) => permission === 'approvals.view')
  })

  it('excludes soft deleted approvals from the tenant scoped lookup', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(null)

    await expect(getApprovalByIdAction('approval_1')).rejects.toThrow(/not found or access denied/i)

    expect(mocks.prisma.approval.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'approval_1',
          companyId: 'company_1',
          deletedAt: null,
          ...SITE_SCOPE_PREDICATE,
        },
      })
    )
  })

  it('resolves the linked entity through company and site predicates rather than findUnique', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue({
      id: 'approval_1',
      companyId: 'company_1',
      siteId: 'site_1',
      entityType: 'EXPENSE',
      entityId: 'expense_1',
    })
    mocks.prisma.expense.findFirst.mockResolvedValue({ id: 'expense_1', billAttachments: [] })

    const result = await getApprovalByIdAction('approval_1')

    expect(mocks.prisma.expense.findUnique).not.toHaveBeenCalled()
    expect(mocks.prisma.expense.findFirst).toHaveBeenCalledWith({
      where: { id: 'expense_1', companyId: 'company_1', deletedAt: null, siteId: 'site_1' },
      include: { billAttachments: true },
    })
    expect(result.entityData).toEqual({ id: 'expense_1', billAttachments: [] })
  })

  it('omits the site predicate only for the company level PURCHASE_ORDER entity', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue({
      id: 'approval_2',
      companyId: 'company_1',
      siteId: null,
      entityType: 'PURCHASE_ORDER',
      entityId: 'po_1',
    })
    mocks.prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'po_1', companyId: 'company_1' })

    await getApprovalByIdAction('approval_2')

    expect(mocks.prisma.purchaseOrder.findUnique).not.toHaveBeenCalled()
    expect(mocks.prisma.purchaseOrder.findFirst).toHaveBeenCalledWith({
      where: { id: 'po_1', companyId: 'company_1' },
    })
  })

  // A site-bound entity on a site-null approval used to reach a company-wide lookup,
  // which resolves the record on any site of the company.
  it('refuses a legacy SALARY_RUN approval that carries no site instead of widening the lookup', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue({
      id: 'approval_3',
      companyId: 'company_1',
      siteId: null,
      entityType: 'SALARY_RUN',
      entityId: 'salary_1',
    })

    await expect(getApprovalByIdAction('approval_3')).rejects.toThrow(/site/i)

    expect(mocks.prisma.salaryRun.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.salaryRun.findUnique).not.toHaveBeenCalled()
  })
})

describe('approveApprovalAction atomic tenant bound transition', () => {
  beforeEach(() => {
    mocks.prisma.approval.findFirst.mockResolvedValue({
      id: 'approval_1',
      companyId: 'company_1',
      siteId: 'site_1',
      currentStatus: 'PENDING',
      entityType: 'EXPENSE',
      entityId: 'expense_1',
      title: 'Expense',
    })
    mocks.prisma.expense.findFirst.mockResolvedValue({ id: 'expense_1', siteId: 'site_1' })
  })

  it('scopes the approval lookup to the live tenant and excludes soft deleted rows', async () => {
    await approveApprovalAction('approval_1', undefined, 'APPROVE')

    expect(mocks.prisma.approval.findFirst).toHaveBeenCalledWith({
      where: { id: 'approval_1', companyId: 'company_1', deletedAt: null, ...SITE_SCOPE_PREDICATE },
    })
  })

  it('transitions atomically from open statuses only, inside the approval tenant', async () => {
    await approveApprovalAction('approval_1', undefined, 'APPROVE')

    expect(mocks.prisma.approval.update).not.toHaveBeenCalled()
    expect(mocks.prisma.approval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'approval_1',
          companyId: 'company_1',
          deletedAt: null,
          currentStatus: { in: OPEN_STATUSES },
          ...SITE_SCOPE_PREDICATE,
        },
      })
    )
  })

  it('aborts before timeline, audit and linked writes when the atomic transition loses the race', async () => {
    mocks.prisma.approval.updateMany.mockResolvedValue({ count: 0 })

    await expect(approveApprovalAction('approval_1', undefined, 'APPROVE')).rejects.toThrow(/no longer/i)

    expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.prisma.expense.update).not.toHaveBeenCalled()
    expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
    expect(mocks.prisma.salaryRun.updateMany).not.toHaveBeenCalled()
  })

  it('scopes the linked expense update by company, soft delete and approval site', async () => {
    await approveApprovalAction('approval_1', undefined, 'APPROVE')

    expect(mocks.prisma.expense.update).not.toHaveBeenCalled()
    expect(mocks.prisma.expense.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'expense_1', companyId: 'company_1', deletedAt: null, siteId: 'site_1' },
      })
    )
  })

  it('scopes the linked salary run update by company and approval site', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue({
      id: 'approval_2',
      companyId: 'company_1',
      siteId: 'site_1',
      currentStatus: 'SUBMITTED',
      entityType: 'SALARY_RUN',
      entityId: 'salary_1',
      title: 'Salary',
    })

    await approveApprovalAction('approval_2', undefined, 'APPROVE')

    expect(mocks.prisma.salaryRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'salary_1', companyId: 'company_1', siteId: 'site_1' },
      })
    )
  })

  it('denies a cross tenant approval before any mutation', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(null)

    await expect(approveApprovalAction('other_company_approval', undefined, 'APPROVE')).rejects.toThrow(/approval not found/i)

    expectNoApprovalMutations()
  })
})

describe('rejectApprovalAction atomic tenant bound transition', () => {
  beforeEach(() => {
    mocks.prisma.approval.findFirst.mockResolvedValue({
      id: 'approval_1',
      companyId: 'company_1',
      siteId: 'site_1',
      currentStatus: 'PENDING',
      entityType: 'EXPENSE',
      entityId: 'expense_1',
      title: 'Expense',
    })
  })

  it('scopes the approval lookup to the live tenant and excludes soft deleted rows', async () => {
    await rejectApprovalAction('approval_1', 'Not budgeted')

    expect(mocks.prisma.approval.findFirst).toHaveBeenCalledWith({
      where: { id: 'approval_1', companyId: 'company_1', deletedAt: null, ...SITE_SCOPE_PREDICATE },
    })
  })

  it('transitions atomically from open statuses only, inside the approval tenant', async () => {
    await rejectApprovalAction('approval_1', 'Not budgeted')

    expect(mocks.prisma.approval.update).not.toHaveBeenCalled()
    expect(mocks.prisma.approval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'approval_1',
          companyId: 'company_1',
          deletedAt: null,
          currentStatus: { in: OPEN_STATUSES },
          ...SITE_SCOPE_PREDICATE,
        },
      })
    )
  })

  it('aborts before timeline, audit and linked writes when the atomic transition loses the race', async () => {
    mocks.prisma.approval.updateMany.mockResolvedValue({ count: 0 })

    await expect(rejectApprovalAction('approval_1', 'Not budgeted')).rejects.toThrow(/no longer/i)

    expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
  })

  it('scopes the linked expense update by company, soft delete and approval site', async () => {
    await rejectApprovalAction('approval_1', 'Not budgeted')

    expect(mocks.prisma.expense.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'expense_1', companyId: 'company_1', deletedAt: null, siteId: 'site_1' },
      })
    )
  })

  it('denies a cross tenant approval before any mutation', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(null)

    await expect(rejectApprovalAction('other_company_approval', 'Not budgeted')).rejects.toThrow(/approval not found/i)

    expectNoApprovalMutations()
  })
})

describe('linked entity writes are atomic with the approval transition', () => {
  beforeEach(() => {
    mocks.prisma.approval.findFirst.mockResolvedValue({
      id: 'approval_1',
      companyId: 'company_1',
      siteId: 'site_1',
      currentStatus: 'PENDING',
      entityType: 'EXPENSE',
      entityId: 'expense_1',
      title: 'Expense',
    })
  })

  function expectNoPostTransactionEffects() {
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  }

  it('drives the approve transition, timeline and linked expense write through the transaction client', async () => {
    await approveApprovalAction('approval_1', undefined, 'APPROVE')

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.approval.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.tx.approvalTimeline.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.expense.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.syncSiteBudget).toHaveBeenCalledWith('site_1')
  })

  it('drives the reject transition, timeline and linked expense write through the transaction client', async () => {
    await rejectApprovalAction('approval_1', 'Not budgeted')

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.approval.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.tx.approvalTimeline.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.expense.updateMany).toHaveBeenCalledTimes(1)
  })

  it('rolls the approval back when the linked expense update matches no row', async () => {
    mocks.prisma.expense.updateMany.mockResolvedValue({ count: 0 })

    await expect(approveApprovalAction('approval_1', undefined, 'APPROVE')).rejects.toThrow(/linked expense/i)

    expect(mocks.tx.expense.updateMany).toHaveBeenCalledTimes(1)
    expectNoPostTransactionEffects()
  })

  it('rolls the approval back when the linked salary run update matches no row', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue({
      id: 'approval_2',
      companyId: 'company_1',
      siteId: 'site_1',
      currentStatus: 'SUBMITTED',
      entityType: 'SALARY_RUN',
      entityId: 'salary_1',
      title: 'Salary',
    })
    mocks.prisma.salaryRun.updateMany.mockResolvedValue({ count: 0 })

    await expect(approveApprovalAction('approval_2', undefined, 'APPROVE')).rejects.toThrow(/linked salary run/i)

    expect(mocks.tx.salaryRun.updateMany).toHaveBeenCalledTimes(1)
    expectNoPostTransactionEffects()
  })

  it('rolls the rejection back when the linked expense update matches no row', async () => {
    mocks.prisma.expense.updateMany.mockResolvedValue({ count: 0 })

    await expect(rejectApprovalAction('approval_1', 'Not budgeted')).rejects.toThrow(/linked expense/i)

    expect(mocks.tx.expense.updateMany).toHaveBeenCalledTimes(1)
    expectNoPostTransactionEffects()
  })
})
