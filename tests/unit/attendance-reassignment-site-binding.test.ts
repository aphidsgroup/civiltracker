import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'

/**
 * Regression for attendance writes mutating another site's record after a worker is
 * reassigned.
 *
 * `LabourAttendance` is unique on (labourId, date), and every muster-roll write upserted
 * by that key alone. Once a worker moved from site A to site B, any write at B for a date
 * the worker already had a row on A — marking the roll, adding the worker to B's roster,
 * recording an advance through the worker edit, or the attendance API — silently updated
 * A's historical record: its status, start time and advance money. A field user assigned
 * only to B thereby wrote on A, and an admin working B rewrote A's history without ever
 * naming A.
 *
 * Policy (fail closed): an attendance write is bound to exactly the one current site it
 * is made for. An existing row for the same (worker, date) on any other site is never
 * touched; the write is refused. Moving a worker is refused while it has a row for today
 * or later on a site other than the destination, so a reassignment never leaves a live
 * same-key row on the old site. Migrating history between sites is not offered.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module` and `@/lib/auth/site-mutation` are real.
 */
const mocks = vi.hoisted(() => {
  const tx = {
    labour: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    labourAttendance: { findFirst: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    requireUser: vi.fn(),
    revalidatePath: vi.fn(),
    logActivity: vi.fn(),
    syncSiteBudget: vi.fn(),
    tx,
    prisma: {
      company: { findUnique: vi.fn() },
      companyMember: { findFirst: vi.fn() },
      site: { findFirst: vi.fn() },
      labour: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
      labourAttendance: { findFirst: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('@/lib/budget', () => ({ syncSiteBudget: mocks.syncSiteBudget }))

const mobile = await import('@/actions/mobile-labour')
const { POST } = await import('@/app/api/attendance/route')

const OLD_ENGINEER = 'user_old_engineer'
const NEW_ENGINEER = 'user_new_engineer'

const SITES: Row[] = [
  { id: 'site_old', companyId: 'company_1', deletedAt: null, assignedEngineerId: OLD_ENGINEER, engineerId: null },
  { id: 'site_new', companyId: 'company_1', deletedAt: null, assignedEngineerId: NEW_ENGINEER, engineerId: null },
]

function today() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

const PAST = new Date('2026-09-01T00:00:00')

let LABOUR: Row[]
let ATTENDANCE: Row[]

const relations: RelationResolver = (row, key) => {
  if (key === 'site') return SITES.find((site) => site.id === row.siteId) ?? null
  if (key === 'labour') return LABOUR.find((worker) => worker.id === row.labourId) ?? null
  return undefined
}

function principal(role: string, id = `user_${role.toLowerCase()}`) {
  return { id, name: role, email: `${id}@acme.test`, role, companyId: 'company_1' }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Worker lab_moved was on site_old and has just been reassigned to site_new.
  LABOUR = [
    { id: 'lab_moved', companyId: 'company_1', siteId: 'site_new', name: 'Ravi', trade: 'MASON', phone: null },
    { id: 'lab_stay', companyId: 'company_1', siteId: 'site_new', name: 'Arun', trade: 'HELPER', phone: null },
    { id: 'lab_old', companyId: 'company_1', siteId: 'site_old', name: 'Kumar', trade: 'HELPER', phone: null },
  ]
  ATTENDANCE = [
    // Historical and today's rows recorded on the old site before the move.
    { id: 'att_old_today', labourId: 'lab_moved', siteId: 'site_old', date: today(), status: 'PRESENT', advance: 200 },
    { id: 'att_old_past', labourId: 'lab_moved', siteId: 'site_old', date: PAST, status: 'PRESENT', advance: 500 },
    // A same-site row for a worker that never moved.
    { id: 'att_stay_today', labourId: 'lab_stay', siteId: 'site_new', date: today(), status: 'ABSENT', advance: 0 },
    // lab_old still works on site_old and was marked there today.
    { id: 'att_lab_old_today', labourId: 'lab_old', siteId: 'site_old', date: today(), status: 'PRESENT', advance: 0 },
  ]

  mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER', NEW_ENGINEER))
  mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['SITES', 'LABOUR'], status: 'ACTIVE' })
  mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: [] })
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)

  for (const delegate of [mocks.prisma.labour, mocks.tx.labour]) {
    delegate.findFirst.mockImplementation((args: Row) => inMemoryDelegate(LABOUR, relations).findFirst(args))
    delegate.findMany.mockImplementation((args: Row) => inMemoryDelegate(LABOUR, relations).findMany(args))
    delegate.updateMany.mockImplementation((args: Row) => inMemoryDelegate(LABOUR, relations).updateMany(args))
  }
  for (const delegate of [mocks.prisma.labourAttendance, mocks.tx.labourAttendance]) {
    delegate.findFirst.mockImplementation((args: Row) => inMemoryDelegate(ATTENDANCE, relations).findFirst(args))
    delegate.deleteMany.mockImplementation((args: Row) => inMemoryDelegate(ATTENDANCE, relations).updateMany(args))
    // A unique-key upsert over the store: it updates the row the key (plus any extra filter)
    // resolves to, and otherwise creates — which the (labourId, date) constraint refuses
    // when a row with that key already exists.
    delegate.upsert.mockImplementation(async (args: { where: Row; create: Row; update: Row }) => {
      const key = (args.where as { labourId_date: { labourId: string; date: Date } }).labourId_date
      const sameKey = ATTENDANCE.filter((row) => row.labourId === key.labourId && (row.date as Date).getTime() === key.date.getTime())
      const extra = Object.entries(args.where).filter(([field]) => field !== 'labourId_date')
      const target = sameKey.filter((row) => extra.every(([field, value]) => row[field] === value))
      if (target.length === 1) {
        Object.assign(target[0], Object.fromEntries(Object.entries(args.update).filter(([, value]) => value !== undefined)))
        return target[0]
      }
      if (sameKey.length > 0) throw new Error('Unique constraint failed on the fields: (`labourId`,`date`)')
      const created = { id: `att_new_${ATTENDANCE.length}`, ...args.create }
      ATTENDANCE.push(created)
      return created
    })
  }
  mocks.tx.auditLog.create.mockResolvedValue({ id: 'audit_1' })
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx))
})

