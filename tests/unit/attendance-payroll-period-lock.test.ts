import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { matchesWhere } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'
import { PAYROLL_PERIOD_CLOSED, PAYROLL_TRANSACTION_OPTIONS } from '@/lib/payroll-period-lock'

/**
 * The attendance writers route through the shared payroll-period lock.
 *
 * `saveMobileAttendanceAction` (the muster-roll batch) and `POST /api/attendance` must run
 * in one SERIALIZABLE `payrollTransaction` and call `assertPayrollPeriodOpen` after the
 * exact tenant/site/worker binding reads and before their first mutation. A day inside a
 * salary run of the same company past DRAFT that is company-wide, for a booked site, or
 * includes a booked worker refuses the whole batch with no attendance or audit write; the
 * API answers 403. DRAFT runs, other companies' runs, unrelated sites and workers, and
 * other periods are left alone. A serialization conflict retries the whole transaction,
 * so a run finalized by the concurrent winner is seen and refuses the retry.
 *
 * The delegates evaluate the real `where` over an in-memory store; `$transaction` records
 * its options and rolls the store back when the callback throws or the commit conflicts.
 * `@/lib/permissions`, `@/lib/auth/require-module`, `@/lib/auth/site-mutation`,
 * `@/lib/labour-attendance` and `@/lib/payroll-period-lock` are real.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  logActivity: vi.fn(),
  syncSiteBudget: vi.fn(),
  prisma: {} as Record<string, unknown>,
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('@/lib/budget', () => ({ syncSiteBudget: mocks.syncSiteBudget }))

const mobile = await import('@/actions/mobile-labour')
const { POST } = await import('@/app/api/attendance/route')

const NOW = new Date('2026-09-29T06:00:00.000Z')
const ENGINEER = 'user_site_engineer'
const FINALIZED = ['SUBMITTED', 'VERIFIED', 'APPROVED', 'PAID']
const CLOSED = new RegExp(PAYROLL_PERIOD_CLOSED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

/** UTC midnight of a `YYYY-MM-DD` day. */
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`)

const SITES: Row[] = [
  { id: 'site_a', companyId: 'company_1', deletedAt: null, assignedEngineerId: ENGINEER, engineerId: null },
  { id: 'site_b', companyId: 'company_1', deletedAt: null, assignedEngineerId: null, engineerId: null },
  { id: 'site_x', companyId: 'company_2', deletedAt: null, assignedEngineerId: ENGINEER, engineerId: null },
]

type Run = Row & { items: Row[] }
type Store = { labour: Row[]; attendance: Row[]; runs: Run[]; audit: Row[] }

function seed(): Store {
  return {
    labour: [
      { id: 'lab_a1', companyId: 'company_1', siteId: 'site_a', name: 'Ravi' },
      { id: 'lab_a2', companyId: 'company_1', siteId: 'site_a', name: 'Arun' },
      { id: 'lab_b', companyId: 'company_1', siteId: 'site_b', name: 'Kumar' },
      { id: 'lab_x', companyId: 'company_2', siteId: 'site_x', name: 'Foreign' },
    ],
    attendance: [
      { id: 'att_a1_25', labourId: 'lab_a1', siteId: 'site_a', date: day('2026-09-25'), status: 'ABSENT', advance: 300, startTime: null },
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

const relations: RelationResolver = (row, key) => {
  if (key === 'site') return SITES.find((site) => site.id === row.siteId) ?? null
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

const tx = {
  labour: {
    findMany: logged('labour.findMany', async (args: { where: Row }) =>
      store.labour.filter((row) => matchesWhere(row, args.where, relations))),
  },
  labourAttendance: {
    findFirst: logged('labourAttendance.findFirst', async (args: { where: Row }) =>
      store.attendance.find((row) => matchesWhere(row, args.where)) ?? null),
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
  },
  salaryRun: {
    findFirst: logged('salaryRun.findFirst', async (args: { where: Row }) =>
      store.runs.find((run) => runMatches(run, args.where)) ?? null),
  },
  auditLog: {
    create: logged('auditLog.create', async (args: { data: Row }) => {
      store.audit.push(args.data)
      return args.data
    }),
  },
}

Object.assign(mocks.prisma, {
  company: { findUnique: vi.fn(async () => ({ modulesJson: ['SITES', 'LABOUR'], status: 'ACTIVE' })) },
  companyMember: { findFirst: vi.fn(async () => ({ siteIds: [] })) },
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
  const id = role === 'SITE_ENGINEER' ? ENGINEER : `user_${role.toLowerCase()}`
  mocks.requireUser.mockResolvedValue({ id, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId })
}

function run(patch: Partial<Run>): Run {
  // Wide enough to cover the API's local-midnight day in any server timezone.
  return {
    id: 'run_1', companyId: 'company_1', siteId: null, status: 'APPROVED',
    periodStart: day('2026-09-22'), periodEnd: day('2026-10-05'), items: [], ...patch,
  }
}

/** Runs that close the batch day: each covers lab_a2 on site_a, by company, site or item. */
const CLOSING: Array<[string, string, Run]> = FINALIZED.flatMap((status): Array<[string, string, Run]> => [
  [status, 'a company-wide run', run({ status, siteId: null })],
  [status, 'a run for exactly the booked site', run({ status, siteId: 'site_a' })],
  [status, 'a run on another site that includes a booked worker', run({ status, siteId: 'site_b', items: [{ labourId: 'lab_a2' }] })],
])

const UNRELATED: Array<[string, Run]> = [
  ['a DRAFT company-wide run', run({ status: 'DRAFT', siteId: null })],
  ['a DRAFT run of the site including the worker', run({ status: 'DRAFT', siteId: 'site_a', items: [{ labourId: 'lab_a2' }] })],
  ['a finalized run of an unrelated site and worker', run({ siteId: 'site_b', items: [{ labourId: 'lab_b' }] })],
  ["another company's company-wide run", run({ companyId: 'company_2', siteId: null })],
  ["another company's run including the worker", run({ companyId: 'company_2', siteId: 'site_a', items: [{ labourId: 'lab_a2' }] })],
  ['a finalized company-wide run of an earlier period', run({ siteId: null, periodStart: day('2026-09-01'), periodEnd: day('2026-09-14') })],
]

function writes() {
  return tx.labourAttendance.upsert.mock.calls.length + tx.auditLog.create.mock.calls.length
}

function expectSerializable(times: number) {
  expect($transaction).toHaveBeenCalledTimes(times)
  for (const call of $transaction.mock.calls) expect(call[1]).toEqual({ isolationLevel: 'Serializable' })
  expect(PAYROLL_TRANSACTION_OPTIONS).toEqual({ isolationLevel: 'Serializable' })
}

/** The lock is read once, after the worker binding and before any attendance read or write. */
function expectLockBetweenBindingAndWrites() {
  const lock = calls.indexOf('salaryRun.findFirst')
  expect(calls.indexOf('labour.findMany')).toBeGreaterThanOrEqual(0)
  expect(calls.indexOf('labour.findMany')).toBeLessThan(lock)
  expect(calls.filter((name) => name === 'salaryRun.findFirst')).toHaveLength(1)
  const firstWriteSide = calls.findIndex((name) => name.startsWith('labourAttendance.') || name === 'auditLog.create')
  if (firstWriteSide >= 0) expect(lock).toBeLessThan(firstWriteSide)
}

async function post(body: unknown) {
  const response = await POST(new Request('http://test/api/attendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
  return { status: response.status, json: await response.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  store = seed()
  conflicts = []
  calls = []
  as('COMPANY_ADMIN')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('saveMobileAttendanceAction: a finalized salary run closes the batch', () => {
  const BATCH = [
    { labourId: 'lab_a1', siteId: 'site_a', status: 'PRESENT' },
    { labourId: 'lab_a2', siteId: 'site_a', status: 'HALF_DAY' },
  ]

  it.each(CLOSING)('%s: %s refuses the whole batch with no attendance or audit write', async (_status, _label, salaryRun) => {
    store.runs.push(structuredClone(salaryRun))
    const before = JSON.stringify(store.attendance)

    await expect(mobile.saveMobileAttendanceAction(BATCH, '2026-09-25')).rejects.toThrow(CLOSED)

    expect(JSON.stringify(store.attendance)).toBe(before)
    expect(store.audit).toEqual([])
    expect(writes()).toBe(0)
    expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalled()
    // A closed period is not a conflict: it is refused once, never retried.
    expectSerializable(1)
    expectLockBetweenBindingAndWrites()
  })

  it('checks exactly the live company, the parsed UTC day and every booked worker and site', async () => {
    await mobile.saveMobileAttendanceAction(BATCH, '2026-09-25')
    const { where } = tx.salaryRun.findFirst.mock.calls[0][0]
    expect(where).toEqual({
      companyId: 'company_1',
      status: { not: 'DRAFT' },
      periodStart: { lte: day('2026-09-25') },
      periodEnd: { gte: day('2026-09-25') },
      OR: [
        { siteId: null },
        { siteId: { in: ['site_a'] } },
        { items: { some: { labourId: { in: ['lab_a1', 'lab_a2'] } } } },
      ],
    })
  })

  it('a field role marking today is refused by a run covering today', async () => {
    as('SITE_ENGINEER')
    store.runs.push(run({ status: 'SUBMITTED', siteId: 'site_a' }))
    await expect(mobile.saveMobileAttendanceAction([{ labourId: 'lab_a1', siteId: 'site_a', status: 'PRESENT' }]))
      .rejects.toThrow(CLOSED)
    expect(tx.salaryRun.findFirst.mock.calls[0][0].where.periodStart).toEqual({ lte: day('2026-09-29') })
    expect(writes()).toBe(0)
  })

  it.each(UNRELATED)('%s does not block the batch', async (_label, salaryRun) => {
    store.runs.push(structuredClone(salaryRun))
    await expect(mobile.saveMobileAttendanceAction(BATCH, '2026-09-25')).resolves.toEqual({ success: true, count: 2 })

    expect(store.attendance.find((row) => row.id === 'att_a1_25')).toMatchObject({ status: 'PRESENT', advance: 300 })
    expect(store.audit).toHaveLength(2)
    expectSerializable(1)
    expectLockBetweenBindingAndWrites()
  })

  it('binds the exact tenant, scope and site before reading the lock', async () => {
    store.runs.push(run({ siteId: null }))
    as('SITE_ENGINEER')
    for (const record of [
      { labourId: 'lab_b', siteId: 'site_b' },
      { labourId: 'lab_x', siteId: 'site_x' },
      { labourId: 'lab_a1', siteId: 'site_b' },
    ]) {
      await expect(mobile.saveMobileAttendanceAction([{ ...record, status: 'PRESENT' }]))
        .rejects.toThrow(/Labour not found or access denied/)
    }
    expect(tx.salaryRun.findFirst).not.toHaveBeenCalled()
    expect(writes()).toBe(0)
  })

  it('still refuses an advance before any read, and never writes one', async () => {
    store.runs.push(run({ status: 'DRAFT' }))
    await expect(mobile.saveMobileAttendanceAction([{ labourId: 'lab_a1', siteId: 'site_a', status: 'PRESENT', advance: 1 }], '2026-09-25'))
      .rejects.toThrow(/advance is a payment/)
    expect($transaction).not.toHaveBeenCalled()
  })

  it('retries a serialization conflict and refuses once the concurrent run is finalized', async () => {
    conflicts.push(() => store.runs.push(run({ status: 'APPROVED', siteId: 'site_a' })))
    const before = JSON.stringify(store.attendance)

    await expect(mobile.saveMobileAttendanceAction(BATCH, '2026-09-25')).rejects.toThrow(CLOSED)

    expect(JSON.stringify(store.attendance)).toBe(before)
    expect(store.audit).toEqual([])
    expectSerializable(2)
    expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
  })

  it('a retried batch commits each row and its audit exactly once', async () => {
    conflicts.push(() => {})
    await expect(mobile.saveMobileAttendanceAction(BATCH, '2026-09-25')).resolves.toEqual({ success: true, count: 2 })

    expectSerializable(2)
    expect(store.attendance.filter((row) => (row.date as Date).getTime() === day('2026-09-25').getTime())).toHaveLength(2)
    expect(store.audit.map((row) => (row.after as Row).labourId)).toEqual(['lab_a1', 'lab_a2'])
  })
})

describe('POST /api/attendance: a finalized salary run answers 403', () => {
  const BODY = { attendance: [{ labourId: 'lab_a1', status: 'PRESENT' }, { labourId: 'lab_a2', status: 'ABSENT' }] }

  it.each(CLOSING)('%s: %s refuses the whole batch with 403 and no attendance write', async (_status, _label, salaryRun) => {
    store.runs.push(structuredClone(salaryRun))
    const before = JSON.stringify(store.attendance)

    const { status, json } = await post(BODY)

    expect(status).toBe(403)
    expect(json).toEqual({ error: PAYROLL_PERIOD_CLOSED })
    expect(JSON.stringify(store.attendance)).toBe(before)
    expect(store.audit).toEqual([])
    expect(writes()).toBe(0)
    expectSerializable(1)
    expectLockBetweenBindingAndWrites()
  })

  it('checks the stored site of each worker, the live company and the day it writes', async () => {
    as('SITE_ENGINEER')
    const { status } = await post(BODY)
    expect(status).toBe(200)

    const { where } = tx.salaryRun.findFirst.mock.calls[0][0]
    const written = tx.labourAttendance.upsert.mock.calls[0][0].where.labourId_date.date as Date
    const writtenDay = new Date(Date.UTC(written.getUTCFullYear(), written.getUTCMonth(), written.getUTCDate()))
    expect(where).toEqual({
      companyId: 'company_1',
      status: { not: 'DRAFT' },
      periodStart: { lte: writtenDay },
      periodEnd: { gte: writtenDay },
      OR: [
        { siteId: null },
        { siteId: { in: ['site_a'] } },
        { items: { some: { labourId: { in: ['lab_a1', 'lab_a2'] } } } },
      ],
    })
  })

  it.each(UNRELATED)('%s does not block the batch', async (_label, salaryRun) => {
    store.runs.push(structuredClone(salaryRun))
    const { status, json } = await post(BODY)
    expect(status).toBe(200)
    expect(json).toEqual({ success: true, count: 2 })
    expect(tx.labourAttendance.upsert).toHaveBeenCalledTimes(2)
    expectSerializable(1)
    expectLockBetweenBindingAndWrites()
  })

  it.each([
    ["another tenant's worker", 'lab_x'],
    ['a worker on a site outside the field scope', 'lab_b'],
    ['a missing worker', 'missing'],
  ])('refuses %s as not found before reading the lock', async (_label, labourId) => {
    as('SITE_ENGINEER')
    store.runs.push(run({ siteId: null }))
    const { status, json } = await post({ attendance: [{ labourId: 'lab_a1', status: 'PRESENT' }, { labourId, status: 'PRESENT' }] })
    expect(status).toBe(403)
    expect(json.error).toMatch(/Labour not found or access denied/)
    expect(tx.salaryRun.findFirst).not.toHaveBeenCalled()
    expect(writes()).toBe(0)
  })

  it('a batch that marks nothing reads no lock and writes nothing', async () => {
    store.runs.push(run({ siteId: null }))
    const { status, json } = await post({ attendance: [{ labourId: 'lab_a1', status: '' }] })
    expect(status).toBe(200)
    expect(json).toEqual({ success: true, count: 0 })
    expect($transaction).not.toHaveBeenCalled()
  })

  it('retries a serialization conflict and answers 403 once the concurrent run is finalized', async () => {
    conflicts.push(() => store.runs.push(run({ status: 'PAID', siteId: 'site_b', items: [{ labourId: 'lab_a1' }] })))
    const before = JSON.stringify(store.attendance)

    const { status, json } = await post(BODY)

    expect(status).toBe(403)
    expect(json).toEqual({ error: PAYROLL_PERIOD_CLOSED })
    expect(JSON.stringify(store.attendance)).toBe(before)
    expectSerializable(2)
  })

  it('an exhausted serialization conflict is not reported as a closed period', async () => {
    conflicts.push(() => {}, () => {}, () => {})
    await expect(post(BODY)).rejects.toMatchObject({ code: 'P2034' })
    expectSerializable(3)
    expect(store.attendance).toHaveLength(1)
  })
})
