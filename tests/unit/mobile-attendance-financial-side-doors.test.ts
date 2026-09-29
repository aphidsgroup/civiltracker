import { beforeEach, describe, expect, it, vi } from 'vitest'
import { matchesWhere } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'

/**
 * Regression for money moved through the mobile muster roll.
 *
 * Marking attendance (`attendance.mark`, held by SITE_ENGINEER, SUPERVISOR, SUBCONTRACTOR
 * and PROJECT_MANAGER) could set or overwrite a worker's advance on the attendance row
 * (`saveMobileAttendanceAction`, and `updateWorkerAction`'s "today's advance"), log a
 * contractor's `dailyAdvance` that incremented the subcontractor's advance balance
 * (`saveContractorAttendance`), and delete or reverse a recorded advance by removing the
 * row or log. None of it needed `payments.manage`, a confirmation, a reason or an audit.
 *
 * Now attendance, roster and worker-profile writes carry no money: an advance there is
 * refused before any write unless it is absent, null or numeric zero (on the muster roll,
 * before any read), and an update never touches the stored advance. Money moves only through explicit paths that need `payments.manage`
 * (plus `attendance.mark` for a contractor log), strict decimal text within the column,
 * the stored name typed back, a reason, the exact current site binding, a guarded write
 * and an audit row in the same transaction.
 *
 * The stores below are mutated by the delegates and restored when a transaction throws,
 * so a rollback is proved by the stored balances, not by call counts.
 * `@/lib/permissions`, `@/lib/auth/require-module` and `@/lib/auth/site-mutation` are real.
 */

type Store = { labour: Row[]; attendance: Row[]; subs: Row[]; logs: Row[]; audit: Row[] }

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  logActivity: vi.fn(),
  syncSiteBudget: vi.fn(),
  auditFails: { value: false },
  prisma: {} as Record<string, unknown>,
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('@/lib/budget', () => ({ syncSiteBudget: mocks.syncSiteBudget }))

const mobile = await import('@/actions/mobile-labour')

const ENGINEER = 'user_site_engineer'

function today() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

const SITES: Row[] = [
  { id: 'site_mine', companyId: 'company_1', deletedAt: null, assignedEngineerId: ENGINEER, engineerId: null },
  { id: 'site_theirs', companyId: 'company_1', deletedAt: null, assignedEngineerId: 'user_someone_else', engineerId: null },
  { id: 'site_other', companyId: 'company_2', deletedAt: null, assignedEngineerId: ENGINEER, engineerId: null },
]

function seed(): Store {
  return {
    labour: [
      { id: 'lab_mine', companyId: 'company_1', siteId: 'site_mine', name: 'Ravi', trade: 'MASON', phone: null, isActive: true },
      { id: 'lab_unmarked', companyId: 'company_1', siteId: 'site_mine', name: 'Arun', trade: 'HELPER', phone: null, isActive: true },
      { id: 'lab_moved', companyId: 'company_1', siteId: 'site_mine', name: 'Moved', trade: 'HELPER', phone: null, isActive: true },
      { id: 'lab_inactive', companyId: 'company_1', siteId: 'site_mine', name: 'Idle', trade: 'HELPER', phone: null, isActive: false },
      { id: 'lab_theirs', companyId: 'company_1', siteId: 'site_theirs', name: 'Kumar', trade: 'HELPER', phone: null, isActive: true },
      { id: 'lab_other', companyId: 'company_2', siteId: 'site_other', name: 'Foreign', trade: 'HELPER', phone: null, isActive: true },
    ],
    attendance: [
      { id: 'att_mine', labourId: 'lab_mine', siteId: 'site_mine', date: today(), status: 'PRESENT', advance: 200, startTime: null },
      // Recorded on the worker's previous site before it was moved to site_mine today.
      { id: 'att_moved_old', labourId: 'lab_moved', siteId: 'site_theirs', date: today(), status: 'PRESENT', advance: 0, startTime: null },
      { id: 'att_inactive', labourId: 'lab_inactive', siteId: 'site_mine', date: today(), status: 'PRESENT', advance: 0, startTime: null },
      { id: 'att_theirs', labourId: 'lab_theirs', siteId: 'site_theirs', date: today(), status: 'PRESENT', advance: 0, startTime: null },
    ],
    subs: [
      { id: 'sub_mine', companyId: 'company_1', siteId: 'site_mine', name: 'Bricks Co', status: 'Active', isActive: true, advance: 1000 },
      { id: 'sub_theirs', companyId: 'company_1', siteId: 'site_theirs', name: 'Their Co', status: 'Active', isActive: true, advance: 0 },
      { id: 'sub_unbound', companyId: 'company_1', siteId: null, name: 'Floating Co', status: 'Active', isActive: true, advance: 0 },
      { id: 'sub_inactive', companyId: 'company_1', siteId: 'site_mine', name: 'Gone Co', status: 'Inactive', isActive: false, advance: 0 },
      { id: 'sub_foreign', companyId: 'company_2', siteId: 'site_mine', name: 'Foreign Co', status: 'Active', isActive: true, advance: 0 },
    ],
    logs: [
      { id: 'ca_paid', companyId: 'company_1', siteId: 'site_mine', subcontractorId: 'sub_mine', contractorType: 'Mason', labourCount: 5, dailyAdvance: 200, date: today(), startTime: null },
      { id: 'ca_free', companyId: 'company_1', siteId: 'site_mine', subcontractorId: 'sub_mine', contractorType: 'Mason', labourCount: 3, dailyAdvance: 0, date: today(), startTime: null },
    ],
    audit: [],
  }
}