/** A deep snapshot of the old site's attendance rows, to prove they were never touched. */
function oldSiteRows() {
  return JSON.stringify(ATTENDANCE.filter((row) => row.siteId === 'site_old'))
}

async function post(body: unknown) {
  const response = await POST(new Request('http://test/api/attendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
  return { status: response.status, json: await response.json() }
}

const OTHER_SITE = /Attendance for this date is recorded on another site/

describe('a worker moved to a new site: the new-site field user gets no write on old-site attendance', () => {
  it('saveMobileAttendanceAction refuses to overwrite today\'s old-site row, writing nothing', async () => {
    const before = oldSiteRows()

    await expect(mobile.saveMobileAttendanceAction([
      { labourId: 'lab_stay', siteId: 'site_new', status: 'PRESENT' },
      { labourId: 'lab_moved', siteId: 'site_new', status: 'ABSENT', advance: 0 },
    ])).rejects.toThrow(OTHER_SITE)

    expect(oldSiteRows()).toBe(before)
    expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })

  it('saveMobileAttendanceAction refuses to rewrite a historical old-site row by date', async () => {
    const before = oldSiteRows()

    await expect(mobile.saveMobileAttendanceAction(
      [{ labourId: 'lab_moved', siteId: 'site_new', status: 'HALF_DAY', advance: 0 }],
      PAST.toISOString(),
    )).rejects.toThrow(OTHER_SITE)

    expect(oldSiteRows()).toBe(before)
  })

  it('addExistingWorkerToRoster refuses to flip the old-site row to the new site\'s roster', async () => {
    const before = oldSiteRows()

    await expect(mobile.addExistingWorkerToRoster('lab_moved', 'site_new', '07:00')).rejects.toThrow(OTHER_SITE)

    expect(oldSiteRows()).toBe(before)
  })

  it('POST /api/attendance answers 403 and leaves the old-site row untouched', async () => {
    const before = oldSiteRows()

    const { status, json } = await post({ attendance: [{ labourId: 'lab_moved', status: 'ABSENT' }] })

    expect(status).toBe(403)
    expect(json.error).toMatch(OTHER_SITE)
    expect(oldSiteRows()).toBe(before)
  })

  it('removeLabourAttendanceAction does not delete today\'s old-site row', async () => {
    await mobile.removeLabourAttendanceAction('lab_moved', 'Ravi')

    const where = mocks.tx.labourAttendance.deleteMany.mock.calls[0][0].where
    expect(where).toMatchObject({ labourId: 'lab_moved', siteId: 'site_new' })
    expect(await inMemoryDelegate(ATTENDANCE, relations).count({ where })).toBe(0)
  })

  it('every attendance upsert binds the exact current site in its unique where', async () => {
    await mobile.saveMobileAttendanceAction([{ labourId: 'lab_stay', siteId: 'site_new', status: 'PRESENT' }])
    await post({ attendance: [{ labourId: 'lab_stay', status: 'HALF_DAY' }] })

    for (const [args] of mocks.tx.labourAttendance.upsert.mock.calls) {
      expect(args.where).toMatchObject({ labourId_date: { labourId: 'lab_stay' }, siteId: 'site_new' })
    }
    expect(mocks.tx.labourAttendance.upsert).toHaveBeenCalledTimes(2)
  })
})

describe('a worker moved to a new site: its old-site advance cannot be changed from the new site', () => {
  it('updateWorkerAction by a tenant admin refuses to rewrite the old-site advance, rolling the edit back', async () => {
    mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
    const before = oldSiteRows()

    await expect(mobile.updateWorkerAction({ id: 'lab_moved', name: 'Ravi', trade: 'MASON', dailyWage: 800, siteId: 'site_new', advance: 0 }))
      .rejects.toThrow(OTHER_SITE)

    expect(oldSiteRows()).toBe(before)
    expect(ATTENDANCE.find((row) => row.id === 'att_old_today')?.advance).toBe(200)
  })

  it('a tenant admin cannot silently mutate the historical old-site row through the new-site roll', async () => {
    mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
    const before = oldSiteRows()

    await expect(mobile.saveMobileAttendanceAction(
      [{ labourId: 'lab_moved', siteId: 'site_new', status: 'ABSENT', advance: 9999 }],
      PAST.toISOString(),
    )).rejects.toThrow(OTHER_SITE)
    await expect(mobile.addExistingWorkerToRoster('lab_moved', 'site_new')).rejects.toThrow(OTHER_SITE)
    expect((await post({ attendance: [{ labourId: 'lab_moved', status: 'ABSENT' }] })).status).toBe(403)

    expect(oldSiteRows()).toBe(before)
  })
})

describe('reassignment never leaves a live same-key row on the old site', () => {
  it('updateWorkerAction refuses to move a worker already marked today on its current site to another site', async () => {
    mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))

    await expect(mobile.updateWorkerAction({ id: 'lab_old', name: 'Kumar', trade: 'HELPER', dailyWage: 700, siteId: 'site_new' }))
      .rejects.toThrow(OTHER_SITE)

    expect(LABOUR.find((worker) => worker.id === 'lab_old')?.siteId).toBe('site_old')
    expect(mocks.tx.labour.updateMany).not.toHaveBeenCalled()
  })

  it('addExistingWorkerToRoster refuses to pull a worker marked today on its old site onto the new roster', async () => {
    mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))

    await expect(mobile.addExistingWorkerToRoster('lab_old', 'site_new')).rejects.toThrow(OTHER_SITE)

    expect(mocks.tx.labour.updateMany).not.toHaveBeenCalled()
    expect(mocks.tx.labourAttendance.upsert).not.toHaveBeenCalled()
  })

  it('the old-site field user cannot reach the moved worker at all', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER', OLD_ENGINEER))

    await expect(mobile.saveMobileAttendanceAction([{ labourId: 'lab_moved', siteId: 'site_old', status: 'PRESENT' }]))
      .rejects.toThrow(/Labour not found or access denied/)
    expect((await post({ attendance: [{ labourId: 'lab_moved', status: 'PRESENT' }] })).status).toBe(403)
    expect(mocks.tx.labourAttendance.upsert).not.toHaveBeenCalled()
  })
})

