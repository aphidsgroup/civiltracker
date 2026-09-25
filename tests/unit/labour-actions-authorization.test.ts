import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'

/**
 * Regression for the labour edit action and the mobile muster-roll actions authorizing
 * from JWT claims (or from a live principal with no permission check at all).
 *
 * `updateLabourAction` trusted the token's company, let any role rewrite wages and moved a
 * worker onto any site id, including another tenant's. The mobile actions let any member
 * (an ACCOUNTANT, a CLIENT) mark attendance, ignored the LABOUR module, wrote attendance
 * for any labour id by bare id (another tenant's worker), stamped it with a client-chosen
 * site, re-homed workers by bare id, created workers on foreign or deleted sites, bound a
 * contractor log to any site and to a same-named subcontractor of any site, and did
 * money/attendance changes in several unguarded writes so a failure half-way left the
 * advance ledger out of step with the attendance rows.
 *
 * Now marking the roll needs live `attendance.mark` + LABOUR and editing a worker's master
 * data (wage, site) needs live `labour.manage` + LABOUR, both before any read; every site
 * is a live site of exactly the live company, every worker, subcontractor and log belongs
 * to that company on a live site, and multi-step writes run in one transaction with
 * counted guarded updates.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module` and `@/lib/auth/site-mutation` are real.
 */
