import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { matchesWhere } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'

/**
 * Regression for `saveMobileAttendanceAction` accepting any date in any shape.
 *
 * The roll took `new Date(dateIso)` for any string JavaScript could parse, silently fell
 * back to today on garbage, and truncated with local `setHours(0, 0, 0, 0)`, so the stored
 * `@db.Date` day drifted with the server's timezone. Any role could write any past or
 * future day, including a day already settled by a submitted or paid salary run, and the
 * only record was a best-effort `logActivity` after commit claiming "for today".
 *
 * Policy: the date is exactly `YYYY-MM-DD`, a real calendar day, taken as UTC midnight;
 * absent means today in UTC. Field roles (and any role without `labour.manage`) record
 * only today. A labour manager may correct the last 7 days; no one records the future.
 * A salary run past DRAFT covering the day — company-wide, for an affected site or paying
 * an affected worker — refuses the batch. Every row written gets its own audit row on the
 * write transaction, with the actual day and the before/after status.
 *
 * The clock is pinned to 20:00 UTC, when the local (IST) calendar is already a day ahead.
 * `@/lib/permissions`, `@/lib/auth/require-module` and `@/lib/auth/site-mutation` are real.
 */
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

const NOW = new Date('2026-09-29T20:00:00.000Z')
const TODAY = '2026-09-29'
const ENGINEER = 'user_site_engineer'