let store: Store = seed()

const relations: RelationResolver = (row, key) => {
  if (key === 'site') return SITES.find((site) => site.id === row.siteId) ?? null
  if (key === 'subcontractor') return store.subs.find((sub) => sub.id === row.subcontractorId) ?? null
  if (key === 'labour') return store.labour.find((labour) => labour.id === row.labourId) ?? null
  return undefined
}

function apply(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      const op = value as { increment?: number; decrement?: number }
      if (op.increment !== undefined) row[key] = Math.round(((row[key] as number) + op.increment) * 100) / 100
      else if (op.decrement !== undefined) row[key] = Math.round(((row[key] as number) - op.decrement) * 100) / 100
      else row[key] = value
    } else {
      row[key] = value
    }
  }
}

function delegate(rows: () => Row[], prefix: string) {
  const find = (where?: Row) => rows().filter((row) => matchesWhere(row, where, relations))
  let created = 0
  return {
    findFirst: vi.fn(async (args: { where?: Row } = {}) => find(args.where)[0] ?? null),
    findMany: vi.fn(async (args: { where?: Row; take?: number } = {}) => {
      const found = find(args.where)
      return typeof args.take === 'number' ? found.slice(0, args.take) : found
    }),
    updateMany: vi.fn(async (args: { where?: Row; data: Row }) => {
      const found = find(args.where)
      found.forEach((row) => apply(row, args.data))
      return { count: found.length }
    }),
    deleteMany: vi.fn(async (args: { where?: Row } = {}) => {
      const found = find(args.where)
      const list = rows()
      found.forEach((row) => list.splice(list.indexOf(row), 1))
      return { count: found.length }
    }),
    create: vi.fn(async (args: { data: Row }) => {
      const row = { id: `${prefix}_new_${++created}`, ...args.data }
      rows().push(row)
      return row
    }),
  }
}

const tx = {
  labour: delegate(() => store.labour, 'lab'),
  labourAttendance: {
    ...delegate(() => store.attendance, 'att'),
    upsert: vi.fn(async (args: { where: { labourId_date: { labourId: string; date: Date }; siteId: string }; create: Row; update: Row }) => {
      const { labourId, date } = args.where.labourId_date
      const row = store.attendance.find((r) => r.labourId === labourId && (r.date as Date).getTime() === date.getTime() && r.siteId === args.where.siteId)
      if (row) {
        apply(row, args.update)
        return row
      }
      const created = { id: `att_new_${store.attendance.length}`, ...args.create }
      store.attendance.push(created)
      return created
    }),
  },
  subcontractor: delegate(() => store.subs, 'sub'),
  contractorAttendance: delegate(() => store.logs, 'ca'),
  auditLog: {
    create: vi.fn(async (args: { data: Row }) => {
      if (mocks.auditFails.value) throw new Error('audit down')
      store.audit.push(args.data)
      return args.data
    }),
  },
  // No salary run covers the roll's day here; mobile-attendance-date-policy.test.ts covers one.
  salaryRun: { findFirst: vi.fn(async () => null) },
}

