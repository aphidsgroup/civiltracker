import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    approval: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    approvalTimeline: { create: vi.fn() },
    expense: { findFirst: vi.fn(), updateMany: vi.fn() },
    salaryRun: { findFirst: vi.fn(), updateMany: vi.fn() },
  }

  // The disbursement writes now run on an interactive transaction client. Its delegates
  // forward to the shared spies, so the negative assertions below still fail if a write
  // is issued on either client, while the positive ones pin the write to `tx`.
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
  }

  return {
    requireUser: vi.fn(),
    hasPermission: vi.fn(),
    revalidatePath: vi.fn(),
    logActivity: vi.fn(),
    prisma,
    tx,
  }
})

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/permissions', () => ({ hasPermission: mocks.hasPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))

const { markApprovalPaidAction } = await import('@/actions/approvals')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({ id: 'accountant_1', name: 'Accountant', email: 'a@acme.test', role: 'ACCOUNTANT', companyId: 'company_1' })
  mocks.hasPermission.mockReturnValue(false)
  mocks.prisma.$transaction.mockImplementation(
    async (run: (client: typeof mocks.tx) => unknown) => run(mocks.tx)
  )
  // EXPENSE is site bound, so a well formed approval for one always carries its site.
  mocks.prisma.approval.findUnique.mockResolvedValue({ id: 'approval_1', companyId: 'company_1', siteId: 'site_1', currentStatus: 'APPROVED', entityType: 'EXPENSE', entityId: 'expense_1', title: 'Expense' })
  mocks.prisma.approval.findFirst.mockResolvedValue({ id: 'approval_1', companyId: 'company_1', siteId: 'site_1', currentStatus: 'APPROVED', entityType: 'EXPENSE', entityId: 'expense_1', title: 'Expense' })
  mocks.prisma.approval.update.mockResolvedValue({ id: 'approval_1' })
  mocks.prisma.approval.updateMany.mockResolvedValue({ count: 1 })
  // The action now requires each write inside the transaction to reach exactly one row,
  // so the happy path has to report a single linked record.
  mocks.prisma.approvalTimeline.create.mockResolvedValue({ id: 'timeline_1' })
  mocks.prisma.expense.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.salaryRun.updateMany.mockResolvedValue({ count: 1 })
  // The disbursement re-resolves the linked entity on the transaction client before it
  // transitions, so the happy path has to find it inside the approval tenant and site.
  mocks.prisma.expense.findFirst.mockResolvedValue({ id: 'expense_1' })
  mocks.prisma.salaryRun.findFirst.mockResolvedValue({ id: 'salary_1' })
})

describe('markApprovalPaidAction tenant authorization', () => {
  it('scopes an approval lookup to the live caller company before payment mutation', async () => {
    await markApprovalPaidAction('approval_1', undefined, 'PAID')

    expect(mocks.prisma.approval.findFirst).toHaveBeenCalledWith({ where: { id: 'approval_1', companyId: 'company_1', deletedAt: null } })
    expect(mocks.tx.approval.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'approval_1', companyId: 'company_1', deletedAt: null, currentStatus: 'APPROVED' },
    }))
    // The company predicate has to be carried by the transactional write itself, not by
    // a second unscoped write on the global client.
    expect(mocks.prisma.approval.updateMany).toHaveBeenCalledTimes(1)
  })

  it('allows only the current SUPER_ADMIN principal to bypass a company predicate', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'super_1', name: 'Super', email: 'super@test', role: 'SUPER_ADMIN' })

    await markApprovalPaidAction('approval_1', undefined, 'PAID')

    expect(mocks.prisma.approval.findFirst).toHaveBeenCalledWith({ where: { id: 'approval_1', deletedAt: null } })
  })

  it('scopes linked expense and salary mutations to the fetched approval company and site', async () => {
    await markApprovalPaidAction('approval_1', undefined, 'PAID')
    expect(mocks.tx.expense.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'expense_1', companyId: 'company_1', deletedAt: null, siteId: 'site_1' },
    }))
    expect(mocks.prisma.expense.updateMany).toHaveBeenCalledTimes(1)

    mocks.prisma.approval.findFirst.mockResolvedValue({ id: 'approval_2', companyId: 'company_1', siteId: 'site_1', currentStatus: 'APPROVED', entityType: 'SALARY_RUN', entityId: 'salary_1', title: 'Salary' })
    await markApprovalPaidAction('approval_2', undefined, 'PAID')
    expect(mocks.tx.salaryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'salary_1', companyId: 'company_1', siteId: 'site_1' },
    }))
    expect(mocks.prisma.salaryRun.updateMany).toHaveBeenCalledTimes(1)
  })

  // A site-bound approval with no site would disburse against a record on any site of
  // the company, so it must be refused before the PAID transition.
  it.each(['EXPENSE', 'SALARY_RUN'])('refuses to disburse a site-null %s approval', async (entityType) => {
    mocks.prisma.approval.findFirst.mockResolvedValue({ id: 'legacy_1', companyId: 'company_1', siteId: null, currentStatus: 'APPROVED', entityType, entityId: 'entity_1', title: 'Legacy request' })

    await expect(markApprovalPaidAction('legacy_1', undefined, 'PAID')).rejects.toThrow(/site/i)
    // Refused before the transition means no transaction is opened at all.
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.prisma.approval.update).not.toHaveBeenCalled()
    expect(mocks.prisma.approval.updateMany).not.toHaveBeenCalled()
    expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
    expect(mocks.prisma.salaryRun.updateMany).not.toHaveBeenCalled()
  })

  it('rejects a non-approved approval without any mutation', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue({ id: 'pending_1', companyId: 'company_1', siteId: 'site_1', currentStatus: 'PENDING', entityType: 'EXPENSE', entityId: 'expense_1', title: 'Pending expense' })

    await expect(markApprovalPaidAction('pending_1', undefined, 'PAID')).rejects.toThrow(/only approved requests can be marked paid/i)
    expect(mocks.prisma.approval.update).not.toHaveBeenCalled()
    expect(mocks.prisma.approval.updateMany).not.toHaveBeenCalled()
    expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
    expect(mocks.prisma.salaryRun.updateMany).not.toHaveBeenCalled()
  })

  it.each(['REJECTED', 'PAID'])('rejects %s approvals without any mutation', async (currentStatus) => {
    mocks.prisma.approval.findFirst.mockResolvedValue({ id: `${currentStatus}_1`, companyId: 'company_1', siteId: 'site_1', currentStatus, entityType: 'EXPENSE', entityId: 'expense_1', title: 'Closed expense' })

    await expect(markApprovalPaidAction(`${currentStatus}_1`, undefined, 'PAID')).rejects.toThrow(/only approved requests can be marked paid/i)
    expect(mocks.prisma.approval.update).not.toHaveBeenCalled()
    expect(mocks.prisma.approval.updateMany).not.toHaveBeenCalled()
    expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
    expect(mocks.prisma.salaryRun.updateMany).not.toHaveBeenCalled()
  })

  it('rejects another company approval without mutating approval or linked records', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(null)
    mocks.prisma.approval.findUnique.mockResolvedValue(null)

    await expect(markApprovalPaidAction('other_company_approval', undefined, 'PAID')).rejects.toThrow(/approval not found/i)
    expect(mocks.prisma.approval.update).not.toHaveBeenCalled()
    expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
    expect(mocks.prisma.salaryRun.updateMany).not.toHaveBeenCalled()
  })
})
