import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Rejecting a SALARY_RUN approval used to close the approval while leaving the linked
 * salary run on whatever status it already held — typically SUBMITTED or APPROVED —
 * so a rejected payroll stayed payable. The linked run must move back with the
 * approval, inside the same transaction and inside the same tenant.
 */
const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    approval: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    approvalTimeline: { create: vi.fn() },
    expense: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    salaryRun: { findFirst: vi.fn(), updateMany: vi.fn() },
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

const { rejectApprovalAction } = await import('@/actions/approvals')

/** The approval's own site, loaded with it: live and owned by the approval company. */
const LIVE_SAME_COMPANY_SITE = { companyId: 'company_1', deletedAt: null }

/** The five members of SalaryRunStatus in prisma/schema.prisma. */
const SALARY_RUN_STATUSES = ['DRAFT', 'SUBMITTED', 'VERIFIED', 'APPROVED', 'PAID']

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({ id: 'user_1', name: 'Admin', email: 'admin@acme.test', role: 'COMPANY_ADMIN', companyId: 'company_1' })
  mocks.hasPermission.mockReturnValue(false)
  mocks.prisma.$transaction.mockImplementation(
    async (run: (client: typeof mocks.tx) => unknown) => run(mocks.tx)
  )
  mocks.prisma.approval.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.expense.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.salaryRun.updateMany.mockResolvedValue({ count: 1 })
  // The rejection re-resolves the linked run on the transaction client before it writes.
  // It resolves by default so that the only thing failing these flows is the scoped
  // `updateMany` a test primes with a zero row count.
  mocks.prisma.salaryRun.findFirst.mockImplementation(
    async ({ where }: { where: { id: string } }) => ({ id: where.id })
  )
  mocks.prisma.approval.findFirst.mockResolvedValue({
    id: 'approval_salary',
    companyId: 'company_1',
    siteId: 'site_1',
    site: LIVE_SAME_COMPANY_SITE,
    currentStatus: 'PENDING',
    entityType: 'SALARY_RUN',
    entityId: 'salary_1',
    title: 'Weekly payroll',
  })
})

describe('rejectApprovalAction linked SALARY_RUN integrity', () => {
  it('moves the linked salary run off an approvable status when the approval is rejected', async () => {
    await rejectApprovalAction('approval_salary', 'Headcount mismatch')

    expect(mocks.prisma.salaryRun.updateMany).toHaveBeenCalledTimes(1)
    const [{ data }] = mocks.prisma.salaryRun.updateMany.mock.calls[0] as [{ data: { status: string } }]
    expect(data.status).not.toBe('APPROVED')
    expect(data.status).not.toBe('PAID')
    expect(data.status).toBe('DRAFT')
  })

  it('never writes a salary run status outside the SalaryRunStatus enum', async () => {
    await rejectApprovalAction('approval_salary', 'Headcount mismatch')

    const [{ data }] = mocks.prisma.salaryRun.updateMany.mock.calls[0] as [{ data: { status: string } }]
    // There is no REJECTED member on SalaryRunStatus; writing one would be a runtime error.
    expect(data.status).not.toBe('REJECTED')
    expect(SALARY_RUN_STATUSES).toContain(data.status)
  })

  it('scopes the linked salary run write by id, company and the approval site', async () => {
    await rejectApprovalAction('approval_salary', 'Headcount mismatch')

    expect(mocks.prisma.salaryRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'salary_1', companyId: 'company_1', siteId: 'site_1' },
      })
    )
  })

  it('drives the linked salary run write through the transaction client', async () => {
    await rejectApprovalAction('approval_salary', 'Headcount mismatch')

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.approval.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.tx.approvalTimeline.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.salaryRun.updateMany).toHaveBeenCalledTimes(1)
    // Nothing reached the database outside the transaction client.
    expect(mocks.prisma.salaryRun.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.approvalTimeline.create).toHaveBeenCalledTimes(1)
  })

  it('rolls the rejection back and skips timeline and audit when the salary run matches no row', async () => {
    mocks.prisma.salaryRun.updateMany.mockResolvedValue({ count: 0 })

    await expect(rejectApprovalAction('approval_salary', 'Headcount mismatch')).rejects.toThrow(/linked salary run/i)

    expect(mocks.tx.salaryRun.updateMany).toHaveBeenCalledTimes(1)
    // The timeline row was only ever issued on the transaction client, so the throw
    // rolls it back together with the approval transition.
    expect(mocks.prisma.approvalTimeline.create).toHaveBeenCalledTimes(
      mocks.tx.approvalTimeline.create.mock.calls.length
    )
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('rolls back rather than touching a salary run in another company or on another site', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue({
      id: 'approval_salary',
      companyId: 'company_1',
      siteId: 'site_1',
      site: LIVE_SAME_COMPANY_SITE,
      currentStatus: 'SUBMITTED',
      entityType: 'SALARY_RUN',
      entityId: 'salary_on_site_2',
      title: 'Payroll from another site',
    })
    mocks.prisma.salaryRun.updateMany.mockResolvedValue({ count: 0 })

    await expect(rejectApprovalAction('approval_salary', 'Wrong site')).rejects.toThrow(/linked salary run/i)

    expect(mocks.prisma.salaryRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'salary_on_site_2', companyId: 'company_1', siteId: 'site_1' },
      })
    )
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })

  it('leaves the expense branch untouched for a salary run rejection', async () => {
    await rejectApprovalAction('approval_salary', 'Headcount mismatch')

    expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
    expect(mocks.logActivity).toHaveBeenCalledTimes(1)
  })
})