/** UTC midnight of a `YYYY-MM-DD` day. */
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`)

const SITES: Row[] = [
  { id: 'site_a', companyId: 'company_1', deletedAt: null, assignedEngineerId: ENGINEER, engineerId: null },
  { id: 'site_b', companyId: 'company_1', deletedAt: null, assignedEngineerId: null, engineerId: null },
  { id: 'site_x', companyId: 'company_2', deletedAt: null, assignedEngineerId: null, engineerId: null },
]

type Store = { labour: Row[]; attendance: Row[]; runs: Row[]; items: Row[]; audit: Row[] }

function seed(): Store {
  return {
    labour: [
      { id: 'lab_a1', companyId: 'company_1', siteId: 'site_a', name: 'Ravi' },
      { id: 'lab_a2', companyId: 'company_1', siteId: 'site_a', name: 'Arun' },
      // Moved from site_a to site_b after being marked on site_a on the 27th.
      { id: 'lab_b', companyId: 'company_1', siteId: 'site_b', name: 'Kumar' },
      { id: 'lab_x', companyId: 'company_2', siteId: 'site_x', name: 'Foreign' },
    ],
    attendance: [
      { id: 'att_a1_25', labourId: 'lab_a1', siteId: 'site_a', date: day('2026-09-25'), status: 'ABSENT', advance: 300, startTime: '08:00' },
      { id: 'att_b_27_on_a', labourId: 'lab_b', siteId: 'site_a', date: day('2026-09-27'), status: 'PRESENT', advance: 0, startTime: null },
    ],
    runs: [],
    items: [],
    audit: [],
  }
}

let store: Store = seed()

const relations: RelationResolver = (row, key) => {
  if (key === 'site') return SITES.find((site) => site.id === row.siteId) ?? null
  return undefined
}

/** `matchesWhere` plus the to-many `items: { some }` filter a salary-run lookup uses. */
function runMatches(run: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Row[]).some((branch) => runMatches(run, branch))
    if (key === 'items') {
      const { some, ...rest } = condition as { some?: Row }
      if (!some || Object.keys(rest).length > 0) throw new Error('salaryRun.items: only `some` is modelled')
      return store.items.some((item) => item.salaryRunId === run.id && matchesWhere(item, some))
    }
    return matchesWhere(run, { [key]: condition })
  })
}

const tx = {
  labour: {
    findMany: vi.fn(async (args: { where: Row }) => store.labour.filter((row) => matchesWhere(row, args.where, relations))),
  },
  labourAttendance: {
    findFirst: vi.fn(async (args: { where: Row }) => store.attendance.find((row) => matchesWhere(row, args.where)) ?? null),
    upsert: vi.fn(async (args: { where: { labourId_date: { labourId: string; date: Date }; siteId: string }; create: Row; update: Row }) => {
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
    findFirst: vi.fn(async (args: { where: Row }) => store.runs.find((run) => runMatches(run, args.where)) ?? null),
  },
  auditLog: {
    create: vi.fn(async (args: { data: Row }) => {
      if (mocks.auditFails.value) throw new Error('audit down')
      store.audit.push(args.data)
      return args.data
    }),
  },
}

Object.assign(mocks.prisma, {
  company: { findUnique: vi.fn(async () => ({ modulesJson: ['SITES', 'LABOUR'], status: 'ACTIVE' })) },
  // Supervisors and subcontractors are assigned site_a by membership; the engineer directly.
  companyMember: { findFirst: vi.fn(async () => ({ siteIds: ['site_a'] })) },
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

function as(role: string) {
  const id = role === 'SITE_ENGINEER' ? ENGINEER : `user_${role.toLowerCase()}`
  mocks.requireUser.mockResolvedValue({ id, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId: 'company_1' })
}

function writes() {
  return tx.labourAttendance.upsert.mock.calls.length + tx.auditLog.create.mock.calls.length
}

const row = (id: string) => store.attendance.find((candidate) => candidate.id === id)
const rowsOf = (labourId: string, ymd: string) =>
  store.attendance.filter((candidate) => candidate.labourId === labourId && (candidate.date as Date).getTime() === day(ymd).getTime())

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  store = seed()
  mocks.auditFails.value = false
  as('COMPANY_ADMIN')
})

afterEach(() => {
  vi.useRealTimers()
})

const FIELD_ROLES = ['SITE_ENGINEER', 'SUPERVISOR', 'SUBCONTRACTOR']
const FINALIZED = ['SUBMITTED', 'VERIFIED', 'APPROVED', 'PAID']

describe('the roll date is exactly YYYY-MM-DD, in UTC', () => {
  it.each([
    '2026-9-25', '2026-09-5', '20260925', '25-09-2026', '2026/09/25',
    '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00+05:30', '2026-09-25 ', ' 2026-09-25', '2026-09-25\n',
    '2026-02-30', '2026-13-01', '2026-00-10', '2026-09-00', '2026-09-31', '0026-09-25', '+002026-09-25',
    'Fri Sep 25 2026', '', 'today',
    null, 1790294400000, day('2026-09-25'),
  ])('refuses %j before any read or write', async (raw) => {
    await expect(mobile.saveMobileAttendanceAction([{ labourId: 'lab_a1', siteId: 'site_a', status: 'PRESENT' }], raw as string))
      .rejects.toThrow(/Invalid attendance date/)
    expect($transaction).not.toHaveBeenCalled()
    expect(writes()).toBe(0)
  })

  it('no date means today in UTC, even after the local calendar has rolled over', async () => {
    as('SITE_ENGINEER')
    await expect(mobile.saveMobileAttendanceAction([{ labourId: 'lab_a1', siteId: 'site_a', status: 'PRESENT' }]))
      .resolves.toEqual({ success: true, count: 1 })

    expect(rowsOf('lab_a1', TODAY)).toEqual([expect.objectContaining({ siteId: 'site_a', status: 'PRESENT' })])
    expect((tx.labourAttendance.upsert.mock.calls[0][0].where.labourId_date.date as Date).toISOString()).toBe('2026-09-29T00:00:00.000Z')
    expect(store.audit[0].after).toMatchObject({ date: TODAY, correction: false })
  })

  it('an explicit day is stored at UTC midnight of exactly that day', async () => {
    await mobile.saveMobileAttendanceAction([{ labourId: 'lab_a2', siteId: 'site_a', status: 'HALF_DAY' }], '2026-09-24')

    expect(rowsOf('lab_a2', '2026-09-24')).toEqual([expect.objectContaining({ status: 'HALF_DAY' })])
    expect((tx.labourAttendance.upsert.mock.calls[0][0].where.labourId_date.date as Date).toISOString()).toBe('2026-09-24T00:00:00.000Z')
  })
})

describe('field roles record only today (UTC)', () => {
  it.each(FIELD_ROLES)('%s records today, given explicitly', async (role) => {
    as(role)
    await expect(mobile.saveMobileAttendanceAction([{ labourId: 'lab_a1', siteId: 'site_a', status: 'PRESENT' }], TODAY))
      .resolves.toEqual({ success: true, count: 1 })
    expect(rowsOf('lab_a1', TODAY)).toHaveLength(1)
  })

  it.each(FIELD_ROLES.flatMap((role) => ['2026-09-28', '2026-09-25', '2026-01-01'].map((date) => [role, date])))(
    '%s cannot record the past day %s',
    async (role, date) => {
      as(role)
      await expect(mobile.saveMobileAttendanceAction([{ labourId: 'lab_a1', siteId: 'site_a', status: 'PRESENT' }], date))
        .rejects.toThrow(/Only today's attendance/)
      expect($transaction).not.toHaveBeenCalled()
      expect(row('att_a1_25')).toMatchObject({ status: 'ABSENT' })
    },
  )

  // 2026-09-30 is already "today" on the local (IST) calendar at the pinned instant.
  it.each(FIELD_ROLES.flatMap((role) => ['2026-09-30', '2027-09-29'].map((date) => [role, date])))(
    '%s cannot record the future day %s',
    async (role, date) => {
      as(role)
      await expect(mobile.saveMobileAttendanceAction([{ labourId: 'lab_a1', siteId: 'site_a', status: 'PRESENT' }], date))
        .rejects.toThrow(/future date/)
      expect($transaction).not.toHaveBeenCalled()
    },
  )

  it('PROJECT_MANAGER, which marks attendance without labour.manage, records only today', async () => {
    as('PROJECT_MANAGER')
    await expect(mobile.saveMobileAttendanceAction([{ labourId: 'lab_a1', siteId: 'site_a', status: 'PRESENT' }], '2026-09-28'))
      .rejects.toThrow(/Only today's attendance/)
    await expect(mobile.saveMobileAttendanceAction([{ labourId: 'lab_a1', siteId: 'site_a', status: 'PRESENT' }], TODAY))
      .resolves.toEqual({ success: true, count: 1 })
  })
})

describe('a labour manager corrects only the last 7 days', () => {
  it.each(['2026-09-28', '2026-09-25', '2026-09-22'])('corrects %s', async (date) => {
    await expect(mobile.saveMobileAttendanceAction([{ labourId: 'lab_a1', siteId: 'site_a', status: 'PRESENT' }], date))
      .resolves.toEqual({ success: true, count: 1 })
    expect(rowsOf('lab_a1', date)).toEqual([expect.objectContaining({ siteId: 'site_a', status: 'PRESENT' })])
    expect(store.audit[store.audit.length - 1].after).toMatchObject({ date, correction: true })
  })

  it.each(['2026-09-21', '2026-08-29', '2025-09-29'])('cannot correct %s, outside the window', async (date) => {
    await expect(mobile.saveMobileAttendanceAction([{ labourId: 'lab_a1', siteId: 'site_a', status: 'PRESENT' }], date))
      .rejects.toThrow(/only for the last 7 days/)
    expect($transaction).not.toHaveBeenCalled()
    expect(writes()).toBe(0)
  })

  it.each(['2026-09-30', '2026-10-06', '2099-01-01'])('cannot record the future day %s', async (date) => {
    await expect(mobile.saveMobileAttendanceAction([{ labourId: 'lab_a1', siteId: 'site_a', status: 'PRESENT' }], date))
      .rejects.toThrow(/future date/)
    expect($transaction).not.toHaveBeenCalled()
  })
})

describe('a salary run past DRAFT closes the day', () => {
  const run = (patch: Row) => ({
    id: 'run_1', companyId: 'company_1', siteId: null, status: 'PAID',
    periodStart: day('2026-09-21'), periodEnd: day('2026-09-27'), ...patch,
  })

  it.each(FINALIZED.flatMap((status) => [
    [status, 'a company-wide run', run({ status })],
    [status, 'a run for the worker\'s site', run({ status, siteId: 'site_a' })],
    [status, 'a run on another site that pays the worker', run({ status, siteId: 'site_b' })],
  ]))('%s: %s refuses the correction, writing nothing', async (_status, _label, salaryRun) => {
    store.runs.push(salaryRun as Row)
    store.items.push({ id: 'item_1', salaryRunId: 'run_1', labourId: 'lab_a1' })
    const before = JSON.stringify(store.attendance)

    await expect(mobile.saveMobileAttendanceAction([
      { labourId: 'lab_a2', siteId: 'site_a', status: 'PRESENT' },
      { labourId: 'lab_a1', siteId: 'site_a', status: 'PRESENT' },
    ], '2026-09-25')).rejects.toThrow(/submitted, approved or paid salary run/)

    expect(JSON.stringify(store.attendance)).toBe(before)
    expect(writes()).toBe(0)
    expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
  })

  it('a submitted run covering today refuses a field role marking today', async () => {
    as('SUPERVISOR')
    store.runs.push(run({ status: 'SUBMITTED', periodStart: day('2026-09-28'), periodEnd: day('2026-10-04') }))
    await expect(mobile.saveMobileAttendanceAction([{ labourId: 'lab_a1', siteId: 'site_a', status: 'PRESENT' }]))
      .rejects.toThrow(/salary run/)
    expect(writes()).toBe(0)
  })

  it.each([
    ['a DRAFT run', run({ status: 'DRAFT' })],
    ['a paid run on another site that does not pay the worker', run({ siteId: 'site_b' })],
    ['a paid run for an earlier period', run({ periodStart: day('2026-09-14'), periodEnd: day('2026-09-20') })],
    ['a paid run for a later period', run({ periodStart: day('2026-09-26'), periodEnd: day('2026-09-28') })],
    ['another company\'s paid run', run({ companyId: 'company_2' })],
  ])('%s does not block the correction', async (_label, salaryRun) => {
    store.runs.push(salaryRun)
    store.items.push({ id: 'item_other', salaryRunId: 'run_1', labourId: 'lab_b' })
    await expect(mobile.saveMobileAttendanceAction([{ labourId: 'lab_a1', siteId: 'site_a', status: 'PRESENT' }], '2026-09-25'))
      .resolves.toEqual({ success: true, count: 1 })
    expect(row('att_a1_25')).toMatchObject({ status: 'PRESENT' })
  })
})

describe('every row written is audited on the write transaction', () => {
  it('writes one audit row per mutation with the actual day and before/after status', async () => {
    await mobile.saveMobileAttendanceAction([
      { labourId: 'lab_a1', siteId: 'site_a', status: 'PRESENT' },
      { labourId: 'lab_a2', siteId: 'site_a', status: 'HALF_DAY', startTime: '09:00' },
    ], '2026-09-25')

    expect(store.audit).toHaveLength(2)
    expect(store.audit[0]).toMatchObject({
      userId: 'user_company_admin',
      companyId: 'company_1',
      action: 'UPDATE',
      module: 'ATTENDANCE',
      recordId: 'att_a1_25',
      before: { labourId: 'lab_a1', siteId: 'site_a', date: '2026-09-25', status: 'ABSENT', startTime: '08:00' },
      after: { labourId: 'lab_a1', siteId: 'site_a', date: '2026-09-25', status: 'PRESENT', startTime: '08:00', correction: true },
    })
    expect((store.audit[0].after as Row)._description).toMatch(/corrected attendance for 2026-09-25: ABSENT → PRESENT/)

    const created = rowsOf('lab_a2', '2026-09-25')[0]
    expect(store.audit[1]).toMatchObject({
      action: 'CREATE',
      recordId: created.id,
      after: { labourId: 'lab_a2', siteId: 'site_a', date: '2026-09-25', status: 'HALF_DAY', startTime: '09:00', correction: true },
    })
    expect(store.audit[1].before).toBeUndefined()
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })

  it('an audit failure rolls back every row of the batch', async () => {
    mocks.auditFails.value = true
    const before = JSON.stringify(store.attendance)

    await expect(mobile.saveMobileAttendanceAction([
      { labourId: 'lab_a1', siteId: 'site_a', status: 'PRESENT' },
      { labourId: 'lab_a2', siteId: 'site_a', status: 'PRESENT' },
    ], '2026-09-25')).rejects.toThrow(/audit down/)

    expect(JSON.stringify(store.attendance)).toBe(before)
    expect(store.audit).toEqual([])
    expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })

  it('a later row that fails rolls back the earlier rows and their audit', async () => {
    const before = JSON.stringify(store.attendance)

    await expect(mobile.saveMobileAttendanceAction([
      { labourId: 'lab_a1', siteId: 'site_a', status: 'PRESENT' },
      { labourId: 'lab_b', siteId: 'site_b', status: 'PRESENT' },
    ], '2026-09-27')).rejects.toThrow(/recorded on another site/)

    expect(JSON.stringify(store.attendance)).toBe(before)
    expect(store.audit).toEqual([])
  })
})

describe('site authority is unchanged', () => {
  it('a field role cannot mark a worker on a site it is not assigned to', async () => {
    as('SITE_ENGINEER')
    await expect(mobile.saveMobileAttendanceAction([
      { labourId: 'lab_a1', siteId: 'site_a', status: 'PRESENT' },
      { labourId: 'lab_b', siteId: 'site_b', status: 'PRESENT' },
    ])).rejects.toThrow(/Labour not found or access denied/)
    expect(writes()).toBe(0)
  })

  it.each([
    ["a site other than the worker's", { labourId: 'lab_a1', siteId: 'site_b' }],
    ["another tenant's worker", { labourId: 'lab_x', siteId: 'site_x' }],
  ])('a labour manager correction refuses %s', async (_label, record) => {
    await expect(mobile.saveMobileAttendanceAction([{ ...record, status: 'PRESENT' }], '2026-09-25'))
      .rejects.toThrow(/Labour not found or access denied/)
    expect(writes()).toBe(0)
  })

  it('a correction never rewrites another site\'s row for the same worker and day', async () => {
    await expect(mobile.saveMobileAttendanceAction([{ labourId: 'lab_b', siteId: 'site_b', status: 'ABSENT' }], '2026-09-27'))
      .rejects.toThrow(/recorded on another site/)
    expect(row('att_b_27_on_a')).toMatchObject({ siteId: 'site_a', status: 'PRESENT' })
  })

  it('a correction still refuses an advance before any read, and never touches the recorded one', async () => {
    await expect(mobile.saveMobileAttendanceAction([{ labourId: 'lab_a1', siteId: 'site_a', status: 'PRESENT', advance: 50 }], '2026-09-25'))
      .rejects.toThrow(/advance is a payment/)
    expect($transaction).not.toHaveBeenCalled()

    await mobile.saveMobileAttendanceAction([{ labourId: 'lab_a1', siteId: 'site_a', status: 'HALF_DAY', advance: 0 }], '2026-09-25')
    expect(row('att_a1_25')).toMatchObject({ status: 'HALF_DAY', advance: 300 })
    expect(tx.labourAttendance.upsert.mock.calls[0][0].update).not.toHaveProperty('advance')
  })
})