const mocks = vi.hoisted(() => {
  const tx = {
    labour: { findFirst: vi.fn(), updateMany: vi.fn() },
    labourAttendance: { upsert: vi.fn() },
    subcontractor: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    contractorAttendance: { create: vi.fn(), deleteMany: vi.fn() },
  }
  return {
    requireUser: vi.fn(),
    auth: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn(),
    logActivity: vi.fn(),
    syncSiteBudget: vi.fn(),
    tx,
    prisma: {
      company: { findUnique: vi.fn() },
      site: { findFirst: vi.fn() },
      labour: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      labourAttendance: { upsert: vi.fn(), deleteMany: vi.fn() },
      subcontractor: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      contractorAttendance: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('@/lib/budget', () => ({ syncSiteBudget: mocks.syncSiteBudget }))

const { updateLabourAction } = await import('@/actions/labour')
const mobile = await import('@/actions/mobile-labour')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', deletedAt: null },
  { id: 'site_2', companyId: 'company_1', deletedAt: null },
  { id: 'site_dead', companyId: 'company_1', deletedAt: new Date('2026-01-01') },
  { id: 'site_other', companyId: 'company_2', deletedAt: null },
]

const LABOUR: Row[] = [
  { id: 'lab_1', companyId: 'company_1', siteId: 'site_1', name: 'Ravi', trade: 'MASON', phone: null },
  { id: 'lab_custom', companyId: 'company_1', siteId: 'site_1', name: 'Mani', trade: 'HELPER', phone: 'CUSTOM_TRADE:Rigger' },
  { id: 'lab_dead', companyId: 'company_1', siteId: 'site_dead', name: 'Old', trade: 'HELPER', phone: null },
  { id: 'lab_other', companyId: 'company_2', siteId: 'site_other', name: 'Foreign', trade: 'HELPER', phone: null },
  // A corrupted row: our company id but pointing at another tenant's site.
  { id: 'lab_cross', companyId: 'company_1', siteId: 'site_other', name: 'Cross', trade: 'HELPER', phone: null },
]

const SUBS: Row[] = [
  { id: 'sub_1', companyId: 'company_1', siteId: null, name: 'Bricks Co' },
  { id: 'sub_site2', companyId: 'company_1', siteId: 'site_2', name: 'Elsewhere Co' },
  { id: 'sub_other', companyId: 'company_2', siteId: null, name: 'Foreign Co' },
]

const CONTRACTOR_LOGS: Row[] = [
  { id: 'ca_1', companyId: 'company_1', siteId: 'site_1', subcontractorId: 'sub_1', contractorType: 'Mason', labourCount: 5, dailyAdvance: 200, date: new Date('2026-09-25'), startTime: null, subcontractor: { name: 'Bricks Co', trade: 'Mason' } },
  { id: 'ca_free', companyId: 'company_1', siteId: 'site_1', subcontractorId: 'sub_1', contractorType: 'Mason', labourCount: 3, dailyAdvance: 0, date: new Date('2026-09-25'), startTime: null, subcontractor: { name: 'Bricks Co', trade: 'Mason' } },
  { id: 'ca_dead', companyId: 'company_1', siteId: 'site_dead', subcontractorId: 'sub_1', contractorType: 'Mason', labourCount: 5, dailyAdvance: 200, date: new Date('2026-09-25'), startTime: null, subcontractor: { name: 'Bricks Co', trade: 'Mason' } },
  { id: 'ca_other', companyId: 'company_2', siteId: 'site_other', subcontractorId: 'sub_other', contractorType: 'Mason', labourCount: 5, dailyAdvance: 200, date: new Date('2026-09-25'), startTime: null, subcontractor: { name: 'Foreign Co', trade: 'Mason' } },
]

const relations: RelationResolver = (row, key) => {
  if (key === 'site') return SITES.find((site) => site.id === row.siteId) ?? null
  if (key === 'subcontractor') return SUBS.find((sub) => sub.id === row.subcontractorId) ?? null
  if (key === 'labour') return LABOUR.find((labour) => labour.id === row.labourId) ?? null
  return undefined
}

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.append(key, value)
  return fd
}

const labourForm = (overrides: Record<string, string> = {}) =>
  form({ id: 'lab_1', name: 'Ravi K', phone: '', trade: 'MASON', dailyWage: '800', overtimeRate: '', openingAdvance: '', siteId: 'site_2', isActive: 'true', ...overrides })

let modules: unknown
let committed: Array<[string, unknown]>
let staged: Array<[string, unknown]>

function stageWrite<T extends Row>(name: string, payload: (args: T) => unknown, result: (args: T) => unknown) {
  return async (args: T) => {
    staged.push([name, payload(args)])
    return result(args)
  }
}

function stagedCount(name: string, delegate: { updateMany: (args: Row) => Promise<{ count: number }> }) {
  return async (args: { where: Row; data: Row }) => {
    const result = await delegate.updateMany(args)
    if (result.count) staged.push([name, args.data])
    return result
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['SITES', 'LABOUR']
  committed = []
  staged = []
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  // A stale JWT still claiming admin: the actions must never trust it.
  mocks.auth.mockResolvedValue({ user: principal('COMPANY_ADMIN') })
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)

  const labour = inMemoryDelegate(LABOUR, relations)
  // Subcontractors created inside a transaction join the store, so the guarded advance
  // update on a freshly created subcontractor matches it by exact id and company.
  const subRows: Row[] = [...SUBS]
  const subs = inMemoryDelegate(subRows, relations)
  let createdSubs = 0
  const logs = inMemoryDelegate(CONTRACTOR_LOGS, relations)
  for (const delegate of [mocks.prisma.labour, mocks.tx.labour]) delegate.findFirst.mockImplementation(labour.findFirst)
  mocks.prisma.labour.findMany.mockImplementation(labour.findMany)
  mocks.prisma.labour.updateMany.mockImplementation(labour.updateMany)
  mocks.prisma.labour.create.mockImplementation(async (args: { data: Row }) => ({ id: 'lab_new', ...args.data }))
  mocks.prisma.labourAttendance.deleteMany.mockResolvedValue({ count: 1 })
  mocks.tx.labour.updateMany.mockImplementation(stagedCount('labour.updateMany', labour))
  mocks.tx.labourAttendance.upsert.mockImplementation(
    stageWrite('labourAttendance.upsert', (args: Row) => args, (args: Row) => ({ id: `att_${(args.create as Row).labourId}` })),
  )

  mocks.tx.subcontractor.findFirst.mockImplementation(subs.findFirst)
  mocks.tx.subcontractor.create.mockImplementation(stageWrite('subcontractor.create', (args: Row) => args.data, (args: Row) => {
    // Each create is a distinct row, as in the database; reusing one id would make the
    // exact-id advance update match several rows.
    createdSubs += 1
    const id = createdSubs === 1 ? 'sub_new' : `sub_new_${createdSubs}`
    subRows.push({ siteId: null, ...(args.data as Row), id })
    return { id }
  }))
  mocks.tx.subcontractor.updateMany.mockImplementation(stagedCount('subcontractor.updateMany', subs))
  mocks.prisma.contractorAttendance.findFirst.mockImplementation(logs.findFirst)
  mocks.tx.contractorAttendance.create.mockImplementation(stageWrite('contractorAttendance.create', (args: Row) => args.data, () => ({ id: 'ca_new' })))
  mocks.tx.contractorAttendance.deleteMany.mockImplementation(async (args: { where: Row }) => {
    const count = await logs.count(args)
    if (count) staged.push(['contractorAttendance.deleteMany', args.where])
    return { count }
  })

  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => {
    staged = []
    const result = await fn(mocks.tx)
    committed.push(...staged)
    return result
  })
})

