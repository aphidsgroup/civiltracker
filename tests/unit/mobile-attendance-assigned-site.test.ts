import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'

/**
 * Regression for field roles marking the muster roll on sites they are not assigned to.
 *
 * The mobile muster-roll actions bound every site to "a live site of the company", so a
 * SITE_ENGINEER or SUPERVISOR could register workers, mark attendance, pull a worker off
 * another engineer's site onto their own, log contractor headcount and move money
 * (advances) on any site of the company. `/api/attendance` was worse: it cast any status
 * string to the enum, let SUPER_ADMIN write for any tenant's worker, and upserted each
 * row separately (a failure half-way left a partial roll).
 *
 * Now every muster-roll action and the API use one policy, `assignedSiteScope`: field
 * roles act only on their assigned live sites, and the worker's *current* site must be in
 * that scope too; other holders of the permission act company-wide; SUPER_ADMIN is
 * refused. The API validates the status enum and the payload shape, binds every worker
 * in one transaction, and refuses the whole batch on any bad row.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module` and `@/lib/auth/site-mutation` are real.
 */
const mocks = vi.hoisted(() => {
  const tx = {
    labour: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    labourAttendance: { upsert: vi.fn() },
    subcontractor: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    contractorAttendance: { create: vi.fn(), deleteMany: vi.fn() },
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
      labour: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
      labourAttendance: { upsert: vi.fn(), deleteMany: vi.fn() },
      contractorAttendance: { findFirst: vi.fn() },
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

const ENGINEER = 'user_site_engineer'

const SITES: Row[] = [
  { id: 'site_mine', companyId: 'company_1', deletedAt: null, assignedEngineerId: ENGINEER, engineerId: null },
  { id: 'site_listed', companyId: 'company_1', deletedAt: null, assignedEngineerId: null, engineerId: null },
  { id: 'site_theirs', companyId: 'company_1', deletedAt: null, assignedEngineerId: 'user_someone_else', engineerId: null },
  { id: 'site_dead', companyId: 'company_1', deletedAt: new Date('2026-01-01'), assignedEngineerId: ENGINEER, engineerId: null },
  { id: 'site_other', companyId: 'company_2', deletedAt: null, assignedEngineerId: ENGINEER, engineerId: null },
]

const LABOUR: Row[] = [
  { id: 'lab_mine', companyId: 'company_1', siteId: 'site_mine', name: 'Ravi', trade: 'MASON', phone: null },
  { id: 'lab_mine_2', companyId: 'company_1', siteId: 'site_mine', name: 'Arun', trade: 'HELPER', phone: null },
  { id: 'lab_theirs', companyId: 'company_1', siteId: 'site_theirs', name: 'Kumar', trade: 'HELPER', phone: null },
  { id: 'lab_dead', companyId: 'company_1', siteId: 'site_dead', name: 'Old', trade: 'HELPER', phone: null },
  { id: 'lab_other', companyId: 'company_2', siteId: 'site_other', name: 'Foreign', trade: 'HELPER', phone: null },
]

const CONTRACTOR_LOGS: Row[] = [
  { id: 'ca_theirs', companyId: 'company_1', siteId: 'site_theirs', subcontractorId: 'sub_1', contractorType: 'Mason', labourCount: 5, dailyAdvance: 200, date: new Date('2026-09-25'), startTime: null, subcontractor: { name: 'Bricks Co', trade: 'Mason' } },
]

const relations: RelationResolver = (row, key) => {
  if (key === 'site') return SITES.find((site) => site.id === row.siteId) ?? null
  if (key === 'subcontractor') return { id: 'sub_1', companyId: 'company_1' }
  return undefined
}

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

let modules: unknown

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['SITES', 'LABOUR']
  mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  // The engineer is assigned to site_mine directly and to site_listed by active membership.
  mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: ['site_listed'] })
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)

  const labour = inMemoryDelegate(LABOUR, relations)
  for (const delegate of [mocks.prisma.labour, mocks.tx.labour]) {
    delegate.findFirst.mockImplementation(labour.findFirst)
    delegate.findMany.mockImplementation(labour.findMany)
    delegate.updateMany.mockImplementation(labour.updateMany)
  }
  mocks.prisma.labour.create.mockImplementation(async (args: { data: Row }) => ({ id: 'lab_new', ...args.data }))
  mocks.prisma.labourAttendance.deleteMany.mockResolvedValue({ count: 1 })
  mocks.prisma.contractorAttendance.findFirst.mockImplementation(inMemoryDelegate(CONTRACTOR_LOGS, relations).findFirst)
  mocks.tx.labourAttendance.upsert.mockResolvedValue({ id: 'att_1' })
  mocks.tx.subcontractor.findFirst.mockResolvedValue({ id: 'sub_1' })
  mocks.tx.subcontractor.updateMany.mockResolvedValue({ count: 1 })
  mocks.tx.contractorAttendance.create.mockResolvedValue({ id: 'ca_new' })
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx))
})

