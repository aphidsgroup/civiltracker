import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for the approve / reject / mark-paid Server Actions found at d1e35c5.
 *
 * Each action loaded the approval first and only then asked whether the live principal
 * may act on its entity type. A Server Action is a public POST endpoint, so an active
 * member whose role holds no approve or disbursement permission at all could probe ids
 * directly: a missing id answered "Approval not found" while an existing one answered
 * "Forbidden: Role … is not authorized", which is an existence oracle across the queue.
 *
 * Now the permission is decided before any approval query, and the approval lookup is
 * pinned to the entity types the principal may action, so a row of another type answers
 * exactly like a missing one.
 *
 * `@/lib/permissions` is the real matrix.
 */
const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    approval: { findFirst: vi.fn(), updateMany: vi.fn() },
    approvalTimeline: { create: vi.fn() },
    expense: { findFirst: vi.fn(), updateMany: vi.fn() },
    salaryRun: { findFirst: vi.fn(), updateMany: vi.fn() },
    dailyProgressReport: { findFirst: vi.fn() },
    material: { findFirst: vi.fn() },
    document: { findFirst: vi.fn() },
    purchaseOrder: { findFirst: vi.fn() },
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

const { approveApprovalAction, rejectApprovalAction, markApprovalPaidAction } = await import('@/actions/approvals')

const SITE = { id: 'site_1', companyId: 'company_1', deletedAt: null }

function approval(id: string, entityType: string, currentStatus = 'PENDING'): Row {
  return {
    id,
    companyId: 'company_1',
    siteId: 'site_1',
    site: SITE,
    entityType,
    entityId: `${id}_entity`,
    currentStatus,
    deletedAt: null,
    title: id,
  }
}

const APPROVALS: Row[] = [
  approval('a_expense', 'EXPENSE'),
  approval('a_dpr', 'DPR'),
  approval('a_salary', 'SALARY_RUN'),
  approval('a_expense_approved', 'EXPENSE', 'APPROVED'),
]

const siteRelation = (row: Row, key: string) => (key === 'site' ? ((row.site as Row | null) ?? null) : undefined)

function principal(role: string) {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId: 'company_1' }
}

/** Active members that hold no approve permission of any entity type. */
const NON_APPROVERS = ['SITE_ENGINEER', 'SUPERVISOR', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'] as const

/** Active members that hold neither `payments.manage` nor `salary.markPaid`. */
const NON_DISBURSERS = ['PROJECT_MANAGER', 'PURCHASE_MANAGER', 'SITE_ENGINEER', 'SUPERVISOR', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'] as const

function expectNoApprovalReadOrWrite() {
  expect(mocks.prisma.approval.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
  expect(mocks.logActivity).not.toHaveBeenCalled()
}

async function errorOf(run: () => Promise<unknown>) {
  try {
    await run()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('expected the action to throw')
}

beforeEach(() => {
  vi.clearAllMocks()
  const approvals = inMemoryDelegate(APPROVALS, siteRelation)
  mocks.prisma.approval.findFirst.mockImplementation(approvals.findFirst)
  mocks.prisma.approval.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.$transaction.mockImplementation(async (run: (tx: typeof mocks.prisma) => unknown) => run(mocks.prisma))
  mocks.prisma.expense.findFirst.mockResolvedValue({ id: 'entity' })
  mocks.prisma.expense.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.salaryRun.findFirst.mockResolvedValue({ id: 'entity' })
  mocks.prisma.salaryRun.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.dailyProgressReport.findFirst.mockResolvedValue({ id: 'entity' })
})

describe('approveApprovalAction permission gate', () => {
  it.each(NON_APPROVERS)('refuses an active %s before any approval query', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    await expect(approveApprovalAction('a_expense', undefined, 'APPROVE')).rejects.toThrow(/^Forbidden/)
    expectNoApprovalReadOrWrite()
  })

  it('answers an existing and a missing id identically for a non-approver', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    const existing = await errorOf(() => approveApprovalAction('a_expense', undefined, 'APPROVE'))
    const missing = await errorOf(() => approveApprovalAction('does_not_exist', undefined, 'APPROVE'))

    expect(existing).toBe(missing)
    expectNoApprovalReadOrWrite()
  })

  it('refuses a demoted principal on the live role even though the approval exists', async () => {
    // The JWT might still say COMPANY_ADMIN; only the live principal counts.
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))

    await expect(approveApprovalAction('a_dpr', undefined, 'APPROVE')).rejects.toThrow(/^Forbidden/)
    expectNoApprovalReadOrWrite()
  })

  it('pins the lookup to the entity types an ACCOUNTANT may approve', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))

    await expect(approveApprovalAction('a_dpr', undefined, 'APPROVE')).rejects.toThrow('Approval not found')
    const where = mocks.prisma.approval.findFirst.mock.calls[0][0].where
    // ACCOUNTANT holds expenses/bills/salary/documents.approve in the real matrix, so DPR
    // (and the other operational types) stays out of the lookup.
    expect(where.entityType).toEqual({ in: ['EXPENSE', 'BILL', 'SALARY_RUN', 'DOCUMENT'] })
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('makes a row of a non-approvable type indistinguishable from a missing id', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))

    const otherType = await errorOf(() => approveApprovalAction('a_dpr', undefined, 'APPROVE'))
    const missing = await errorOf(() => approveApprovalAction('does_not_exist', undefined, 'APPROVE'))

    expect(otherType).toBe('Approval not found')
    expect(otherType).toBe(missing)
  })

  it('still approves an approvable type for a permitted role', async () => {
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER'))

    await expect(approveApprovalAction('a_dpr', undefined, 'APPROVE')).resolves.toEqual({ id: 'a_dpr', currentStatus: 'APPROVED' })
    const where = mocks.prisma.approval.findFirst.mock.calls[0][0].where
    expect(where.entityType).toEqual({ in: ['PURCHASE_ORDER', 'DPR', 'VARIATION', 'DOCUMENT'] })
  })

  it('does not narrow the lookup for a COMPANY_ADMIN, which may approve every type', async () => {
    mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))

    await approveApprovalAction('a_salary', undefined, 'APPROVE')
    expect(mocks.prisma.approval.findFirst.mock.calls[0][0].where).not.toHaveProperty('entityType')
  })
})