function allWrites() {
  const { prisma, tx } = mocks
  return [
    prisma.labour.create, prisma.labour.update, prisma.labour.updateMany,
    prisma.labourAttendance.upsert, prisma.labourAttendance.deleteMany,
    prisma.subcontractor.create, prisma.subcontractor.update, prisma.subcontractor.updateMany,
    prisma.contractorAttendance.create, prisma.contractorAttendance.delete, prisma.contractorAttendance.deleteMany,
    tx.labour.updateMany, tx.labourAttendance.upsert, tx.subcontractor.create, tx.subcontractor.updateMany,
    tx.contractorAttendance.create, tx.contractorAttendance.deleteMany,
  ].reduce((sum, fn) => sum + fn.mock.calls.length, 0)
}

function allReads() {
  const { prisma } = mocks
  return [
    prisma.site.findFirst, prisma.labour.findFirst, prisma.labour.findMany, prisma.labour.findUnique,
    prisma.subcontractor.findFirst, prisma.contractorAttendance.findFirst, prisma.contractorAttendance.findUnique,
    prisma.$transaction,
  ].reduce((sum, fn) => sum + fn.mock.calls.length, 0)
}

const MARK = [
  { name: 'addMobileWorkerAction', run: () => mobile.addMobileWorkerAction({ name: 'Arun', trade: 'MASON', dailyRate: 700, siteId: 'site_1' }) },
  { name: 'saveMobileAttendanceAction', run: () => mobile.saveMobileAttendanceAction([{ labourId: 'lab_1', siteId: 'site_1', status: 'PRESENT', advance: 50 }]) },
  { name: 'addExistingWorkerToRoster', run: () => mobile.addExistingWorkerToRoster('lab_1', 'site_2') },
  { name: 'saveContractorAttendance', run: () => mobile.saveContractorAttendance({ siteId: 'site_1', contractorName: 'Bricks Co', contractorType: 'Mason', labourCount: 5, dailyAdvance: 300 }) },
  { name: 'removeLabourAttendanceAction', run: () => mobile.removeLabourAttendanceAction('lab_1', 'Ravi') },
  { name: 'removeContractorAttendanceAction', run: () => mobile.removeContractorAttendanceAction('ca_1', 'Bricks Co') },
]

const MANAGE = [
  { name: 'updateLabourAction', run: () => updateLabourAction(labourForm()) },
  { name: 'updateWorkerAction', run: () => mobile.updateWorkerAction({ id: 'lab_1', name: 'Ravi K', trade: 'MASON', dailyWage: 800, siteId: 'site_2', advance: 100 }) },
]

const ALL = [...MARK, ...MANAGE]

