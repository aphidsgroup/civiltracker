import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Disbursement is the one transition that moves money, and it was the last one still
 * running as a sequence of independent writes: the approval flipped to PAID, the
 * timeline entry and the audit record were written, and only then was the linked
 * expense or salary run updated — unscoped by count, outside any transaction. A linked
 * row that had moved out of the approval tenant in the meantime left a PAID approval
 * with an unpaid entity and an audit trail claiming otherwise.
 *
 * These tests pin the transition, the timeline entry and the linked mutation to one
 * unit of work, require the linked write to match exactly one row, and keep every
 * external effect (audit, revalidation) strictly after the commit.
 */
const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    approval: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    approvalTimeline: { create: vi.fn() },
    expense: { findFirst: vi.fn(), updateMany: vi.fn() },
    salaryRun: { findFirst: vi.fn(), updateMany: vi.fn() },
  }

  // Delegates on the interactive client forward to the shared spies, so a read or write
  // issued on the global client instead of `tx` never reaches `mocks.tx`.
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

/** Company-level row with no site, or a row whose site is live and owned by the approval company. */
const SITE_SCOPE_PREDICATE = {
  OR: [
    { siteId: null, entityType: { in: ['PURCHASE_ORDER'] } },
    { site: { is: { deletedAt: null, companyId: 'company_1' } } },
  ],
}

function approvedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'approval_1',
    companyId: 'company_1',
    siteId: 'site_1',
    // The approval's own site, loaded with it: live and owned by the approval company.
    site: { companyId: 'company_1', deletedAt: null },
    currentStatus: 'APPROVED',
    entityType: 'EXPENSE',
    entityId: 'expense_1',
    title: 'Site expense',
    ...overrides,
  }
}

/** Nothing observable outside the database may survive a failed disbursement. */
function expectNoExternalEffects() {
  expect(mocks.logActivity).not.toHaveBeenCalled()
  expect(mocks.revalidatePath).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({
    id: 'accountant_1',
    name: 'Accountant',
    email: 'a@acme.test',
    role: 'ACCOUNTANT',
    companyId: 'company_1',
  })
  mocks.hasPermission.mockReturnValue(false)
  mocks.prisma.$transaction.mockImplementation(
    async (run: (client: typeof mocks.tx) => unknown) => run(mocks.tx)
  )
  mocks.prisma.approval.findFirst.mockResolvedValue(approvedRow())
  mocks.prisma.approval.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.approvalTimeline.create.mockResolvedValue({ id: 'timeline_1' })
  mocks.prisma.expense.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.salaryRun.updateMany.mockResolvedValue({ count: 1 })
  // Disbursement re-resolves the linked record inside the transaction before it moves.
  mocks.prisma.expense.findFirst.mockResolvedValue({ id: 'expense_1' })
  mocks.prisma.salaryRun.findFirst.mockResolvedValue({ id: 'salary_1' })
})

describe('markApprovalPaidAction runs disbursement as one unit of work', () => {
  it('issues the transition, timeline entry and linked expense write on the transaction client', async () => {
    await markApprovalPaidAction('approval_1', { mode: 'NEFT', ref: 'REF-1' }, 'PAID')

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.approval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'approval_1',
          companyId: 'company_1',
          deletedAt: null,
          currentStatus: 'APPROVED',
          ...SITE_SCOPE_PREDICATE,
        },
      })
    )
    expect(mocks.tx.approvalTimeline.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.expense.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'expense_1', companyId: 'company_1', deletedAt: null, siteId: 'site_1' },
      })
    )
    // Exactly one call in total means nothing was written on the global client.
    expect(mocks.prisma.approvalTimeline.create).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.expense.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.approval.update).not.toHaveBeenCalled()
  })

  it('moves a linked salary run on the same transaction client', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(
      approvedRow({ entityType: 'SALARY_RUN', entityId: 'salary_1' })
    )

    await markApprovalPaidAction('approval_1', undefined, 'PAID')

    expect(mocks.tx.salaryRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'salary_1', companyId: 'company_1', siteId: 'site_1' },
      })
    )
    expect(mocks.prisma.salaryRun.updateMany).toHaveBeenCalledTimes(1)
  })

  it('keeps audit and revalidation after the commit', async () => {
    await markApprovalPaidAction('approval_1', undefined, 'PAID')

    expect(mocks.logActivity).toHaveBeenCalledTimes(1)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/approvals')
    // The audit record is an external effect: it must not be issued on `tx`.
    expect(mocks.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PAID', companyId: 'company_1', recordId: 'expense_1' })
    )
  })
})

describe('markApprovalPaidAction requires exactly one linked record', () => {
  it('fails when the linked expense is unreachable inside the approval tenant', async () => {
    mocks.prisma.expense.updateMany.mockResolvedValue({ count: 0 })

    await expect(markApprovalPaidAction('approval_1', undefined, 'PAID')).rejects.toThrow(
      /linked expense not found/i
    )
    expectNoExternalEffects()
  })

  it('fails when the linked salary run is unreachable inside the approval tenant', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(
      approvedRow({ entityType: 'SALARY_RUN', entityId: 'salary_1' })
    )
    mocks.prisma.salaryRun.updateMany.mockResolvedValue({ count: 0 })

    await expect(markApprovalPaidAction('approval_1', undefined, 'PAID')).rejects.toThrow(
      /linked salary run not found/i
    )
    expectNoExternalEffects()
  })

  it('fails when the linked write would touch more than one record', async () => {
    mocks.prisma.expense.updateMany.mockResolvedValue({ count: 2 })

    await expect(markApprovalPaidAction('approval_1', undefined, 'PAID')).rejects.toThrow(
      /linked expense not found/i
    )
    expectNoExternalEffects()
  })
})

describe('markApprovalPaidAction leaves no trace when the transition loses the race', () => {
  it('writes no timeline entry, audit record or revalidation', async () => {
    mocks.prisma.approval.updateMany.mockResolvedValue({ count: 0 })

    await expect(markApprovalPaidAction('approval_1', undefined, 'PAID')).rejects.toThrow(
      /no longer approved/i
    )
    expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
    expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
    expectNoExternalEffects()
  })

  it('refuses a wrong confirmation phrase before opening a transaction', async () => {
    await expect(markApprovalPaidAction('approval_1', undefined, 'pay')).rejects.toThrow(/PAID/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.prisma.approval.updateMany).not.toHaveBeenCalled()
    expectNoExternalEffects()
  })
})