const siteFindFirst = vi.fn(async (args: { where?: Row }) => SITES.find((site) => matchesWhere(site, args.where, relations)) ?? null)

Object.assign(mocks.prisma, {
  company: { findUnique: vi.fn(async () => ({ modulesJson: ['SITES', 'LABOUR'], status: 'ACTIVE' })) },
  // Every field role is assigned site_mine (the engineer also directly).
  companyMember: { findFirst: vi.fn(async () => ({ siteIds: ['site_mine'] })) },
  site: { findFirst: siteFindFirst },
  contractorAttendance: {
    findFirst: vi.fn(async (args: { where?: Row }) => {
      const row = await tx.contractorAttendance.findFirst(args)
      return row && { ...row, subcontractor: store.subs.find((s) => s.id === row.subcontractorId) }
    }),
  },
  $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => {
    const snapshot = structuredClone(store)
    try {
      return await fn(tx)
    } catch (error) {
      store = snapshot
      throw error
    }
  }),
})

const $transaction = mocks.prisma.$transaction as ReturnType<typeof vi.fn>

function principal(role: string) {
  const id = role === 'SITE_ENGINEER' ? ENGINEER : `user_${role.toLowerCase()}`
  return { id, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId: 'company_1' }
}

function as(role: string) {
  mocks.requireUser.mockResolvedValue(principal(role))
}

const attendanceRow = (id: string) => store.attendance.find((row) => row.id === id)
const sub = (id: string) => store.subs.find((row) => row.id === id)

function writes() {
  return [
    tx.labour.updateMany, tx.labourAttendance.upsert, tx.labourAttendance.updateMany, tx.labourAttendance.deleteMany,
    tx.subcontractor.create, tx.subcontractor.updateMany, tx.contractorAttendance.create, tx.contractorAttendance.deleteMany,
    tx.auditLog.create,
  ].reduce((sum, fn) => sum + fn.mock.calls.length, 0)
}

beforeEach(() => {
  vi.clearAllMocks()
  store = seed()
  mocks.auditFails.value = false
  as('SITE_ENGINEER')
})

// Every role that marks attendance but holds no `payments.manage`.
const ATTENDANCE_ONLY = ['SITE_ENGINEER', 'SUPERVISOR', 'SUBCONTRACTOR', 'PROJECT_MANAGER']

describe('saveMobileAttendanceAction carries no money', () => {
  it.each([...ATTENDANCE_ONLY, 'COMPANY_ADMIN'])('%s cannot set an advance through the muster roll', async (role) => {
    as(role)
    await expect(mobile.saveMobileAttendanceAction([
      { labourId: 'lab_mine', siteId: 'site_mine', status: 'PRESENT' },
      { labourId: 'lab_mine', siteId: 'site_mine', status: 'PRESENT', advance: 999 },
    ])).rejects.toThrow(/advance is a payment/)
    expect($transaction).not.toHaveBeenCalled()
    expect(writes()).toBe(0)
    expect(attendanceRow('att_mine')?.advance).toBe(200)
  })

  it.each([
    ['a negative advance', -5],
    ['a string advance', '50'],
    ['a zero string advance', '0'],
    ['a non-finite advance', Number.NaN],
    ['an infinite advance', Number.POSITIVE_INFINITY],
  ])(
    'refuses %s before any read',
    async (_label, advance) => {
      await expect(mobile.saveMobileAttendanceAction([{ labourId: 'lab_mine', siteId: 'site_mine', status: 'PRESENT', advance: advance as number }]))
        .rejects.toThrow(/advance is a payment/)
      expect($transaction).not.toHaveBeenCalled()
    },
  )

  it('a status update keeps the recorded advance, even when a zero advance is sent', async () => {
    // The roll keys today at UTC midnight (the other actions here still use local midnight).
    const now = new Date()
    attendanceRow('att_mine')!.date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    await expect(mobile.saveMobileAttendanceAction([{ labourId: 'lab_mine', siteId: 'site_mine', status: 'HALF_DAY', advance: 0 }]))
      .resolves.toEqual({ success: true, count: 1 })
    expect(attendanceRow('att_mine')).toMatchObject({ status: 'HALF_DAY', advance: 200 })
    expect(tx.labourAttendance.upsert.mock.calls[0][0].update).not.toHaveProperty('advance')
  })

  it('a new attendance row starts with no advance', async () => {
    await mobile.saveMobileAttendanceAction([{ labourId: 'lab_unmarked', siteId: 'site_mine', status: 'PRESENT' }])
    expect(store.attendance.find((row) => row.labourId === 'lab_unmarked')).toMatchObject({ status: 'PRESENT', advance: 0 })
  })
})