describe('labour actions: live principal, permission and module before any read', () => {
  it.each(ALL)('$name refuses a revoked principal even with a valid-looking JWT', async ({ run }) => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))
    await expect(run()).rejects.toThrow(/UNAUTHORIZED/)
    expect(allReads()).toBe(0)
    expect(allWrites()).toBe(0)
  })

  it.each(MARK.flatMap((action) => ['ACCOUNTANT', 'PURCHASE_MANAGER', 'CLIENT', 'VENDOR'].map((role) => ({ ...action, role }))))(
    '$name refuses live $role without attendance.mark before any read',
    async ({ run, role }) => {
      mocks.requireUser.mockResolvedValue(principal(role))
      await expect(run()).rejects.toThrow(/attendance\.mark/)
      expect(mocks.prisma.company.findUnique).not.toHaveBeenCalled()
      expect(allReads()).toBe(0)
      expect(allWrites()).toBe(0)
    },
  )

  it.each(MARK.flatMap((action) => ['PROJECT_MANAGER', 'SITE_ENGINEER', 'SUPERVISOR'].map((role) => ({ ...action, role }))))(
    '$name lets live $role mark the roll',
    async ({ run, role }) => {
      mocks.requireUser.mockResolvedValue(principal(role))
      await expect(run()).resolves.toMatchObject({ success: true })
    },
  )

  it.each(MANAGE.flatMap((action) => ['PROJECT_MANAGER', 'SITE_ENGINEER', 'SUPERVISOR', 'ACCOUNTANT', 'SUBCONTRACTOR', 'CLIENT'].map((role) => ({ ...action, role }))))(
    '$name refuses live $role without labour.manage before any read',
    async ({ run, role }) => {
      mocks.requireUser.mockResolvedValue(principal(role))
      await expect(run()).rejects.toThrow(/labour\.manage/)
      expect(allReads()).toBe(0)
      expect(allWrites()).toBe(0)
    },
  )

  it.each(ALL)('$name refuses SUPER_ADMIN, which has no tenant context', async ({ run }) => {
    mocks.requireUser.mockResolvedValue({ id: 'root', role: 'SUPER_ADMIN', email: 'root@x', name: 'Root' })
    await expect(run()).rejects.toThrow(/Tenant context required/)
    expect(allReads()).toBe(0)
  })

  it.each(ALL)('$name refuses when the LABOUR module is disabled', async ({ run }) => {
    modules = ['SITES']
    await expect(run()).rejects.toThrow(/Module LABOUR is not enabled/)
    expect(allReads()).toBe(0)
    expect(allWrites()).toBe(0)
  })
})

