import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { matchesWhere } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'
import { PAYROLL_PERIOD_CLOSED } from '@/lib/payroll-period-lock'

/**
 * The labour advance and roster writers route through the shared payroll-period lock.
 *
 * `markLabourPaidAction`, `markSiteLabourPaid` (both through `payLabourAdvance`),
 * `recordLabourAdvanceAction`, `addExistingWorkerToRoster` and
 * `removeLabourAttendanceAction` each run in one SERIALIZABLE `payrollTransaction` and
 * call `assertPayrollPeriodOpen` after the exact tenant/site/worker binding read and
 * before their first mutation. A payment checks both the payment day and the day of the
 * attendance row it is booked on; an opening-advance payment has no booked day and checks
 * the payment day only. A day inside a salary run of the same company past DRAFT that is
 * company-wide, for the booked site, or includes the worker refuses the write with no
 * balance, attendance, worker or audit change. DRAFT runs, other companies' runs,
 * unrelated sites and workers, and other periods are left alone. An audit failure rolls
 * the write back, and a serialization conflict retries the whole transaction, so a run
 * finalized by the concurrent winner is seen and refuses the retry.
 *
 * The delegates evaluate the real `where` over an in-memory store; `$transaction` records
 * its options and rolls the store back when the callback throws or the commit conflicts.
 * `@/lib/permissions`, `@/lib/auth/*` (except `requireUser`), `@/lib/labour-payment`,
 * `@/lib/labour-attendance` and `@/lib/payroll-period-lock` are real.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  logActivity: vi.fn(),
  syncSiteBudget: vi.fn(),
  prisma: {} as Record<string, unknown>,
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('@/lib/budget', () => ({ syncSiteBudget: mocks.syncSiteBudget }))

const labourActions = await import('@/actions/labour')
const siteLabour = await import('@/actions/site-labour')
const mobile = await import('@/actions/mobile-labour')

const NOW = new Date('2026-09-29T06:00:00.000Z')
const FINALIZED = ['SUBMITTED', 'VERIFIED', 'APPROVED', 'PAID']
const CLOSED = new RegExp(PAYROLL_PERIOD_CLOSED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

/** UTC midnight of a `YYYY-MM-DD` day. */
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`)
/** The payment day `payLabourAdvance` uses: today's UTC midnight. */
const UTC_TODAY = day('2026-09-29')
/** The day the mobile roster writers use: the server's local midnight today. */
const LOCAL_TODAY = (() => {
  const today = new Date(NOW)
  today.setHours(0, 0, 0, 0)
  return today
})()
/** The calendar day a `@db.Date` column stores for `date`. */
const storedDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))

const SITES: Row[] = [
  { id: 'site_a', companyId: 'company_1', deletedAt: null, assignedEngineerId: null, engineerId: null },
  { id: 'site_b', companyId: 'company_1', deletedAt: null, assignedEngineerId: null, engineerId: null },
  { id: 'site_c', companyId: 'company_1', deletedAt: null, assignedEngineerId: null, engineerId: null },
  { id: 'site_x', companyId: 'company_2', deletedAt: null, assignedEngineerId: null, engineerId: null },
]

type Run = Row & { items: Row[] }
type Store = { labour: Row[]; attendance: Row[]; runs: Run[]; audit: Row[] }

function seed(): Store {
  return {
    labour: [
      { id: 'lab_a1', companyId: 'company_1', siteId: 'site_a', name: 'Ravi', trade: 'MASON', isActive: true, openingAdvance: 0 },
      // Moved to site_a from site_b; it has no attendance on site_a yet.
      { id: 'lab_a2', companyId: 'company_1', siteId: 'site_a', name: 'Arun', trade: 'HELPER', isActive: true, openingAdvance: 0 },
      { id: 'lab_b', companyId: 'company_1', siteId: 'site_b', name: 'Kumar', trade: 'HELPER', isActive: true, openingAdvance: 0 },
      { id: 'lab_x', companyId: 'company_2', siteId: 'site_x', name: 'Foreign', trade: 'HELPER', isActive: true, openingAdvance: 0 },
    ],
    attendance: [
      { id: 'att_a1_25', labourId: 'lab_a1', siteId: 'site_a', date: day('2026-09-25'), status: 'PRESENT', advance: 300, startTime: null },
      { id: 'att_a2_old', labourId: 'lab_a2', siteId: 'site_b', date: day('2026-09-10'), status: 'PRESENT', advance: 50, startTime: null },
    ],
    runs: [],
    audit: [],
  }
}

let store: Store = seed()
/** Each entry fails one commit with P2034 after running the concurrent winner's effect. */
let conflicts: Array<() => void> = []
/** The delegate calls in order, to prove the lock is read after binding and before writing. */
let calls: string[] = []
let failAudit = false

const relations: RelationResolver = (row, key) => {
  if (key === 'site') return SITES.find((site) => site.id === row.siteId) ?? null
  if (key === 'labour') return store.labour.find((labour) => labour.id === row.labourId) ?? null
  return undefined
}

/** `matchesWhere` plus the to-many `items: { some }` filter the lock uses. */
function runMatches(run: Run, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Row[]).some((branch) => runMatches(run, branch))
    if (key === 'items') {
      const { some, ...rest } = condition as { some?: Row }
      if (!some || Object.keys(rest).length > 0) throw new Error('salaryRun.items: only `some` is modelled')
      return run.items.some((item) => matchesWhere(item, some))
    }
    return matchesWhere(run, { [key]: condition })
  })
}

const logged = <A extends unknown[], R>(name: string, fn: (...args: A) => R) =>
  vi.fn((...args: A) => {
    calls.push(name)
    return fn(...args)
  })

function apply(rows: Row[], where: Row, data: Row) {
  const matched = rows.filter((row) => matchesWhere(row, where, relations))
  for (const row of matched) Object.assign(row, data)
  return { count: matched.length }
}

const tx = {
  labour: {
    findFirst: logged('labour.findFirst', async (args: { where: Row }) =>
      store.labour.find((row) => matchesWhere(row, args.where, relations)) ?? null),
    updateMany: logged('labour.updateMany', async (args: { where: Row; data: Row }) => apply(store.labour, args.where, args.data)),
  },
  labourAttendance: {
    findFirst: logged('labourAttendance.findFirst', async (args: { where: Row; orderBy?: { date?: 'asc' | 'desc' } }) => {
      const matched = store.attendance.filter((row) => matchesWhere(row, args.where, relations))
      if (args.orderBy?.date === 'desc') matched.sort((a, b) => (b.date as Date).getTime() - (a.date as Date).getTime())
      return matched[0] ?? null
    }),
    updateMany: logged('labourAttendance.updateMany', async (args: { where: Row; data: Row }) =>
      apply(store.attendance, args.where, args.data)),
    upsert: logged('labourAttendance.upsert', async (args: { where: { labourId_date: { labourId: string; date: Date }; siteId: string }; create: Row; update: Row }) => {
      const { labourId, date } = args.where.labourId_date
      const sameKey = store.attendance.filter((row) => row.labourId === labourId && (row.date as Date).getTime() === date.getTime())
      const row = sameKey.find((candidate) => candidate.siteId === args.where.siteId)
      if (row) {
        for (const [key, value] of Object.entries(args.update)) if (value !== undefined) row[key] = value
        return row
      }
      if (sameKey.length > 0) throw new Error('Unique constraint failed on the fields: (`labourId`,`date`)')
      const created = { id: `att_new_${store.attendance.length}`, ...args.create }
      store.attendance.push(created)
      return created
    }),
    deleteMany: logged('labourAttendance.deleteMany', async (args: { where: Row }) => {
      const kept = store.attendance.filter((row) => !matchesWhere(row, args.where, relations))
      const count = store.attendance.length - kept.length
      store.attendance = kept
      return { count }
    }),
  },
  salaryRun: {
    findFirst: logged('salaryRun.findFirst', async (args: { where: Row }) =>
      store.runs.find((run) => runMatches(run, args.where)) ?? null),
  },
  auditLog: {
    create: logged('auditLog.create', async (args: { data: Row }) => {
      if (failAudit) throw new Error('audit store unavailable')
      store.audit.push(args.data)
      return args.data
    }),
  },
}

Object.assign(mocks.prisma, {
  company: { findUnique: vi.fn(async () => ({ modulesJson: ['SITES', 'LABOUR'], status: 'ACTIVE' })) },
  companyMember: { findFirst: vi.fn(async () => ({ siteIds: [] })) },
  site: {
    findFirst: vi.fn(async (args: { where: Row }) => SITES.find((site) => matchesWhere(site, args.where)) ?? null),
  },
  $transaction: vi.fn(async (fn: (client: typeof tx) => unknown, _options?: unknown) => {
    const snapshot = structuredClone(store)
    let result: unknown
    try {
      result = await fn(tx)
    } catch (error) {
      store = snapshot
      throw error
    }
    const concurrent = conflicts.shift()
    if (concurrent) {
      store = snapshot
      concurrent()
      throw Object.assign(new Error('Transaction failed due to a write conflict or a deadlock'), { code: 'P2034' })
    }
    return result
  }),
})

const $transaction = mocks.prisma.$transaction as ReturnType<typeof vi.fn>

function as(role: string, companyId = 'company_1') {
  mocks.requireUser.mockResolvedValue({ id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId })
}

function run(patch: Partial<Run>): Run {
  // Wide enough to cover both today's UTC day and the local-midnight day in any timezone.
  return {
    id: 'run_1', companyId: 'company_1', siteId: null, status: 'APPROVED',
    periodStart: day('2026-09-22'), periodEnd: day('2026-10-05'), items: [], ...patch,
  }
}

/** Runs that close today for `labourId` booked on `siteId`: by company, by site, or by item. */
function closing(labourId: string, siteId: string): Array<[string, string, Run]> {
  return FINALIZED.flatMap((status): Array<[string, string, Run]> => [
    [status, 'a company-wide run', run({ status, siteId: null })],
    [status, 'a run for exactly the booked site', run({ status, siteId })],
    [status, 'a run on another site that includes the worker', run({ status, siteId: 'site_c', items: [{ labourId }] })],
  ])
}

/** Runs that close nothing for `labourId` booked on `siteId` today. */
function unrelated(labourId: string, siteId: string): Array<[string, Run]> {
  return [
    ['a DRAFT company-wide run', run({ status: 'DRAFT', siteId: null })],
    ['a DRAFT run of the site including the worker', run({ status: 'DRAFT', siteId, items: [{ labourId }] })],
    ['a finalized run of an unrelated site and worker', run({ siteId: 'site_c', items: [{ labourId: 'lab_unrelated' }] })],
    ["another company's company-wide run", run({ companyId: 'company_2', siteId: null })],
    ["another company's run including the worker", run({ companyId: 'company_2', siteId, items: [{ labourId }] })],
    ['a finalized company-wide run of a later period', run({ siteId: null, periodStart: day('2026-10-06'), periodEnd: day('2026-10-19') })],
  ]
}

const WRITES = new Set([
  'labour.updateMany',
  'labourAttendance.updateMany',
  'labourAttendance.upsert',
  'labourAttendance.deleteMany',
  'auditLog.create',
])

function writes() {
  return calls.filter((name) => WRITES.has(name)).length
}

function expectSerializable(times: number) {
  expect($transaction).toHaveBeenCalledTimes(times)
  for (const call of $transaction.mock.calls) expect(call[1]).toEqual({ isolationLevel: 'Serializable' })
}

/** Every lock read comes after the worker binding read and before the first write. */
function expectLockBetweenBindingAndWrites(locks = 1) {
  const bind = calls.indexOf('labour.findFirst')
  const lockAt = calls.flatMap((name, index) => (name === 'salaryRun.findFirst' ? [index] : []))
  expect(lockAt).toHaveLength(locks)
  expect(bind).toBeGreaterThanOrEqual(0)
  expect(bind).toBeLessThan(lockAt[0])
  const firstWrite = calls.findIndex((name) => WRITES.has(name))
  if (firstWrite >= 0) expect(lockAt[lockAt.length - 1]).toBeLessThan(firstWrite)
}

/** The lock predicate for exactly `companyId`, the stored day and one (worker, site) booking. */
function lockWhere(date: Date, labourId: string, siteId: string, companyId = 'company_1') {
  return {
    companyId,
    status: { not: 'DRAFT' },
    periodStart: { lte: date },
    periodEnd: { gte: date },
    OR: [
      { siteId: null },
      { siteId: { in: [siteId] } },
      { items: { some: { labourId: { in: [labourId] } } } },
    ],
  }
}

function lockCalls() {
  return tx.salaryRun.findFirst.mock.calls.map(([args]) => args.where)
}

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

function snapshot() {
  return JSON.stringify({ labour: store.labour, attendance: store.attendance, audit: store.audit })
}

function attendance(id: string) {
  return store.attendance.find((row) => row.id === id)
}

function labour(id: string) {
  return store.labour.find((row) => row.id === id)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  store = seed()
  conflicts = []
  calls = []
  failAudit = false
  as('COMPANY_ADMIN')
})

afterEach(() => {
  vi.useRealTimers()
})

/*
 * The two pay-out entry points share `payLabourAdvance`; each is run against every case so
 * neither can drop the transaction or the lock on its own.
 */
const PAY_OUT: Array<[string, (labourId: string, amount?: string) => Promise<unknown>]> = [
  ['markLabourPaidAction', (id, amount = '100') => labourActions.markLabourPaidAction(form({ id, amount }))],
  ['markSiteLabourPaid', (id, amount = '100') => siteLabour.markSiteLabourPaid('site_a', form({ id, amount }))],
]

describe.each(PAY_OUT)('%s: the payment day and the booked attendance day must both be open', (_name, pay) => {
  it.each(closing('lab_a1', 'site_a'))('%s: %s covering today refuses the payment with no balance or audit change', async (_status, _label, salaryRun) => {
    store.runs.push(structuredClone(salaryRun))
    const before = snapshot()

    await expect(pay('lab_a1')).rejects.toThrow(CLOSED)

    expect(snapshot()).toBe(before)
    expect(attendance('att_a1_25')).toMatchObject({ advance: 300 })
    expect(writes()).toBe(0)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    // A closed period is not a conflict: it is refused once, never retried.
    expectSerializable(1)
    expectLockBetweenBindingAndWrites(1)
  })

  it.each(FINALIZED)('%s: a run settling only the historical booked day refuses the payment', async (status) => {
    store.attendance.push({ id: 'att_a1_12', labourId: 'lab_a1', siteId: 'site_a', date: day('2026-09-12'), status: 'PRESENT', advance: 40, startTime: null })
    // The latest row of the current site is 09-25; only its day is settled, today is open.
    store.runs.push(run({ status, siteId: 'site_a', periodStart: day('2026-09-15'), periodEnd: day('2026-09-28') }))
    const before = snapshot()

    await expect(pay('lab_a1')).rejects.toThrow(CLOSED)

    expect(snapshot()).toBe(before)
    expect(writes()).toBe(0)
    expect(lockCalls()).toEqual([
      lockWhere(UTC_TODAY, 'lab_a1', 'site_a'),
      lockWhere(day('2026-09-25'), 'lab_a1', 'site_a'),
    ])
    expectSerializable(1)
    expectLockBetweenBindingAndWrites(2)
  })

  it('checks the exact company, the payment day and the booked day, then books and audits the advance', async () => {
    await expect(pay('lab_a1')).resolves.toBeUndefined()

    expect(lockCalls()).toEqual([
      lockWhere(UTC_TODAY, 'lab_a1', 'site_a'),
      lockWhere(day('2026-09-25'), 'lab_a1', 'site_a'),
    ])
    expect(attendance('att_a1_25')).toMatchObject({ advance: 400 })
    expect(store.audit).toHaveLength(1)
    expect(store.audit[0]).toMatchObject({ companyId: 'company_1', action: 'PAID', module: 'LABOUR', recordId: 'lab_a1' })
    expectSerializable(1)
    expectLockBetweenBindingAndWrites(2)
  })

  it('a row booked today is checked once, for today', async () => {
    store.attendance.push({ id: 'att_a1_today', labourId: 'lab_a1', siteId: 'site_a', date: UTC_TODAY, status: 'PRESENT', advance: 0, startTime: null })
    await expect(pay('lab_a1')).resolves.toBeUndefined()
    expect(lockCalls()).toEqual([lockWhere(UTC_TODAY, 'lab_a1', 'site_a')])
    expect(attendance('att_a1_today')).toMatchObject({ advance: 100 })
    expect(attendance('att_a1_25')).toMatchObject({ advance: 300 })
  })

  it.each(unrelated('lab_a1', 'site_a'))('%s does not block the payment', async (_label, salaryRun) => {
    store.runs.push(structuredClone(salaryRun))
    await expect(pay('lab_a1')).resolves.toBeUndefined()
    expect(attendance('att_a1_25')).toMatchObject({ advance: 400 })
    expect(store.audit).toHaveLength(1)
    expectSerializable(1)
  })

  it.each(closing('lab_a2', 'site_a'))('opening advance: %s: %s covering today refuses the payment', async (_status, _label, salaryRun) => {
    store.runs.push(structuredClone(salaryRun))
    const before = snapshot()

    await expect(pay('lab_a2')).rejects.toThrow(CLOSED)

    expect(snapshot()).toBe(before)
    expect(labour('lab_a2')).toMatchObject({ openingAdvance: 0 })
    expect(writes()).toBe(0)
    expectSerializable(1)
    expectLockBetweenBindingAndWrites(1)
  })

  it('opening advance checks only the payment day, bound to the current site, and ignores a settled log of a site the worker left', async () => {
    // Settles lab_a2's old site_b row, which the payment never books on.
    store.runs.push(run({ siteId: null, periodStart: day('2026-09-01'), periodEnd: day('2026-09-14') }))

    await expect(pay('lab_a2')).resolves.toBeUndefined()

    expect(lockCalls()).toEqual([lockWhere(UTC_TODAY, 'lab_a2', 'site_a')])
    expect(labour('lab_a2')).toMatchObject({ openingAdvance: 100 })
    expect(attendance('att_a2_old')).toMatchObject({ advance: 50 })
    expect(store.audit).toHaveLength(1)
    expectLockBetweenBindingAndWrites(1)
  })

  it('an audit failure rolls the payment back', async () => {
    failAudit = true
    const before = snapshot()
    await expect(pay('lab_a1')).rejects.toThrow('audit store unavailable')
    expect(snapshot()).toBe(before)
    expectSerializable(1)
  })

  it('an opening-advance audit failure rolls the balance back', async () => {
    failAudit = true
    await expect(pay('lab_a2')).rejects.toThrow('audit store unavailable')
    expect(labour('lab_a2')).toMatchObject({ openingAdvance: 0 })
    expect(store.audit).toEqual([])
  })

  it('retries a serialization conflict and refuses once the concurrent run is finalized', async () => {
    conflicts.push(() => store.runs.push(run({ status: 'SUBMITTED', siteId: 'site_a' })))
    const before = snapshot()

    await expect(pay('lab_a1')).rejects.toThrow(CLOSED)

    expect(snapshot()).toBe(before)
    expectSerializable(2)
  })

  it('a retried payment books the advance and its audit exactly once', async () => {
    conflicts.push(() => {})
    await expect(pay('lab_a1')).resolves.toBeUndefined()
    expect(attendance('att_a1_25')).toMatchObject({ advance: 400 })
    expect(store.audit).toHaveLength(1)
    expectSerializable(2)
  })

  it.each([
    ["another tenant's worker", 'lab_x'],
    ['a missing worker', 'missing'],
  ])('refuses %s as not found before reading the lock', async (_label, labourId) => {
    store.runs.push(run({ siteId: null }))
    await expect(pay(labourId)).rejects.toThrow(/Labour not found or access denied/)
    expect(tx.salaryRun.findFirst).not.toHaveBeenCalled()
    expect(writes()).toBe(0)
  })
})

describe('recordLabourAdvanceAction: today on the current site must be open', () => {
  const INPUT = {
    labourId: 'lab_a1',
    siteId: 'site_a',
    amount: '100',
    expectedAdvance: '0',
    confirmationText: 'Ravi',
    reason: 'Food advance',
  }

  beforeEach(() => {
    store.attendance.push({ id: 'att_a1_today', labourId: 'lab_a1', siteId: 'site_a', date: LOCAL_TODAY, status: 'PRESENT', advance: 0, startTime: null })
  })

  it.each(closing('lab_a1', 'site_a'))('%s: %s refuses the advance with no balance or audit change', async (_status, _label, salaryRun) => {
    store.runs.push(structuredClone(salaryRun))
    const before = snapshot()

    await expect(mobile.recordLabourAdvanceAction(INPUT)).rejects.toThrow(CLOSED)

    expect(snapshot()).toBe(before)
    expect(attendance('att_a1_today')).toMatchObject({ advance: 0 })
    expect(writes()).toBe(0)
    expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
    expectSerializable(1)
    expectLockBetweenBindingAndWrites(1)
  })

  it('checks exactly the live company, the stored day of today and the worker on the bound site', async () => {
    await expect(mobile.recordLabourAdvanceAction(INPUT)).resolves.toEqual({ success: true, advance: 100 })
    expect(lockCalls()).toEqual([lockWhere(storedDay(LOCAL_TODAY), 'lab_a1', 'site_a')])
    expect(attendance('att_a1_today')).toMatchObject({ advance: 100 })
    expect(store.audit).toHaveLength(1)
    expect(mocks.syncSiteBudget).toHaveBeenCalledWith('site_a')
    expectLockBetweenBindingAndWrites(1)
  })

  it.each(unrelated('lab_a1', 'site_a'))('%s does not block the advance', async (_label, salaryRun) => {
    store.runs.push(structuredClone(salaryRun))
    await expect(mobile.recordLabourAdvanceAction(INPUT)).resolves.toEqual({ success: true, advance: 100 })
    expect(store.audit).toHaveLength(1)
    expectSerializable(1)
  })

  it('refuses a wrong confirmation before reading the lock', async () => {
    store.runs.push(run({ siteId: null }))
    await expect(mobile.recordLabourAdvanceAction({ ...INPUT, confirmationText: 'Arun' })).rejects.toThrow(/confirmation text/)
    expect(tx.salaryRun.findFirst).not.toHaveBeenCalled()
    expect(writes()).toBe(0)
  })

  it('refuses a role without payments.manage before any transaction', async () => {
    as('SITE_ENGINEER')
    await expect(mobile.recordLabourAdvanceAction(INPUT)).rejects.toThrow(/payments\.manage/)
    expect($transaction).not.toHaveBeenCalled()
  })

  it('an audit failure rolls the advance back', async () => {
    failAudit = true
    const before = snapshot()
    await expect(mobile.recordLabourAdvanceAction(INPUT)).rejects.toThrow('audit store unavailable')
    expect(snapshot()).toBe(before)
    expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
  })

  it('retries a serialization conflict and refuses once the concurrent run is finalized', async () => {
    conflicts.push(() => store.runs.push(run({ status: 'VERIFIED', siteId: 'site_c', items: [{ labourId: 'lab_a1' }] })))
    const before = snapshot()
    await expect(mobile.recordLabourAdvanceAction(INPUT)).rejects.toThrow(CLOSED)
    expect(snapshot()).toBe(before)
    expectSerializable(2)
    expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
  })
})

describe('addExistingWorkerToRoster: today on the destination site must be open', () => {
  it.each(closing('lab_b', 'site_a'))('%s: %s refuses with no attendance write and no move', async (_status, _label, salaryRun) => {
    store.runs.push(structuredClone(salaryRun))
    const before = snapshot()

    await expect(mobile.addExistingWorkerToRoster('lab_b', 'site_a')).rejects.toThrow(CLOSED)

    expect(snapshot()).toBe(before)
    expect(labour('lab_b')).toMatchObject({ siteId: 'site_b' })
    expect(writes()).toBe(0)
    expectSerializable(1)
    expectLockBetweenBindingAndWrites(1)
  })

  it('checks exactly the live company, the stored day of today and the worker on the destination site', async () => {
    const result = await mobile.addExistingWorkerToRoster('lab_b', 'site_a')

    expect(result).toMatchObject({ success: true })
    expect(lockCalls()).toEqual([lockWhere(storedDay(LOCAL_TODAY), 'lab_b', 'site_a')])
    expect(labour('lab_b')).toMatchObject({ siteId: 'site_a' })
    expect(store.attendance.filter((row) => row.labourId === 'lab_b')).toEqual([
      expect.objectContaining({ siteId: 'site_a', date: LOCAL_TODAY, status: 'PRESENT', advance: 0 }),
    ])
    expectSerializable(1)
    expectLockBetweenBindingAndWrites(1)
  })

  it.each(unrelated('lab_b', 'site_a'))('%s does not block adding the worker', async (_label, salaryRun) => {
    store.runs.push(structuredClone(salaryRun))
    await expect(mobile.addExistingWorkerToRoster('lab_b', 'site_a')).resolves.toMatchObject({ success: true })
    expect(labour('lab_b')).toMatchObject({ siteId: 'site_a' })
    expectSerializable(1)
  })

  it("refuses another tenant's worker before reading the lock", async () => {
    store.runs.push(run({ siteId: null }))
    await expect(mobile.addExistingWorkerToRoster('lab_x', 'site_a')).rejects.toThrow(/Labour not found or access denied/)
    expect(tx.salaryRun.findFirst).not.toHaveBeenCalled()
    expect(writes()).toBe(0)
  })

  it('retries a serialization conflict and refuses once the concurrent run is finalized', async () => {
    conflicts.push(() => store.runs.push(run({ status: 'PAID', siteId: 'site_a' })))
    const before = snapshot()
    await expect(mobile.addExistingWorkerToRoster('lab_b', 'site_a')).rejects.toThrow(CLOSED)
    expect(snapshot()).toBe(before)
    expectSerializable(2)
  })
})

describe("removeLabourAttendanceAction: today on the worker's current site must be open", () => {
  beforeEach(() => {
    store.attendance.push({ id: 'att_a1_today', labourId: 'lab_a1', siteId: 'site_a', date: LOCAL_TODAY, status: 'PRESENT', advance: 0, startTime: null })
  })

  it.each(closing('lab_a1', 'site_a'))('%s: %s refuses with the row and the audit trail untouched', async (_status, _label, salaryRun) => {
    store.runs.push(structuredClone(salaryRun))
    const before = snapshot()

    await expect(mobile.removeLabourAttendanceAction('lab_a1', 'Ravi')).rejects.toThrow(CLOSED)

    expect(snapshot()).toBe(before)
    expect(attendance('att_a1_today')).toBeDefined()
    expect(writes()).toBe(0)
    expectSerializable(1)
    expectLockBetweenBindingAndWrites(1)
  })

  it('checks exactly the live company, the stored day of today and the worker on its current site', async () => {
    await expect(mobile.removeLabourAttendanceAction('lab_a1', 'Ravi')).resolves.toEqual({ success: true })
    expect(lockCalls()).toEqual([lockWhere(storedDay(LOCAL_TODAY), 'lab_a1', 'site_a')])
    expect(attendance('att_a1_today')).toBeUndefined()
    expect(attendance('att_a1_25')).toBeDefined()
    expect(store.audit).toHaveLength(1)
    expectLockBetweenBindingAndWrites(1)
  })

  it.each(unrelated('lab_a1', 'site_a'))('%s does not block the removal', async (_label, salaryRun) => {
    store.runs.push(structuredClone(salaryRun))
    await expect(mobile.removeLabourAttendanceAction('lab_a1', 'Ravi')).resolves.toEqual({ success: true })
    expect(attendance('att_a1_today')).toBeUndefined()
    expectSerializable(1)
  })

  it('refuses a wrong confirmation before reading the lock', async () => {
    store.runs.push(run({ siteId: null }))
    await expect(mobile.removeLabourAttendanceAction('lab_a1', 'Arun')).rejects.toThrow(/confirmation text/)
    expect(tx.salaryRun.findFirst).not.toHaveBeenCalled()
    expect(writes()).toBe(0)
  })

  it('an audit failure keeps the roster entry', async () => {
    failAudit = true
    const before = snapshot()
    await expect(mobile.removeLabourAttendanceAction('lab_a1', 'Ravi')).rejects.toThrow('audit store unavailable')
    expect(snapshot()).toBe(before)
  })

  it('retries a serialization conflict and refuses once the concurrent run is finalized', async () => {
    conflicts.push(() => store.runs.push(run({ status: 'APPROVED', siteId: null })))
    const before = snapshot()
    await expect(mobile.removeLabourAttendanceAction('lab_a1', 'Ravi')).rejects.toThrow(CLOSED)
    expect(snapshot()).toBe(before)
    expectSerializable(2)
  })
})