function writes() {
  const { prisma, tx } = mocks
  return [
    prisma.labour.create, prisma.labour.updateMany, prisma.labourAttendance.upsert, prisma.labourAttendance.deleteMany,
    tx.labour.updateMany, tx.labourAttendance.upsert, tx.subcontractor.create, tx.subcontractor.updateMany,
    tx.contractorAttendance.create, tx.contractorAttendance.deleteMany,
  ].reduce((sum, fn) => sum + fn.mock.calls.length, 0)
}

// SUBCONTRACTOR holds attendance.mark and is bound to its assigned sites like the others.
const FIELD_ROLES = ['SITE_ENGINEER', 'SUPERVISOR', 'SUBCONTRACTOR']

describe('muster-roll actions: field roles only on assigned live sites', () => {
  const ON_UNASSIGNED_SITE = [
    { name: 'addMobileWorkerAction', run: () => mobile.addMobileWorkerAction({ name: 'Arun', trade: 'MASON', dailyRate: 700, siteId: 'site_theirs' }) },
    { name: 'addExistingWorkerToRoster', run: () => mobile.addExistingWorkerToRoster('lab_mine', 'site_theirs') },
    { name: 'saveContractorAttendance', run: () => mobile.saveContractorAttendance({ siteId: 'site_theirs', contractorName: 'Bricks Co', contractorType: 'Mason', labourCount: 5, dailyAdvance: 300 }) },
  ]

  it.each(ON_UNASSIGNED_SITE.flatMap((action) => FIELD_ROLES.map((role) => ({ ...action, role }))))(
    '$role cannot $name on a live company site it is not assigned to',
    async ({ run, role }) => {
      mocks.requireUser.mockResolvedValue(principal(role))
      await expect(run()).rejects.toThrow(/Site not found or access denied/)
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
      expect(writes()).toBe(0)
    },
  )

  it('a field role cannot pull a worker off an unassigned site onto its own', async () => {
    await expect(mobile.addExistingWorkerToRoster('lab_theirs', 'site_mine')).rejects.toThrow(/Labour not found or access denied/)
    expect(mocks.tx.labourAttendance.upsert).not.toHaveBeenCalled()
    expect(mocks.tx.labour.updateMany).not.toHaveBeenCalled()
  })

  it('the re-home write carries the assigned scope and moves exactly one worker', async () => {
    await mobile.addExistingWorkerToRoster('lab_mine', 'site_listed')
    const { where, data } = mocks.tx.labour.updateMany.mock.calls[0][0]
    expect(data).toEqual({ siteId: 'site_listed' })
    expect(where).toMatchObject({ id: 'lab_mine', companyId: 'company_1', site: { companyId: 'company_1', deletedAt: null } })
    expect(where.site.OR).toEqual([{ assignedEngineerId: ENGINEER }, { engineerId: ENGINEER }, { id: { in: ['site_listed'] } }])
  })

  it('a field role may register a worker and log contractors on an assigned site', async () => {
    await expect(mobile.addMobileWorkerAction({ name: 'Arun', trade: 'MASON', dailyRate: 700, siteId: 'site_mine' })).resolves.toMatchObject({ success: true })
    await expect(mobile.saveContractorAttendance({ siteId: 'site_listed', contractorName: 'Bricks Co', contractorType: 'Mason', labourCount: 5, dailyAdvance: 300 })).resolves.toMatchObject({ success: true })
    expect(mocks.tx.subcontractor.updateMany).toHaveBeenCalledWith({ where: { id: 'sub_1', companyId: 'company_1' }, data: { advance: { increment: 300 } } })
  })

  it('reads the assignment only from an active membership of the live company', async () => {
    await mobile.addMobileWorkerAction({ name: 'Arun', trade: 'MASON', dailyRate: 700, siteId: 'site_mine' })
    expect(mocks.prisma.companyMember.findFirst).toHaveBeenCalledWith({
      where: { userId: ENGINEER, companyId: 'company_1', isActive: true },
      select: { siteIds: true },
    })
  })

  it.each(['site_dead', 'site_other'])('a field role assigned to %s still cannot use it', async (siteId) => {
    await expect(mobile.addMobileWorkerAction({ name: 'Arun', trade: 'MASON', dailyRate: 700, siteId })).rejects.toThrow(/Site not found or access denied/)
    expect(writes()).toBe(0)
  })

  it('saveMobileAttendanceAction refuses the whole batch when one worker is on an unassigned site', async () => {
    await expect(mobile.saveMobileAttendanceAction([
      { labourId: 'lab_mine', siteId: 'site_mine', status: 'PRESENT' },
      { labourId: 'lab_theirs', siteId: 'site_theirs', status: 'PRESENT', advance: 100 },
    ])).rejects.toThrow(/Labour not found or access denied/)
    expect(mocks.tx.labourAttendance.upsert).not.toHaveBeenCalled()
    expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
  })

  it('removeLabourAttendanceAction refuses a worker on an unassigned site', async () => {
    await expect(mobile.removeLabourAttendanceAction('lab_theirs', 'Kumar')).rejects.toThrow(/Labour not found or access denied/)
    expect(writes()).toBe(0)
  })

  it('removeContractorAttendanceAction refuses a log on an unassigned site', async () => {
    await expect(mobile.removeContractorAttendanceAction('ca_theirs', 'Bricks Co')).rejects.toThrow(/Contractor attendance not found or access denied/)
    expect(writes()).toBe(0)
  })

  it('updateWorkerAction binds the edited worker to the assigned scope too', async () => {
    // Only admins hold labour.manage; a PROJECT_MANAGER does not. An admin is company-wide.
    mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
    await mobile.updateWorkerAction({ id: 'lab_theirs', name: 'Kumar', trade: 'MASON', dailyWage: 800, siteId: 'site_mine' })
    expect(mocks.tx.labour.updateMany.mock.calls[0][0].where).toEqual({ id: 'lab_theirs', companyId: 'company_1', site: { companyId: 'company_1', deletedAt: null } })
    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
  })

  it('a SUBCONTRACTOR acts on the site its active membership lists, under its own scope', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUBCONTRACTOR'))
    await expect(mobile.addMobileWorkerAction({ name: 'Arun', trade: 'MASON', dailyRate: 700, siteId: 'site_listed' })).resolves.toMatchObject({ success: true })
    expect(mocks.prisma.companyMember.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user_subcontractor', companyId: 'company_1', isActive: true },
      select: { siteIds: true },
    })
  })

  it('a SUBCONTRACTOR with no assignment can act on no site at all', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUBCONTRACTOR'))
    mocks.prisma.companyMember.findFirst.mockResolvedValue(null)
    await expect(mobile.addMobileWorkerAction({ name: 'Arun', trade: 'MASON', dailyRate: 700, siteId: 'site_listed' })).rejects.toThrow(/Site not found or access denied/)
    await expect(mobile.removeLabourAttendanceAction('lab_mine', 'Ravi')).rejects.toThrow(/Labour not found or access denied/)
    expect(writes()).toBe(0)
  })

  it.each(['COMPANY_ADMIN', 'PROJECT_MANAGER'])('%s marks the roll on any live site of its company', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(mobile.addExistingWorkerToRoster('lab_theirs', 'site_mine')).resolves.toMatchObject({ success: true })
    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
  })
})

