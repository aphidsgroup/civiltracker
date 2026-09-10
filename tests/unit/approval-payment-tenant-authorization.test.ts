import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  hasPermission: vi.fn(),
  revalidatePath: vi.fn(),
  logActivity: vi.fn(),
  prisma: {
    approval: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    approvalTimeline: { create: vi.fn() },
    expense: { updateMany: vi.fn() },
    salaryRun: { updateMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/permissions', () => ({ hasPermission: mocks.hasPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))

const { markApprovalPaidAction } = await import('@/actions/approvals')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({ id: 'accountant_1', name: 'Accountant', email: 'a@acme.test', role: 'ACCOUNTANT', companyId: 'company_1' })
  mocks.prisma.approval.findUnique.mockResolvedValue({ id: 'approval_1', companyId: 'company_1', currentStatus: 'APPROVED', entityType: 'EXPENSE', entityId: 'expense_1', title: 'Expense' })
  mocks.prisma.approval.findFirst.mockResolvedValue({ id: 'approval_1', companyId: 'company_1', currentStatus: 'APPROVED', entityType: 'EXPENSE', entityId: 'expense_1', title: 'Expense' })
  mocks.prisma.approval.update.mockResolvedValue({ id: 'approval_1' })
  mocks.prisma.approval.updateMany.mockResolvedValue({ count: 1 })
})

describe('markApprovalPaidAction tenant authorization', () => {
  it('scopes an approval lookup to the live caller company before payment mutation', async () => {
    await markApprovalPaidAction('approval_1', undefined, 'PAID')

    expect(mocks.prisma.approval.findFirst).toHaveBeenCalledWith({ where: { id: 'approval_1', companyId: 'company_1', deletedAt: null } })
    expect(mocks.prisma.approval.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'approval_1', companyId: 'company_1', deletedAt: null, currentStatus: 'APPROVED' },
    }))
  })

  it('allows only the current SUPER_ADMIN principal to bypass a company predicate', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'super_1', name: 'Super', email: 'super@test', role: 'SUPER_ADMIN' })

    await markApprovalPaidAction('approval_1', undefined, 'PAID')

    expect(mocks.prisma.approval.findFirst).toHaveBeenCalledWith({ where: { id: 'approval_1', deletedAt: null } })
  })

  it('scopes linked expense and salary mutations to the fetched approval company', async () => {
    await markApprovalPaidAction('approval_1', undefined, 'PAID')
    expect(mocks.prisma.expense.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'expense_1', companyId: 'company_1' },
    }))

    mocks.prisma.approval.findFirst.mockResolvedValue({ id: 'approval_2', companyId: 'company_1', currentStatus: 'APPROVED', entityType: 'SALARY_RUN', entityId: 'salary_1', title: 'Salary' })
    await markApprovalPaidAction('approval_2', undefined, 'PAID')
    expect(mocks.prisma.salaryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'salary_1', companyId: 'company_1' },
    }))
  })

  it('rejects a non-approved approval without any mutation', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue({ id: 'pending_1', companyId: 'company_1', currentStatus: 'PENDING', entityType: 'EXPENSE', entityId: 'expense_1', title: 'Pending expense' })

    await expect(markApprovalPaidAction('pending_1', undefined, 'PAID')).rejects.toThrow(/only approved requests can be marked paid/i)
    expect(mocks.prisma.approval.update).not.toHaveBeenCalled()
    expect(mocks.prisma.approval.updateMany).not.toHaveBeenCalled()
    expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
    expect(mocks.prisma.salaryRun.updateMany).not.toHaveBeenCalled()
  })

  it.each(['REJECTED', 'PAID'])('rejects %s approvals without any mutation', async (currentStatus) => {
    mocks.prisma.approval.findFirst.mockResolvedValue({ id: `${currentStatus}_1`, companyId: 'company_1', currentStatus, entityType: 'EXPENSE', entityId: 'expense_1', title: 'Closed expense' })

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