describe('updateWorkerAction carries no money', () => {
  // The refusal follows the worker lookup (so a move reports its site-history conflict
  // first) but precedes every write.
  it.each([['a positive', 75], ['a negative', -1], ['a non-finite', Number.NaN], ['a string', '0']])(
    'refuses %s advance before any write, even for a tenant admin',
    async (_label, advance) => {
      as('COMPANY_ADMIN')
      await expect(mobile.updateWorkerAction({ id: 'lab_mine', name: 'Ravi', trade: 'MASON', dailyWage: 800, siteId: 'site_mine', advance: advance as number }))
        .rejects.toThrow(/advance is a payment/)
      expect(writes()).toBe(0)
      expect(store.labour.find((row) => row.id === 'lab_mine')).toMatchObject({ name: 'Ravi', siteId: 'site_mine' })
      expect(attendanceRow('att_mine')?.advance).toBe(200)
    },
  )

  it('a profile edit with a zero advance writes no attendance', async () => {
    as('COMPANY_ADMIN')
    await expect(mobile.updateWorkerAction({ id: 'lab_mine', name: 'Ravi K', trade: 'MASON', dailyWage: 800, siteId: 'site_mine', advance: 0 }))
      .resolves.toMatchObject({ success: true })
    expect(tx.labourAttendance.upsert).not.toHaveBeenCalled()
    expect(attendanceRow('att_mine')?.advance).toBe(200)
    expect(store.labour.find((row) => row.id === 'lab_mine')).toMatchObject({ name: 'Ravi K', dailyWage: 800 })
  })
})

const ADVANCE = { labourId: 'lab_mine', siteId: 'site_mine', amount: '150.50', expectedAdvance: '200', confirmationText: 'Ravi', reason: 'Tools purchase' }