describe('rejectApprovalAction permission gate', () => {
  it.each(NON_APPROVERS)('refuses an active %s before any approval query', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    await expect(rejectApprovalAction('a_expense', 'Wrong amount')).rejects.toThrow(/^Forbidden/)
    expectNoApprovalReadOrWrite()
  })

  it('answers an existing and a missing id identically for a non-approver', async () => {
    mocks.requireUser.mockResolvedValue(principal('VENDOR'))

    const existing = await errorOf(() => rejectApprovalAction('a_expense', 'Wrong amount'))
    const missing = await errorOf(() => rejectApprovalAction('does_not_exist', 'Wrong amount'))

    expect(existing).toBe(missing)
    expectNoApprovalReadOrWrite()
  })

  it('makes a row of a non-rejectable type indistinguishable from a missing id', async () => {
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER'))

    const otherType = await errorOf(() => rejectApprovalAction('a_expense', 'Wrong amount'))
    const missing = await errorOf(() => rejectApprovalAction('does_not_exist', 'Wrong amount'))

    expect(otherType).toBe('Approval not found')
    expect(otherType).toBe(missing)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('markApprovalPaidAction permission gate', () => {
  it.each(NON_DISBURSERS)('refuses an active %s before any approval query', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    await expect(markApprovalPaidAction('a_expense_approved', undefined, 'PAID')).rejects.toThrow(/^Forbidden/)
    expectNoApprovalReadOrWrite()
  })

  it('answers an existing and a missing id identically for a non-disburser', async () => {
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER'))

    const existing = await errorOf(() => markApprovalPaidAction('a_expense_approved', undefined, 'PAID'))
    const missing = await errorOf(() => markApprovalPaidAction('does_not_exist', undefined, 'PAID'))

    expect(existing).toBe(missing)
    expectNoApprovalReadOrWrite()
  })

  it('lets an ACCOUNTANT, which holds payments.manage, disburse', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))

    await expect(markApprovalPaidAction('a_expense_approved', undefined, 'PAID')).resolves.toEqual({ id: 'a_expense_approved' })
    expect(mocks.prisma.approval.findFirst.mock.calls[0][0].where).not.toHaveProperty('entityType')
  })
})