describe('updateLabourAction', () => {
  it.each(['site_other', 'site_dead', 'missing'])('refuses target site %s', async (siteId) => {
    await expect(updateLabourAction(labourForm({ siteId }))).rejects.toThrow(/Site not found or access denied/)
    expect(allWrites()).toBe(0)
  })

  it.each(['lab_other', 'lab_dead', 'lab_cross', 'missing'])('refuses worker %s', async (id) => {
    await expect(updateLabourAction(labourForm({ id }))).rejects.toThrow(/Labour not found or access denied/)
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it.each([
    ['an unknown trade', { trade: 'ASTRONAUT' }],
    ['a negative wage', { dailyWage: '-1' }],
    ['a blank wage', { dailyWage: '' }],
    ['a non-finite overtime rate', { overtimeRate: 'Infinity' }],
    ['an unknown active flag', { isActive: 'maybe' }],
    ['a blank name', { name: '  ' }],
  ])('rejects %s without writing', async (_label, overrides) => {
    await expect(updateLabourAction(labourForm(overrides))).rejects.toThrow(/invalid|required/i)
    expect(allWrites()).toBe(0)
  })

  it('writes validated fields only to the live tenant worker', async () => {
    await updateLabourAction(labourForm({ overtimeRate: '120' }))
    expect(mocks.prisma.labour.updateMany).toHaveBeenCalledWith({
      where: { id: 'lab_1', companyId: 'company_1', site: { companyId: 'company_1', deletedAt: null } },
      data: { siteId: 'site_2', name: 'Ravi K', phone: null, trade: 'MASON', dailyWage: 800, overtimeRate: 120, openingAdvance: 0, isActive: true },
    })
    expect(mocks.redirect).toHaveBeenCalledWith('/labour')
  })
})

describe('mobile worker registration and edits', () => {
  it.each(['site_other', 'site_dead', 'missing'])('addMobileWorkerAction refuses site %s', async (siteId) => {
    await expect(mobile.addMobileWorkerAction({ name: 'Arun', trade: 'MASON', dailyRate: 700, siteId })).rejects.toThrow(/Site not found or access denied/)
    expect(allWrites()).toBe(0)
  })

  it.each([
    ['an unknown trade', { trade: 'ASTRONAUT' }],
    ['OTHERS without a custom trade', { trade: 'OTHERS', customTrade: ' ' }],
    ['a negative rate', { dailyRate: -5 }],
    ['a non-finite rate', { dailyRate: Number.NaN }],
    ['a blank name', { name: ' ' }],
  ])('addMobileWorkerAction rejects %s', async (_label, overrides) => {
    await expect(mobile.addMobileWorkerAction({ name: 'Arun', trade: 'MASON', dailyRate: 700, siteId: 'site_1', ...overrides })).rejects.toThrow()
    expect(allWrites()).toBe(0)
  })

  it('addMobileWorkerAction creates the worker on the verified site and returns plain data', async () => {
    const result = await mobile.addMobileWorkerAction({ name: ' Arun ', trade: 'OTHERS', customTrade: 'Rigger', dailyRate: 0, siteId: 'site_1' })
    expect(mocks.prisma.labour.create).toHaveBeenCalledWith({
      data: { companyId: 'company_1', siteId: 'site_1', name: 'Arun', trade: 'HELPER', phone: 'CUSTOM_TRADE:Rigger', dailyWage: 650, isActive: true },
    })
    expect(result.worker).toEqual({ id: 'lab_new', name: 'Arun', trade: 'HELPER', phone: 'CUSTOM_TRADE:Rigger', dailyWage: 650, siteId: 'site_1' })
  })

  it.each(['lab_other', 'lab_dead', 'lab_cross', 'missing'])('updateWorkerAction refuses worker %s', async (id) => {
    await expect(mobile.updateWorkerAction({ id, name: 'X', trade: 'MASON', dailyWage: 800, siteId: 'site_1', advance: 10 })).rejects.toThrow(/Labour not found or access denied/)
    expect(committed).toEqual([])
    expect(mocks.tx.labourAttendance.upsert).not.toHaveBeenCalled()
  })

  it.each(['site_other', 'site_dead'])('updateWorkerAction refuses target site %s', async (siteId) => {
    await expect(mobile.updateWorkerAction({ id: 'lab_1', name: 'X', trade: 'MASON', dailyWage: 800, siteId })).rejects.toThrow(/Site not found or access denied/)
    expect(allWrites()).toBe(0)
  })

  it('updateWorkerAction updates the worker and records the advance in one transaction', async () => {
    const result = await mobile.updateWorkerAction({ id: 'lab_custom', name: 'Mani', trade: 'MASON', dailyWage: 800, siteId: 'site_2', advance: 100 })
    expect(mocks.tx.labour.updateMany).toHaveBeenCalledWith({
      where: { id: 'lab_custom', companyId: 'company_1', site: { companyId: 'company_1', deletedAt: null } },
      data: { name: 'Mani', trade: 'MASON', phone: null, dailyWage: 800, siteId: 'site_2' },
    })
    const upsert = mocks.tx.labourAttendance.upsert.mock.calls[0][0]
    expect(upsert.where.labourId_date.labourId).toBe('lab_custom')
    expect(upsert.create).toMatchObject({ labourId: 'lab_custom', siteId: 'site_2', advance: 100, markedById: 'user_company_admin' })
    expect(committed.map(([name]) => name)).toEqual(['labour.updateMany', 'labourAttendance.upsert'])
    expect(result.worker).toEqual({ id: 'lab_custom', name: 'Mani', trade: 'MASON', phone: null, dailyWage: 800, siteId: 'site_2' })
  })

  it('updateWorkerAction rolls the worker edit back when the advance write fails', async () => {
    mocks.tx.labourAttendance.upsert.mockRejectedValue(new Error('db down'))
    await expect(mobile.updateWorkerAction({ id: 'lab_1', name: 'Ravi', trade: 'MASON', dailyWage: 800, siteId: 'site_1', advance: 100 })).rejects.toThrow(/db down/)
    expect(mocks.tx.labour.updateMany).toHaveBeenCalledTimes(1)
    expect(committed).toEqual([])
  })

  it('updateWorkerAction rejects a negative advance', async () => {
    await expect(mobile.updateWorkerAction({ id: 'lab_1', name: 'Ravi', trade: 'MASON', dailyWage: 800, siteId: 'site_1', advance: -1 })).rejects.toThrow(/Invalid advance/)
    expect(allWrites()).toBe(0)
  })
})

describe('saveMobileAttendanceAction', () => {
  it.each([
    ["another tenant's worker", { labourId: 'lab_other', siteId: 'site_other' }],
    ['a worker on a deleted site', { labourId: 'lab_dead', siteId: 'site_dead' }],
    ['a worker linked to a foreign site', { labourId: 'lab_cross', siteId: 'site_other' }],
    ['a missing worker', { labourId: 'missing', siteId: 'site_1' }],
    ["a site other than the worker's", { labourId: 'lab_1', siteId: 'site_2' }],
  ])('refuses the whole batch for %s', async (_label, record) => {
    await expect(mobile.saveMobileAttendanceAction([
      { labourId: 'lab_1', siteId: 'site_1', status: 'PRESENT' },
      { ...record, status: 'PRESENT', advance: 10 },
    ])).rejects.toThrow(/Labour not found or access denied/)
    expect(mocks.tx.labourAttendance.upsert).not.toHaveBeenCalled()
    expect(allWrites()).toBe(0)
    expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
  })

  it.each([
    ['an unknown status', { status: 'ON_LEAVE' }],
    ['a negative advance', { advance: -10 }],
    ['a non-finite advance', { advance: Number.POSITIVE_INFINITY }],
  ])('rejects %s before any write', async (_label, overrides) => {
    await expect(mobile.saveMobileAttendanceAction([{ labourId: 'lab_1', siteId: 'site_1', status: 'PRESENT', ...overrides }])).rejects.toThrow(/Invalid/)
    expect(allWrites()).toBe(0)
  })

  it('reads the workers scoped to the live company and live sites', async () => {
    await mobile.saveMobileAttendanceAction([{ labourId: 'lab_1', siteId: 'site_1', status: 'HALF_DAY', advance: 50 }])
    expect(mocks.prisma.labour.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['lab_1'] }, companyId: 'company_1', site: { companyId: 'company_1', deletedAt: null } },
    }))
  })

  it('writes every row in one transaction and rolls all back when one fails', async () => {
    let calls = 0
    mocks.tx.labourAttendance.upsert.mockImplementation(async (args: Row) => {
      calls += 1
      if (calls === 2) throw new Error('db down')
      staged.push(['labourAttendance.upsert', args])
      return { id: 'att' }
    })
    await expect(mobile.saveMobileAttendanceAction([
      { labourId: 'lab_1', siteId: 'site_1', status: 'PRESENT', advance: 50 },
      { labourId: 'lab_custom', siteId: 'site_1', status: 'ABSENT' },
    ])).rejects.toThrow(/db down/)
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(committed).toEqual([])
    expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })

  it('skips unmarked rows and syncs only the verified sites', async () => {
    const result = await mobile.saveMobileAttendanceAction([
      { labourId: 'lab_1', siteId: 'site_1', status: 'PRESENT', advance: 50 },
      { labourId: 'lab_custom', siteId: 'site_1', status: '' },
    ])
    expect(result).toEqual({ success: true, count: 1 })
    expect(mocks.tx.labourAttendance.upsert).toHaveBeenCalledTimes(1)
    expect(mocks.tx.labourAttendance.upsert.mock.calls[0][0].create).toMatchObject({ labourId: 'lab_1', siteId: 'site_1', status: 'PRESENT', advance: 50 })
    expect(mocks.syncSiteBudget).toHaveBeenCalledTimes(1)
    expect(mocks.syncSiteBudget).toHaveBeenCalledWith('site_1')
  })
})