async function post(body: unknown) {
  const response = await POST(new Request('http://test/api/attendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))
  return { status: response.status, json: await response.json() }
}

describe('POST /api/attendance', () => {
  it('answers 401 for an unauthenticated or revoked principal before reading the body', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Authentication required'))
    const { status, json } = await post({ attendance: [] })
    expect(status).toBe(401)
    expect(json.error).toMatch(/Unauthorized/i)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it.each(['ACCOUNTANT', 'CLIENT', 'VENDOR'])('answers 403 for live %s', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    expect((await post({ attendance: [{ labourId: 'lab_mine', status: 'PRESENT' }] })).status).toBe(403)
    expect(writes()).toBe(0)
  })

  it('refuses SUPER_ADMIN, which has no tenant context', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root', role: 'SUPER_ADMIN', email: 'root@x', name: 'Root' })
    expect((await post({ attendance: [{ labourId: 'lab_other', status: 'PRESENT' }] })).status).toBe(403)
    expect(writes()).toBe(0)
  })

  it('refuses when the LABOUR module is disabled', async () => {
    modules = ['SITES']
    expect((await post({ attendance: [{ labourId: 'lab_mine', status: 'PRESENT' }] })).status).toBe(403)
    expect(writes()).toBe(0)
  })

  it.each([
    ['invalid JSON', '{not json'],
    ['no attendance array', { attendance: 'PRESENT' }],
    ['a null body', null],
    ['a row that is not an object', { attendance: ['lab_mine'] }],
    ['a missing labour id', { attendance: [{ status: 'PRESENT' }] }],
    ['a non-string labour id', { attendance: [{ labourId: 42, status: 'PRESENT' }] }],
    ['an unknown status', { attendance: [{ labourId: 'lab_mine', status: 'ON_LEAVE' }] }],
    ['a lowercase status', { attendance: [{ labourId: 'lab_mine', status: 'present' }] }],
    ['a duplicated worker', { attendance: [{ labourId: 'lab_mine', status: 'PRESENT' }, { labourId: 'lab_mine', status: 'ABSENT' }] }],
    ['an oversized batch', { attendance: Array.from({ length: 501 }, (_, i) => ({ labourId: `lab_${i}`, status: 'PRESENT' })) }],
  ])('answers 400 for %s with no writes', async (_label, body) => {
    expect((await post(body)).status).toBe(400)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(writes()).toBe(0)
  })

  it.each([
    ['a worker on an unassigned site', 'lab_theirs'],
    ['a worker on a deleted site', 'lab_dead'],
    ["another tenant's worker", 'lab_other'],
    ['a missing worker', 'missing'],
  ])('refuses the whole batch with 403 for %s, writing nothing', async (_label, labourId) => {
    const { status, json } = await post({ attendance: [
      { labourId: 'lab_mine', status: 'PRESENT' },
      { labourId, status: 'ABSENT' },
    ] })
    expect(status).toBe(403)
    expect(json.error).toMatch(/Labour not found or access denied/)
    expect(mocks.tx.labourAttendance.upsert).not.toHaveBeenCalled()
  })

  it('binds workers and writes every row inside one transaction, at the worker\'s own site', async () => {
    const { status, json } = await post({ attendance: [
      { labourId: 'lab_mine', status: 'PRESENT' },
      { labourId: 'lab_mine_2', status: 'HALF_DAY' },
      // Toggled off in the marker UI: an unmarked row is skipped, not an error.
      { labourId: 'lab_theirs', status: '' },
    ] })
    expect(status).toBe(200)
    expect(json).toEqual({ success: true, count: 2 })
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.labour.findMany).not.toHaveBeenCalled()
    expect(mocks.prisma.labourAttendance.upsert).not.toHaveBeenCalled()

    const lookup = mocks.tx.labour.findMany.mock.calls[0][0]
    expect(lookup.where).toMatchObject({ id: { in: ['lab_mine', 'lab_mine_2'] }, companyId: 'company_1', site: { companyId: 'company_1', deletedAt: null } })
    expect(lookup.where.site.OR).toContainEqual({ assignedEngineerId: ENGINEER })

    const upserts = mocks.tx.labourAttendance.upsert.mock.calls.map(([args]) => args)
    expect(upserts.map((args) => args.create)).toEqual([
      expect.objectContaining({ labourId: 'lab_mine', siteId: 'site_mine', status: 'PRESENT', markedById: ENGINEER }),
      expect.objectContaining({ labourId: 'lab_mine_2', siteId: 'site_mine', status: 'HALF_DAY', markedById: ENGINEER }),
    ])
    expect(upserts[1].update).toEqual({ status: 'HALF_DAY', markedById: ENGINEER })
  })

  it('refuses a SUBCONTRACTOR marking a worker on a site it is not assigned to', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUBCONTRACTOR'))
    const { status, json } = await post({ attendance: [{ labourId: 'lab_mine', status: 'PRESENT' }] })
    expect(status).toBe(403)
    expect(json.error).toMatch(/Labour not found or access denied/)
    expect(mocks.tx.labourAttendance.upsert).not.toHaveBeenCalled()
  })

  it('writes nothing further when a row fails mid-transaction', async () => {
    mocks.tx.labourAttendance.upsert.mockResolvedValueOnce({ id: 'att_1' }).mockRejectedValueOnce(new Error('db down'))
    await expect(post({ attendance: [
      { labourId: 'lab_mine', status: 'PRESENT' },
      { labourId: 'lab_mine_2', status: 'ABSENT' },
    ] })).rejects.toThrow(/db down/)
    // The error propagates out of the one `$transaction`, which rolls back the first row.
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.labourAttendance.upsert).not.toHaveBeenCalled()
  })

  it('accepts an empty batch without a write', async () => {
    const { status, json } = await post({ attendance: [] })
    expect(status).toBe(200)
    expect(json).toEqual({ success: true, count: 0 })
    expect(writes()).toBe(0)
  })
})