describe('same-site attendance remains valid', () => {
  it('saveMobileAttendanceAction updates the same-site row in place', async () => {
    await expect(mobile.saveMobileAttendanceAction([{ labourId: 'lab_stay', siteId: 'site_new', status: 'PRESENT', advance: 150 }]))
      .resolves.toEqual({ success: true, count: 1 })

    expect(ATTENDANCE.find((row) => row.id === 'att_stay_today')).toMatchObject({ siteId: 'site_new', status: 'PRESENT', advance: 150 })
    expect(mocks.syncSiteBudget).toHaveBeenCalledWith('site_new')
  })

  it('saveMobileAttendanceAction creates a new-site row for a date with none', async () => {
    const date = new Date('2026-09-10T00:00:00')

    await mobile.saveMobileAttendanceAction([{ labourId: 'lab_moved', siteId: 'site_new', status: 'PRESENT' }], date.toISOString())

    expect(ATTENDANCE.filter((row) => row.labourId === 'lab_moved' && (row.date as Date).getTime() === date.getTime()))
      .toEqual([expect.objectContaining({ siteId: 'site_new', status: 'PRESENT' })])
  })

  it('POST /api/attendance updates the same-site row', async () => {
    expect((await post({ attendance: [{ labourId: 'lab_stay', status: 'HALF_DAY' }] })).status).toBe(200)
    expect(ATTENDANCE.find((row) => row.id === 'att_stay_today')?.status).toBe('HALF_DAY')
  })

  it('addExistingWorkerToRoster keeps a same-site worker on its roster', async () => {
    await expect(mobile.addExistingWorkerToRoster('lab_stay', 'site_new', '08:00')).resolves.toMatchObject({ success: true, record: { id: 'att_stay_today' } })
    expect(ATTENDANCE.find((row) => row.id === 'att_stay_today')).toMatchObject({ status: 'PRESENT', startTime: '08:00' })
  })

  it('updateWorkerAction records the advance on the worker\'s own site row', async () => {
    mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))

    await mobile.updateWorkerAction({ id: 'lab_stay', name: 'Arun', trade: 'HELPER', dailyWage: 700, siteId: 'site_new', advance: 75 })

    expect(ATTENDANCE.find((row) => row.id === 'att_stay_today')?.advance).toBe(75)
  })

  it('updateWorkerAction moves a worker with no attendance today or later on its old site', async () => {
    mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
    ATTENDANCE = ATTENDANCE.filter((row) => row.id !== 'att_lab_old_today')

    await expect(mobile.updateWorkerAction({ id: 'lab_old', name: 'Kumar', trade: 'HELPER', dailyWage: 700, siteId: 'site_new' }))
      .resolves.toMatchObject({ success: true, worker: { siteId: 'site_new' } })
  })
})