describe('addExistingWorkerToRoster', () => {
  it.each(['lab_other', 'lab_dead', 'lab_cross', 'missing'])('refuses worker %s', async (labourId) => {
    await expect(mobile.addExistingWorkerToRoster(labourId, 'site_1')).rejects.toThrow(/Labour not found or access denied/)
    expect(mocks.tx.labourAttendance.upsert).not.toHaveBeenCalled()
    expect(committed).toEqual([])
  })

  it.each(['site_other', 'site_dead'])('refuses target site %s', async (siteId) => {
    await expect(mobile.addExistingWorkerToRoster('lab_1', siteId)).rejects.toThrow(/Site not found or access denied/)
    expect(allWrites()).toBe(0)
  })

  it('marks the worker present and re-homes it in one transaction', async () => {
    await mobile.addExistingWorkerToRoster('lab_1', 'site_2', '08:30')
    expect(mocks.tx.labourAttendance.upsert.mock.calls[0][0].create).toMatchObject({ labourId: 'lab_1', siteId: 'site_2', status: 'PRESENT', startTime: '08:30' })
    expect(mocks.tx.labour.updateMany).toHaveBeenCalledWith({
      where: { id: 'lab_1', companyId: 'company_1', site: { companyId: 'company_1', deletedAt: null } },
      data: { siteId: 'site_2' },
    })
    expect(committed.map(([name]) => name)).toEqual(['labourAttendance.upsert', 'labour.updateMany'])
  })

  it('rolls the roster entry back when the re-home matches no row', async () => {
    mocks.tx.labour.updateMany.mockResolvedValue({ count: 0 })
    await expect(mobile.addExistingWorkerToRoster('lab_1', 'site_2')).rejects.toThrow(/Labour not found or access denied/)
    expect(mocks.tx.labourAttendance.upsert).toHaveBeenCalledTimes(1)
    expect(committed).toEqual([])
  })
})