describe('recordLabourAdvanceAction', () => {
  it.each(ATTENDANCE_ONLY)('%s, without payments.manage, is refused before any read', async (role) => {
    as(role)
    await expect(mobile.recordLabourAdvanceAction(ADVANCE)).rejects.toThrow(/Missing required permission "payments.manage"/)
    expect(siteFindFirst).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
  })

  it.each([
    ['a number instead of decimal text', { amount: 150 }],
    ['a negative amount', { amount: '-5' }],
    ['a zero amount', { amount: '0' }],
    ['sub-paisa precision', { amount: '1.005' }],
    ['an exponent form', { amount: '1e3' }],
    ['a non-numeric amount', { amount: 'abc' }],
    ['a blank amount', { amount: '' }],
    ['an amount beyond Decimal(10, 2)', { amount: '100000000' }],
    ['a malformed expected balance', { expectedAdvance: '-1' }],
    ['a missing expected balance', { expectedAdvance: undefined }],
  ])('refuses %s with no transaction', async (_label, patch) => {
    as('COMPANY_ADMIN')
    await expect(mobile.recordLabourAdvanceAction({ ...ADVANCE, ...patch } as typeof ADVANCE)).rejects.toThrow(/Invalid/)
    expect($transaction).not.toHaveBeenCalled()
  })

  it('refuses a missing reason with no transaction', async () => {
    as('COMPANY_ADMIN')
    await expect(mobile.recordLabourAdvanceAction({ ...ADVANCE, reason: '  ' })).rejects.toThrow(/Advance reason is required/)
    expect($transaction).not.toHaveBeenCalled()
  })

  it.each([['missing', ''], ['wrong', 'Kumar']])('refuses a %s confirmation, writing nothing', async (_label, confirmationText) => {
    as('COMPANY_ADMIN')
    await expect(mobile.recordLabourAdvanceAction({ ...ADVANCE, confirmationText })).rejects.toThrow(/confirmation text did not match/)
    expect(writes()).toBe(0)
  })

  it.each([
    ["another tenant's site", { siteId: 'site_other', labourId: 'lab_other', confirmationText: 'Foreign' }, /Site not found or access denied/],
    ['a worker whose current site is another', { siteId: 'site_theirs', labourId: 'lab_mine' }, /Labour not found or access denied/],
    ["another tenant's worker", { labourId: 'lab_other', confirmationText: 'Foreign' }, /Labour not found or access denied/],
    ['an inactive worker', { labourId: 'lab_inactive', confirmationText: 'Idle', expectedAdvance: '0' }, /Labour not found or access denied/],
    ['a worker with no attendance today', { labourId: 'lab_unmarked', confirmationText: 'Arun', expectedAdvance: '0' }, /No attendance today/],
    ["a worker whose today's row is on its previous site", { labourId: 'lab_moved', confirmationText: 'Moved', expectedAdvance: '0' }, /No attendance today/],
  ])('refuses %s, writing nothing', async (_label, patch, error) => {
    as('COMPANY_ADMIN')
    await expect(mobile.recordLabourAdvanceAction({ ...ADVANCE, ...patch })).rejects.toThrow(error)
    expect(writes()).toBe(0)
    expect(attendanceRow('att_moved_old')?.advance).toBe(0)
  })

  it('refuses a stale expected balance', async () => {
    as('COMPANY_ADMIN')
    await expect(mobile.recordLabourAdvanceAction({ ...ADVANCE, expectedAdvance: '100' })).rejects.toThrow(/advance changed/)
    expect(writes()).toBe(0)
  })

  it('refuses a total beyond the column', async () => {
    as('COMPANY_ADMIN')
    attendanceRow('att_mine')!.advance = 99_999_999
    await expect(mobile.recordLabourAdvanceAction({ ...ADVANCE, expectedAdvance: '99999999', amount: '1' })).rejects.toThrow(/exceed/)
    expect(writes()).toBe(0)
  })

  it('refuses when the balance moves between read and write', async () => {
    as('COMPANY_ADMIN')
    tx.labourAttendance.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(mobile.recordLabourAdvanceAction(ADVANCE)).rejects.toThrow(/advance changed/)
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('rolls the advance back when the audit write fails', async () => {
    as('COMPANY_ADMIN')
    mocks.auditFails.value = true
    await expect(mobile.recordLabourAdvanceAction(ADVANCE)).rejects.toThrow(/audit down/)
    expect(attendanceRow('att_mine')?.advance).toBe(200)
    expect(store.audit).toHaveLength(0)
  })

  it.each(['COMPANY_ADMIN', 'ACCOUNTANT'])('%s adds the advance to today\'s row with a guarded write and an audit row', async (role) => {
    as(role)
    await expect(mobile.recordLabourAdvanceAction(ADVANCE)).resolves.toEqual({ success: true, advance: 350.5 })
    expect(attendanceRow('att_mine')).toMatchObject({ advance: 350.5, status: 'PRESENT' })
    expect(tx.labourAttendance.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'att_mine', labourId: 'lab_mine', siteId: 'site_mine', advance: 200 })
    expect(store.audit).toEqual([expect.objectContaining({
      userId: `user_${role.toLowerCase()}`,
      companyId: 'company_1',
      action: 'PAID',
      module: 'LABOUR',
      recordId: 'lab_mine',
      before: expect.objectContaining({ siteId: 'site_mine', attendanceId: 'att_mine', advance: 200 }),
      after: expect.objectContaining({ siteId: 'site_mine', attendanceId: 'att_mine', advance: 350.5, paidAmount: 150.5, reason: 'Tools purchase' }),
    })])
    expect(mocks.syncSiteBudget).toHaveBeenCalledWith('site_mine')
  })
})

const LOG = { siteId: 'site_mine', contractorName: 'Bricks Co', contractorType: 'Mason', labourCount: 5 }
const PAID_LOG = { ...LOG, dailyAdvance: '300', advanceConfirmation: 'Bricks Co', advanceReason: 'Cement run' }

describe('saveContractorAttendance: a daily advance is a payment', () => {
  it.each(ATTENDANCE_ONLY)('%s, without payments.manage, logs no daily advance', async (role) => {
    as(role)
    await expect(mobile.saveContractorAttendance(PAID_LOG)).rejects.toThrow(/Missing required permission "payments.manage"/)
    expect($transaction).not.toHaveBeenCalled()
    expect(writes()).toBe(0)
    expect(sub('sub_mine')?.advance).toBe(1000)
  })

  it('an accountant, without attendance.mark, cannot log contractor attendance at all', async () => {
    as('ACCOUNTANT')
    await expect(mobile.saveContractorAttendance(PAID_LOG)).rejects.toThrow(/Missing required permission "attendance.mark"/)
    expect(writes()).toBe(0)
  })

  it.each([undefined, 0, '', '0'])('a field role logs headcount with daily advance %j and moves no money', async (dailyAdvance) => {
    await expect(mobile.saveContractorAttendance({ ...LOG, dailyAdvance })).resolves.toMatchObject({ success: true })
    expect(store.logs.at(-1)).toMatchObject({ subcontractorId: 'sub_mine', labourCount: 5, dailyAdvance: 0 })
    expect(tx.subcontractor.updateMany).not.toHaveBeenCalled()
    expect(sub('sub_mine')?.advance).toBe(1000)
  })

  it.each([
    ['a number instead of decimal text', 300],
    ['a negative amount', '-1'],
    ['sub-paisa precision', '1.001'],
    ['an exponent form', '1e2'],
    ['an amount beyond Decimal(10, 2)', '100000000'],
  ])('refuses %s with no transaction', async (_label, dailyAdvance) => {
    as('COMPANY_ADMIN')
    await expect(mobile.saveContractorAttendance({ ...PAID_LOG, dailyAdvance })).rejects.toThrow(/Invalid daily advance/)
    expect($transaction).not.toHaveBeenCalled()
  })

  it('refuses a missing reason with no transaction', async () => {
    as('COMPANY_ADMIN')
    await expect(mobile.saveContractorAttendance({ ...PAID_LOG, advanceReason: '' })).rejects.toThrow(/Advance reason is required/)
    expect($transaction).not.toHaveBeenCalled()
  })

  it.each([['missing', undefined], ['wrong', 'Their Co']])('refuses a %s confirmation, writing nothing', async (_label, advanceConfirmation) => {
    as('COMPANY_ADMIN')
    await expect(mobile.saveContractorAttendance({ ...PAID_LOG, advanceConfirmation })).rejects.toThrow(/confirmation text did not match/)
    expect(store.logs).toHaveLength(2)
    expect(sub('sub_mine')?.advance).toBe(1000)
  })

  it.each([
    ['an unknown subcontractor (never created with money)', { contractorName: 'New Co', advanceConfirmation: 'New Co' }],
    ["another site's subcontractor", { contractorName: 'Their Co', advanceConfirmation: 'Their Co' }],
    ['a subcontractor bound to no site', { contractorName: 'Floating Co', advanceConfirmation: 'Floating Co' }],
    ['an inactive subcontractor', { contractorName: 'Gone Co', advanceConfirmation: 'Gone Co' }],
    ["another tenant's subcontractor", { contractorName: 'Foreign Co', advanceConfirmation: 'Foreign Co' }],
  ])('refuses %s, writing nothing', async (_label, patch) => {
    as('COMPANY_ADMIN')
    await expect(mobile.saveContractorAttendance({ ...PAID_LOG, ...patch })).rejects.toThrow(/Subcontractor not found or access denied/)
    expect(store.logs).toHaveLength(2)
    expect(store.subs).toHaveLength(5)
    expect(store.subs.every((row) => row.id === 'sub_mine' ? row.advance === 1000 : row.advance === 0)).toBe(true)
  })

  it("refuses another tenant's site", async () => {
    as('COMPANY_ADMIN')
    await expect(mobile.saveContractorAttendance({ ...PAID_LOG, siteId: 'site_other' })).rejects.toThrow(/Site not found or access denied/)
    expect(writes()).toBe(0)
  })

  it('refuses when the balance moves between read and write, keeping no log', async () => {
    as('COMPANY_ADMIN')
    tx.subcontractor.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(mobile.saveContractorAttendance(PAID_LOG)).rejects.toThrow(/advance changed/)
    expect(store.logs).toHaveLength(2)
  })

  it('rolls the log and the increment back when the audit write fails', async () => {
    as('COMPANY_ADMIN')
    mocks.auditFails.value = true
    await expect(mobile.saveContractorAttendance(PAID_LOG)).rejects.toThrow(/audit down/)
    expect(store.logs).toHaveLength(2)
    expect(sub('sub_mine')?.advance).toBe(1000)
    expect(store.audit).toHaveLength(0)
  })

  it('a tenant admin logs the advance with a guarded increment and an audit row', async () => {
    as('COMPANY_ADMIN')
    const result = await mobile.saveContractorAttendance({ ...PAID_LOG, dailyAdvance: '300.25' })
    expect(result).toMatchObject({ success: true })
    const log = store.logs.find((row) => row.id === result.attendance.id)
    expect(log).toMatchObject({ siteId: 'site_mine', subcontractorId: 'sub_mine', dailyAdvance: 300.25 })
    expect(sub('sub_mine')?.advance).toBe(1300.25)
    expect(tx.subcontractor.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'sub_mine', companyId: 'company_1', siteId: 'site_mine', advance: 1000 })
    expect(store.audit).toEqual([expect.objectContaining({
      userId: 'user_company_admin',
      companyId: 'company_1',
      action: 'PAID',
      module: 'SUBCONTRACTOR',
      recordId: 'sub_mine',
      before: expect.objectContaining({ siteId: 'site_mine', advance: 1000 }),
      after: expect.objectContaining({ siteId: 'site_mine', advance: 1300.25, paidAmount: 300.25, reason: 'Cement run', contractorAttendanceId: log?.id }),
    })])
  })
})

