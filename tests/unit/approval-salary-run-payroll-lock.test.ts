import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Approving or marking paid a SALARY_RUN approval moves the run past DRAFT and closes its
 * payroll period. The transition must run as a SERIALIZABLE `payrollTransaction` and read
 * the period (`lockPayrollPeriodForTransition`) on that same client right after the linked
 * run is re-resolved and before the approval or the run changes status, so an attendance
 * or advance write racing it conflicts with the whole transition. Rejection back to DRAFT
 * and every non-salary transition keep the default transaction and read no period.
 *
 * The real lock helper and `payrollTransaction` run here; the transaction client exposes
 * only the delegates the transitions and the helper use.
 */
const mocks = vi.hoisted(() => {
  const calls: string[] = []
  const record = <T>(name: string, impl: () => T) =>
    vi.fn((_args?: unknown) => {
      calls.push(name)
      return impl()
    })

  const tx = {
    approval: { updateMany: record('approval.updateMany', () => Promise.resolve({ count: 1 })) },
    approvalTimeline: { create: record('approvalTimeline.create', () => Promise.resolve({ id: 'timeline_1' })) },
    expense: {
      findFirst: record('expense.findFirst', () => Promise.resolve({ id: 'expense_1' })),
      updateMany: record('expense.updateMany', () => Promise.resolve({ count: 1 })),
    },
    salaryRun: {
      findFirst: vi.fn(),
      updateMany: record('salaryRun.updateMany', () => Promise.resolve({ count: 1 })),
    },
    labourAttendance: { count: record('labourAttendance.count', () => Promise.resolve(0)) },
    labour: { count: record('labour.count', () => Promise.resolve(0)) },
    auditLog: { create: record('auditLog.create', () => Promise.resolve({ id: 'audit_1' })) },
  }

  const prisma = {
    $transaction: vi.fn(),
    approval: { findFirst: vi.fn() },
  }

  return {
    calls,
    tx,
    prisma,
    requireUser: vi.fn(),
    revalidatePath: vi.fn(),
    syncSiteBudget: vi.fn(),
  }
})

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/approvals/module-gate', () => ({ requireApprovalsModule: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/budget', () => ({ syncSiteBudget: mocks.syncSiteBudget }))

const { approveApprovalAction, markApprovalPaidAction, rejectApprovalAction } = await import('@/actions/approvals')

const PERIOD_START = new Date('2026-09-01T00:00:00.000Z')
const PERIOD_END = new Date('2026-09-15T00:00:00.000Z')

/** The linked re-resolution selects only the id; the period read selects the period. */
function salaryRunFindFirst({ select }: { select: Record<string, unknown> }) {
  if ('periodStart' in select) {
    mocks.calls.push('salaryRun.findFirst:period')
    return Promise.resolve({
      siteId: 'site_1',
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      items: [{ labourId: 'labour_1' }],
    })
  }
  mocks.calls.push('salaryRun.findFirst:linked')
  return Promise.resolve({ id: 'salary_1' })
}

function approvalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'approval_1',
    companyId: 'company_1',
    siteId: 'site_1',
    site: { companyId: 'company_1', deletedAt: null },
    currentStatus: 'PENDING',
    entityType: 'SALARY_RUN',
    entityId: 'salary_1',
    title: 'Fortnight payroll',
    ...overrides,
  }
}

const PERIOD_LOCK = ['salaryRun.findFirst:period', 'labourAttendance.count', 'labour.count']
const PERIOD_READS = new Set(PERIOD_LOCK)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.calls.length = 0
  mocks.requireUser.mockResolvedValue({
    id: 'admin_1',
    name: 'Admin',
    email: 'admin@acme.test',
    role: 'COMPANY_ADMIN',
    companyId: 'company_1',
  })
  mocks.prisma.$transaction.mockImplementation(async (run: (client: typeof mocks.tx) => unknown) => run(mocks.tx))
  mocks.tx.salaryRun.findFirst.mockImplementation(salaryRunFindFirst)
  mocks.prisma.approval.findFirst.mockResolvedValue(approvalRow())
})