describe('contractor attendance', () => {
  const log = (overrides: Partial<Parameters<typeof mobile.saveContractorAttendance>[0]> = {}) =>
    ({ siteId: 'site_1', contractorName: 'Bricks Co', contractorType: 'Mason', labourCount: 5, dailyAdvance: 300, ...overrides })

  it.each(['site_other', 'site_dead', 'missing'])('saveContractorAttendance refuses site %s', async (siteId) => {
    await expect(mobile.saveContractorAttendance(log({ siteId }))).rejects.toThrow(/Site not found or access denied/)
    expect(allWrites()).toBe(0)
  })

  it.each([
    ['a blank contractor name', { contractorName: ' ' }],
    ['a negative headcount', { labourCount: -1 }],
    ['a fractional headcount', { labourCount: 2.5 }],
    ['a negative advance', { dailyAdvance: -100 }],
    ['a non-finite advance', { dailyAdvance: Number.NaN }],
  ])('saveContractorAttendance rejects %s', async (_label, overrides) => {
    await expect(mobile.saveContractorAttendance(log(overrides))).rejects.toThrow()
    expect(allWrites()).toBe(0)
  })

  it('reuses only a subcontractor of this company bound to no site or this site', async () => {
    await mobile.saveContractorAttendance(log())
    expect(mocks.tx.subcontractor.findFirst.mock.calls[0][0].where).toEqual({
      companyId: 'company_1',
      name: { equals: 'Bricks Co', mode: 'insensitive' },
      OR: [{ siteId: null }, { siteId: 'site_1' }],
    })
    expect(mocks.tx.subcontractor.create).not.toHaveBeenCalled()
    expect(mocks.tx.contractorAttendance.create.mock.calls[0][0].data).toMatchObject({ companyId: 'company_1', siteId: 'site_1', subcontractorId: 'sub_1', labourCount: 5, dailyAdvance: 300 })
    expect(mocks.tx.subcontractor.updateMany).toHaveBeenCalledWith({
      where: { id: 'sub_1', companyId: 'company_1' },
      data: { advance: { increment: 300 } },
    })
    expect(committed.map(([name]) => name)).toEqual(['contractorAttendance.create', 'subcontractor.updateMany'])
  })

  it('never binds to a same-named subcontractor of another site or tenant', async () => {
    await mobile.saveContractorAttendance(log({ contractorName: 'Elsewhere Co' }))
    expect(mocks.tx.subcontractor.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.contractorAttendance.create.mock.calls[0][0].data).toMatchObject({ subcontractorId: 'sub_new' })

    vi.clearAllMocks()
    await mobile.saveContractorAttendance(log({ contractorName: 'Foreign Co' }))
    expect(mocks.tx.subcontractor.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.contractorAttendance.create.mock.calls[0][0].data).toMatchObject({ subcontractorId: 'sub_new_2' })
    expect(mocks.tx.subcontractor.updateMany).toHaveBeenCalledWith({
      where: { id: 'sub_new_2', companyId: 'company_1' },
      data: { advance: { increment: 300 } },
    })
  })

  it('rolls the log and the new subcontractor back when the advance increment fails', async () => {
    mocks.tx.subcontractor.updateMany.mockResolvedValue({ count: 0 })
    await expect(mobile.saveContractorAttendance(log({ contractorName: 'New Crew' }))).rejects.toThrow(/Subcontractor not found or access denied/)
    expect(mocks.tx.contractorAttendance.create).toHaveBeenCalledTimes(1)
    expect(committed).toEqual([])
  })

  it.each(['ca_other', 'ca_dead', 'missing'])('removeContractorAttendanceAction refuses log %s', async (id) => {
    await expect(mobile.removeContractorAttendanceAction(id, 'Bricks Co')).rejects.toThrow(/not found or access denied/)
    expect(allWrites()).toBe(0)
  })

  it('removeContractorAttendanceAction checks the confirmation before writing', async () => {
    await expect(mobile.removeContractorAttendanceAction('ca_1', 'nope')).rejects.toThrow(/did not match/)
    expect(allWrites()).toBe(0)
  })

  it('removeContractorAttendanceAction deletes the log and reverses the advance atomically', async () => {
    await mobile.removeContractorAttendanceAction('ca_1', 'Bricks Co')
    expect(mocks.tx.contractorAttendance.deleteMany).toHaveBeenCalledWith({ where: { id: 'ca_1', companyId: 'company_1' } })
    expect(mocks.tx.subcontractor.updateMany).toHaveBeenCalledWith({
      where: { id: 'sub_1', companyId: 'company_1' },
      data: { advance: { decrement: 200 } },
    })
    expect(committed.map(([name]) => name)).toEqual(['contractorAttendance.deleteMany', 'subcontractor.updateMany'])
    expect(mocks.prisma.contractorAttendance.delete).not.toHaveBeenCalled()
  })

  it('removeContractorAttendanceAction restores the log when the reversal fails', async () => {
    mocks.tx.subcontractor.updateMany.mockResolvedValue({ count: 0 })
    await expect(mobile.removeContractorAttendanceAction('ca_1', 'Bricks Co')).rejects.toThrow(/Subcontractor not found or access denied/)
    // The log delete itself matched the real tenant record; only the reversal found nothing.
    await expect(mocks.tx.contractorAttendance.deleteMany.mock.results[0].value).resolves.toEqual({ count: 1 })
    expect(mocks.tx.subcontractor.updateMany).toHaveBeenCalledTimes(1)
    expect(committed).toEqual([])
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })

  it('removeContractorAttendanceAction with no advance only deletes the log', async () => {
    await mobile.removeContractorAttendanceAction('ca_free', 'Bricks Co')
    expect(mocks.tx.subcontractor.updateMany).not.toHaveBeenCalled()
    expect(committed.map(([name]) => name)).toEqual(['contractorAttendance.deleteMany'])
  })
})

describe('removeLabourAttendanceAction', () => {
  it.each(['lab_other', 'lab_dead', 'lab_cross', 'missing'])('refuses worker %s', async (labourId) => {
    await expect(mobile.removeLabourAttendanceAction(labourId, 'Foreign')).rejects.toThrow(/Labour not found or access denied/)
    expect(allWrites()).toBe(0)
  })

  it('deletes only the live tenant worker\'s attendance for today', async () => {
    await mobile.removeLabourAttendanceAction('lab_1', 'Ravi')
    const where = mocks.prisma.labourAttendance.deleteMany.mock.calls[0][0].where
    expect(where).toMatchObject({ labourId: 'lab_1', labour: { companyId: 'company_1' } })
    expect(where.date).toBeInstanceOf(Date)
  })
})