describe('removing a roster entry or log that carries money needs payments.manage', () => {
  it.each(ATTENDANCE_ONLY)(
    '%s cannot delete a worker row that carries an advance',
    async (role) => {
      as(role)
      await expect(mobile.removeLabourAttendanceAction('lab_mine', 'Ravi')).rejects.toThrow(/Missing required permission "payments.manage"/)
      expect(tx.labourAttendance.deleteMany).not.toHaveBeenCalled()
      expect(attendanceRow('att_mine')?.advance).toBe(200)
    },
  )

  it('a field role still removes a worker row with no advance', async () => {
    attendanceRow('att_mine')!.advance = 0
    await expect(mobile.removeLabourAttendanceAction('lab_mine', 'Ravi')).resolves.toEqual({ success: true })
    expect(attendanceRow('att_mine')).toBeUndefined()
  })

  it('a tenant admin removes a worker row with an advance, audited with the amount', async () => {
    as('COMPANY_ADMIN')
    await mobile.removeLabourAttendanceAction('lab_mine', 'Ravi')
    expect(attendanceRow('att_mine')).toBeUndefined()
    expect(store.audit[0]).toMatchObject({ action: 'DELETE', before: expect.objectContaining({ advance: 200 }) })
  })

  it.each(ATTENDANCE_ONLY)(
    '%s cannot delete a contractor log that reverses a daily advance',
    async (role) => {
      as(role)
      await expect(mobile.removeContractorAttendanceAction('ca_paid', 'Bricks Co')).rejects.toThrow(/Missing required permission "payments.manage"/)
      expect($transaction).not.toHaveBeenCalled()
      expect(store.logs).toHaveLength(2)
      expect(sub('sub_mine')?.advance).toBe(1000)
    },
  )

  it('a field role still removes a contractor log with no advance', async () => {
    await expect(mobile.removeContractorAttendanceAction('ca_free', 'Bricks Co')).resolves.toEqual({ success: true })
    expect(store.logs.map((row) => row.id)).toEqual(['ca_paid'])
    expect(sub('sub_mine')?.advance).toBe(1000)
  })
})