describe.each([
  {
    name: 'approveApprovalAction',
    status: 'APPROVED',
    row: approvalRow(),
    run: () => approveApprovalAction('approval_1', undefined, 'APPROVE'),
  },
  {
    name: 'markApprovalPaidAction',
    status: 'PAID',
    row: approvalRow({ currentStatus: 'APPROVED' }),
    run: () => markApprovalPaidAction('approval_1', undefined, 'PAID'),
  },
])('$name on a SALARY_RUN approval', ({ status, row, run }) => {
  beforeEach(() => {
    mocks.prisma.approval.findFirst.mockResolvedValue(row)
  })

  it('runs as one SERIALIZABLE payroll transaction', async () => {
    await run()

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' })
  })

  it('reads the period after the linked re-resolution and before any status mutation', async () => {
    await run()

    expect(mocks.calls).toEqual([
      'salaryRun.findFirst:linked',
      ...PERIOD_LOCK,
      'approval.updateMany',
      'approvalTimeline.create',
      'salaryRun.updateMany',
      'auditLog.create',
    ])
    expect(mocks.tx.salaryRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'salary_1', companyId: 'company_1', siteId: 'site_1' },
      data: { status },
    })
  })

  it('reads the period of the exact run binding on the transaction client', async () => {
    await run()

    expect(mocks.tx.salaryRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'salary_1', companyId: 'company_1', siteId: 'site_1' } })
    )
    expect(mocks.tx.labourAttendance.count).toHaveBeenCalledWith({
      where: {
        labour: { companyId: 'company_1' },
        date: { gte: PERIOD_START, lte: PERIOD_END },
        OR: [{ siteId: 'site_1' }, { labourId: { in: ['labour_1'] } }],
      },
    })
    expect(mocks.tx.labour.count).toHaveBeenCalledWith({
      where: { companyId: 'company_1', OR: [{ siteId: 'site_1' }, { id: { in: ['labour_1'] } }] },
    })
  })

  it('reads no period and mutates nothing when the linked run cannot be re-resolved', async () => {
    mocks.tx.salaryRun.findFirst.mockImplementation(() => {
      mocks.calls.push('salaryRun.findFirst:linked')
      return Promise.resolve(null)
    })

    await expect(run()).rejects.toThrow(/linked salary run not found/i)
    expect(mocks.calls).toEqual(['salaryRun.findFirst:linked'])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('retries the whole transition, period read included, after a serialization conflict', async () => {
    mocks.prisma.$transaction
      .mockRejectedValueOnce(Object.assign(new Error('write conflict'), { code: 'P2034' }))
      .mockImplementationOnce(async (fn: (client: typeof mocks.tx) => unknown) => fn(mocks.tx))

    await run()

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2)
    for (const call of mocks.prisma.$transaction.mock.calls) {
      expect(call[1]).toEqual({ isolationLevel: 'Serializable' })
    }
    expect(mocks.calls.filter((name) => PERIOD_READS.has(name))).toEqual(PERIOD_LOCK)
    expect(mocks.tx.salaryRun.updateMany).toHaveBeenCalledTimes(1)
  })
})

describe('rejectApprovalAction on a SALARY_RUN approval', () => {
  it('returns the run to DRAFT in the default transaction without reading the period', async () => {
    await rejectApprovalAction('approval_1', 'Headcount mismatch')

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.$transaction.mock.calls[0]).toHaveLength(1)
    expect(mocks.calls).toEqual([
      'salaryRun.findFirst:linked',
      'approval.updateMany',
      'approvalTimeline.create',
      'salaryRun.updateMany',
      'auditLog.create',
    ])
    expect(mocks.tx.salaryRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'DRAFT' } })
    )
  })
})

describe.each([
  {
    name: 'approveApprovalAction',
    row: approvalRow({ entityType: 'EXPENSE', entityId: 'expense_1' }),
    run: () => approveApprovalAction('approval_1', undefined, 'APPROVE'),
  },
  {
    name: 'markApprovalPaidAction',
    row: approvalRow({ entityType: 'EXPENSE', entityId: 'expense_1', currentStatus: 'APPROVED' }),
    run: () => markApprovalPaidAction('approval_1', undefined, 'PAID'),
  },
  {
    name: 'rejectApprovalAction',
    row: approvalRow({ entityType: 'EXPENSE', entityId: 'expense_1' }),
    run: () => rejectApprovalAction('approval_1', 'Missing receipt'),
  },
])('$name on a non-salary approval', ({ row, run }) => {
  it('keeps the default transaction and reads no payroll period', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(row)

    await run()

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.$transaction.mock.calls[0]).toHaveLength(1)
    expect(mocks.calls).toEqual([
      'expense.findFirst',
      'approval.updateMany',
      'approvalTimeline.create',
      'expense.updateMany',
      'auditLog.create',
    ])
    expect(mocks.tx.salaryRun.findFirst).not.toHaveBeenCalled()
  })
})
