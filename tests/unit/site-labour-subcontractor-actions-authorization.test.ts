import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'

/**
 * Regression for the site labour and site subcontractor page actions authorizing from
 * JWT claims alone.
 *
 * The actions only checked that the token carried a company id: any role could edit
 * wages, mark payments or deactivate workers and subcontractors, the LABOUR / MATERIALS
 * modules were ignored, the URL site was never checked (a deleted or foreign site id
 * worked), a worker of another site was re-homed onto the URL site, trade and status
 * were cast straight from the form, `markLabourPaid` read the latest attendance by a bare
 * labour id across tenants and wrote a read-modify-write total, and `markSubPaid` did the
 * same read-then-overwrite on the subcontractor advance.
 *
 * Now labour actions require live `labour.manage` + LABOUR, subcontractor edits live
 * `materials.update` + MATERIALS, subcontractor payments live `payments.manage` +
 * MATERIALS, all before any read; the URL site must be a live site of exactly the live
 * company, the target row must belong to that company and site, inputs are validated and
 * payments are atomic increments.
 *
 * `@/lib/permissions`, `@/lib/auth/require-permission`, `@/lib/auth/require-module` and
 * `@/lib/auth/site-mutation` are real.
 */
const mocks = vi.hoisted(() => {
  const tx = {
    labour: { findFirst: vi.fn(), updateMany: vi.fn() },
    labourAttendance: { findFirst: vi.fn(), updateMany: vi.fn() },
  }
  return {
    requireUser: vi.fn(),
    auth: vi.fn(),
    revalidatePath: vi.fn(),
    logActivity: vi.fn(),
    tx,
    prisma: {
      company: { findUnique: vi.fn() },
      site: { findFirst: vi.fn() },
      labour: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
      labourAttendance: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      subcontractor: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))

const labourActions = await import('@/actions/site-labour')
const subActions = await import('@/actions/site-subcontractors')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', name: 'Tower A', deletedAt: null },
  { id: 'site_2', companyId: 'company_1', name: 'Tower B', deletedAt: null },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', deletedAt: new Date('2026-01-01') },
  { id: 'site_other', companyId: 'company_2', name: 'Other', deletedAt: null },
]

const LABOUR: Row[] = [
  { id: 'lab_1', companyId: 'company_1', siteId: 'site_1', name: 'Ravi' },
  { id: 'lab_site2', companyId: 'company_1', siteId: 'site_2', name: 'Kumar' },
  { id: 'lab_dead', companyId: 'company_1', siteId: 'site_dead', name: 'Old' },
  { id: 'lab_other', companyId: 'company_2', siteId: 'site_other', name: 'Foreign' },
]

const ATTENDANCE: Row[] = [
  { id: 'att_1', labourId: 'lab_1', siteId: 'site_1', advance: 100 },
  { id: 'att_other', labourId: 'lab_other', siteId: 'site_other', advance: 50 },
]

const SUBS: Row[] = [
  { id: 'sub_1', companyId: 'company_1', siteId: 'site_1', name: 'Bricks Co', trade: 'Brickwork', status: 'Active', isActive: true, raBilled: 0, advance: 0, retention: 0 },
  { id: 'sub_unbound', companyId: 'company_1', siteId: null, name: 'Floating Co', trade: null, status: 'Active', isActive: true, raBilled: 0, advance: 0, retention: 0 },
  { id: 'sub_site2', companyId: 'company_1', siteId: 'site_2', name: 'Elsewhere Co', trade: null, status: 'Active', isActive: true, raBilled: 0, advance: 0, retention: 0 },
  { id: 'sub_other', companyId: 'company_2', siteId: 'site_other', name: 'Foreign Co', trade: null, status: 'Active', isActive: true, raBilled: 0, advance: 0, retention: 0 },
]

const siteRelation: RelationResolver = (row, key) => {
  if (key !== 'site') return undefined
  return SITES.find((site) => site.id === row.siteId) ?? null
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
  form({ id: 'lab_1', name: 'Ravi K', phone: '', trade: 'MASON', dailyWage: '800', overtimeRate: '100', openingAdvance: '0', siteId: 'site_1', status: 'active', ...overrides })

const subForm = (overrides: Record<string, string> = {}) =>
  form({ id: 'sub_1', name: 'Bricks Co', phone: '', trade: 'Brickwork', gst: '', workOrderValue: '1000', raBilled: '200', advance: '50', retention: '10', status: 'Active', ...overrides })

let modules: unknown

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['SITES', 'LABOUR', 'MATERIALS']
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.auth.mockResolvedValue({ user: principal('COMPANY_ADMIN') })
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)

  const labour = inMemoryDelegate(LABOUR, siteRelation)
  const attendance = inMemoryDelegate(ATTENDANCE)
  for (const delegate of [mocks.prisma.labour, mocks.tx.labour]) {
    delegate.findFirst.mockImplementation(labour.findFirst)
    delegate.updateMany.mockImplementation(labour.updateMany)
  }
  for (const delegate of [mocks.prisma.labourAttendance, mocks.tx.labourAttendance]) {
    delegate.findFirst.mockImplementation(attendance.findFirst)
    delegate.updateMany.mockImplementation(attendance.updateMany)
  }
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx))

  const subs = inMemoryDelegate(SUBS, siteRelation)
  mocks.prisma.subcontractor.findFirst.mockImplementation(subs.findFirst)
  mocks.prisma.subcontractor.updateMany.mockImplementation(subs.updateMany)
})

function labourWrites() {
  return [
    mocks.prisma.labour.updateMany, mocks.prisma.labour.update, mocks.prisma.labourAttendance.update, mocks.prisma.labourAttendance.updateMany,
    mocks.tx.labour.updateMany, mocks.tx.labourAttendance.updateMany,
  ].reduce((sum, fn) => sum + fn.mock.calls.length, 0)
}

function subWrites() {
  return mocks.prisma.subcontractor.updateMany.mock.calls.length + mocks.prisma.subcontractor.update.mock.calls.length
}

const LABOUR_ACTIONS = [
  { name: 'updateSiteLabour', run: (siteId = 'site_1', fields: Record<string, string> = {}) => labourActions.updateSiteLabour(siteId, labourForm(fields)) },
  { name: 'markSiteLabourPaid', run: (siteId = 'site_1', fields: Record<string, string> = {}) => labourActions.markSiteLabourPaid(siteId, form({ id: 'lab_1', amount: '500', ...fields })) },
  { name: 'deactivateSiteLabour', run: (siteId = 'site_1', fields: Record<string, string> = {}) => labourActions.deactivateSiteLabour(siteId, form({ id: 'lab_1', ...fields })) },
]

describe('site labour actions (F3-F4)', () => {
  it.each(LABOUR_ACTIONS)('$name refuses a revoked principal before any read', async ({ run }) => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))
    await expect(run()).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.labour.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it.each(LABOUR_ACTIONS.flatMap((action) => ['PROJECT_MANAGER', 'SITE_ENGINEER', 'SUPERVISOR', 'ACCOUNTANT', 'SUBCONTRACTOR', 'CLIENT'].map((role) => ({ ...action, role }))))(
    '$name refuses live $role without labour.manage before any read',
    async ({ run, role }) => {
      mocks.requireUser.mockResolvedValue(principal(role))
      await expect(run()).rejects.toThrow(/labour\.manage/)
      expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
      expect(labourWrites()).toBe(0)
    },
  )

  it.each(LABOUR_ACTIONS)('$name refuses when the LABOUR module is disabled', async ({ run }) => {
    modules = ['SITES']
    await expect(run()).rejects.toThrow(/Module LABOUR is not enabled/)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(labourWrites()).toBe(0)
  })

  it.each(LABOUR_ACTIONS.flatMap((action) => ['site_other', 'site_dead', 'missing'].map((siteId) => ({ ...action, siteId }))))(
    '$name refuses URL site $siteId',
    async ({ run, siteId }) => {
      await expect(run(siteId, { id: siteId === 'site_dead' ? 'lab_dead' : 'lab_other' })).rejects.toThrow(/Site not found or access denied/)
      expect(labourWrites()).toBe(0)
    },
  )

  it.each(LABOUR_ACTIONS.flatMap((action) => ['lab_other', 'lab_site2', 'missing'].map((labourId) => ({ ...action, labourId }))))(
    '$name refuses worker $labourId that is not on this live tenant site',
    async ({ run, labourId }) => {
      await expect(run('site_1', { id: labourId })).rejects.toThrow(/Labour not found or access denied/)
      expect(labourWrites()).toBe(0)
    },
  )

  it.each([
    ['an unknown trade', { trade: 'ASTRONAUT' }],
    ['an unknown status', { status: 'retired' }],
    ['a negative wage', { dailyWage: '-1' }],
    ['a non-finite overtime rate', { overtimeRate: 'Infinity' }],
    ['a blank name', { name: ' ' }],
  ])('updateSiteLabour rejects %s without writing', async (_name, overrides) => {
    await expect(labourActions.updateSiteLabour('site_1', labourForm(overrides))).rejects.toThrow(/invalid|required/i)
    expect(labourWrites()).toBe(0)
  })

  it('updateSiteLabour writes validated fields only to the worker on this site', async () => {
    await labourActions.updateSiteLabour('site_1', labourForm({ siteId: 'site_other', status: 'inactive' }))
    const call = mocks.prisma.labour.updateMany.mock.calls[0][0]
    expect(call.where).toEqual({ id: 'lab_1', companyId: 'company_1', siteId: 'site_1', site: { deletedAt: null } })
    expect(call.data).toEqual({ name: 'Ravi K', phone: null, trade: 'MASON', dailyWage: 800, overtimeRate: 100, openingAdvance: 0, isActive: false })
  })

  it.each(['0', '-5', 'abc', 'Infinity', ''])('markSiteLabourPaid rejects amount %j', async (amount) => {
    await expect(labourActions.markSiteLabourPaid('site_1', form({ id: 'lab_1', amount }))).rejects.toThrow(/invalid/i)
    expect(labourWrites()).toBe(0)
  })

  it('markSiteLabourPaid atomically increments the latest attendance advance inside one transaction', async () => {
    await labourActions.markSiteLabourPaid('site_1', form({ id: 'lab_1', amount: '500' }))
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.labour.findFirst.mock.calls[0][0].where).toEqual({ id: 'lab_1', companyId: 'company_1', siteId: 'site_1', site: { deletedAt: null } })
    expect(mocks.tx.labourAttendance.findFirst.mock.calls[0][0].where).toEqual({ labourId: 'lab_1' })
    expect(mocks.tx.labourAttendance.updateMany).toHaveBeenCalledWith({
      where: { id: 'att_1', labourId: 'lab_1' },
      data: { advance: { increment: 500 } },
    })
    expect(mocks.prisma.labourAttendance.update).not.toHaveBeenCalled()
    expect(mocks.prisma.labourAttendance.updateMany).not.toHaveBeenCalled()
  })

  it('markSiteLabourPaid increments the opening advance when there is no attendance', async () => {
    mocks.tx.labourAttendance.findFirst.mockResolvedValue(null)
    await labourActions.markSiteLabourPaid('site_1', form({ id: 'lab_1', amount: '250' }))
    expect(mocks.tx.labour.updateMany).toHaveBeenCalledWith({
      where: { id: 'lab_1', companyId: 'company_1', siteId: 'site_1' },
      data: { openingAdvance: { increment: 250 } },
    })
  })

  it('markSiteLabourPaid never reads another tenant\'s attendance for a foreign worker', async () => {
    await expect(labourActions.markSiteLabourPaid('site_1', form({ id: 'lab_other', amount: '10' }))).rejects.toThrow(/access denied/)
    expect(mocks.tx.labourAttendance.findFirst).not.toHaveBeenCalled()
  })

  it.each(['updateSiteLabour', 'deactivateSiteLabour'] as const)('%s fails when the guarded write matches no row', async (name) => {
    mocks.prisma.labour.updateMany.mockResolvedValue({ count: 0 })
    const fd = name === 'updateSiteLabour' ? labourForm() : form({ id: 'lab_1' })
    await expect(labourActions[name]('site_1', fd)).rejects.toThrow(/access denied/)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('markSiteLabourPaid fails when the increment matches no row', async () => {
    mocks.tx.labourAttendance.updateMany.mockResolvedValue({ count: 0 })
    await expect(labourActions.markSiteLabourPaid('site_1', form({ id: 'lab_1', amount: '5' }))).rejects.toThrow(/access denied/)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('deactivateSiteLabour deactivates only the worker on this live site', async () => {
    await labourActions.deactivateSiteLabour('site_1', form({ id: 'lab_1' }))
    expect(mocks.prisma.labour.updateMany).toHaveBeenCalledWith({
      where: { id: 'lab_1', companyId: 'company_1', siteId: 'site_1', site: { deletedAt: null } },
      data: { isActive: false },
    })
    expect(mocks.prisma.labour.update).not.toHaveBeenCalled()
  })
})

const SUB_ACTIONS = [
  { name: 'updateSiteSubcontractor', permission: 'materials.update', run: (siteId = 'site_1', fields: Record<string, string> = {}) => subActions.updateSiteSubcontractor(siteId, subForm(fields)) },
  { name: 'markSiteSubcontractorPaid', permission: 'payments.manage', run: (siteId = 'site_1', fields: Record<string, string> = {}) => subActions.markSiteSubcontractorPaid(siteId, form({ id: 'sub_1', amount: '100', ...fields })) },
  { name: 'deactivateSiteSubcontractor', permission: 'materials.update', run: (siteId = 'site_1', fields: Record<string, string> = {}) => subActions.deactivateSiteSubcontractor(siteId, form({ id: 'sub_1', dangerConfirmText: 'Bricks Co', ...fields })) },
]

describe('site subcontractor actions (F5)', () => {
  it.each(SUB_ACTIONS)('$name refuses a revoked principal before any read', async ({ run }) => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Account is inactive'))
    await expect(run()).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.subcontractor.findFirst).not.toHaveBeenCalled()
  })

  it.each(SUB_ACTIONS.flatMap((action) => ['SITE_ENGINEER', 'SUPERVISOR', 'SUBCONTRACTOR', 'CLIENT', 'VENDOR'].map((role) => ({ ...action, role }))))(
    '$name refuses live $role without $permission',
    async ({ run, role }) => {
      mocks.requireUser.mockResolvedValue(principal(role))
      await expect(run()).rejects.toThrow(/FORBIDDEN/)
      expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
      expect(subWrites()).toBe(0)
    },
  )

  it('edits need materials.update and payments need payments.manage', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))
    await expect(subActions.updateSiteSubcontractor('site_1', subForm())).rejects.toThrow(/materials\.update/)
    await expect(subActions.markSiteSubcontractorPaid('site_1', form({ id: 'sub_1', amount: '10' }))).resolves.toBeUndefined()

    mocks.requireUser.mockResolvedValue(principal('PURCHASE_MANAGER'))
    await expect(subActions.markSiteSubcontractorPaid('site_1', form({ id: 'sub_1', amount: '10' }))).rejects.toThrow(/payments\.manage/)
    await expect(subActions.updateSiteSubcontractor('site_1', subForm())).resolves.toBeUndefined()
  })

  it.each(SUB_ACTIONS)('$name refuses when the MATERIALS module is disabled', async ({ run }) => {
    modules = ['SITES', 'LABOUR']
    await expect(run()).rejects.toThrow(/Module MATERIALS is not enabled/)
    expect(subWrites()).toBe(0)
  })

  it.each(SUB_ACTIONS.flatMap((action) => ['site_other', 'site_dead'].map((siteId) => ({ ...action, siteId }))))(
    '$name refuses URL site $siteId',
    async ({ run, siteId }) => {
      await expect(run(siteId)).rejects.toThrow(/Site not found or access denied/)
      expect(subWrites()).toBe(0)
    },
  )

  it.each(SUB_ACTIONS.flatMap((action) => ['sub_other', 'sub_site2', 'missing'].map((subId) => ({ ...action, subId }))))(
    '$name refuses subcontractor $subId that is not bound to this tenant site',
    async ({ run, subId }) => {
      await expect(run('site_1', { id: subId })).rejects.toThrow(/Subcontractor not found or access denied/)
      expect(subWrites()).toBe(0)
    },
  )

  it('markSiteSubcontractorPaid is one atomic increment scoped to the tenant site', async () => {
    await subActions.markSiteSubcontractorPaid('site_1', form({ id: 'sub_unbound', amount: '100' }))
    expect(mocks.prisma.subcontractor.updateMany).toHaveBeenCalledWith({
      where: { id: 'sub_unbound', companyId: 'company_1', OR: [{ siteId: null }, { siteId: 'site_1' }] },
      data: { advance: { increment: 100 } },
    })
    // The pre-write binding check reads only the id: the advance is never read back and
    // rewritten.
    expect(mocks.prisma.subcontractor.findFirst).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.subcontractor.findFirst).toHaveBeenCalledWith({
      where: { id: 'sub_unbound', companyId: 'company_1', OR: [{ siteId: null }, { siteId: 'site_1' }] },
      select: { id: true },
    })
  })

  it.each(['0', '-1', 'NaN', 'Infinity'])('markSiteSubcontractorPaid rejects amount %j', async (amount) => {
    await expect(subActions.markSiteSubcontractorPaid('site_1', form({ id: 'sub_1', amount }))).rejects.toThrow(/invalid/i)
    expect(subWrites()).toBe(0)
  })

  it.each([
    ['an unknown status', { status: 'Deleted' }],
    ['a negative advance', { advance: '-1' }],
    ['a non-finite work order value', { workOrderValue: 'Infinity' }],
    ['a blank name', { name: '' }],
  ])('updateSiteSubcontractor rejects %s without writing', async (_name, overrides) => {
    await expect(subActions.updateSiteSubcontractor('site_1', subForm(overrides))).rejects.toThrow(/invalid|required/i)
    expect(subWrites()).toBe(0)
  })

  it('updateSiteSubcontractor writes only within the tenant site binding', async () => {
    await subActions.updateSiteSubcontractor('site_1', subForm())
    const call = mocks.prisma.subcontractor.updateMany.mock.calls[0][0]
    expect(call.where).toEqual({ id: 'sub_1', companyId: 'company_1', OR: [{ siteId: null }, { siteId: 'site_1' }] })
    expect(call.data).toMatchObject({ workOrderValue: 1000, raBilled: 200, advance: 50, retention: 10, status: 'Active' })
  })

  it('deactivateSiteSubcontractor checks the confirmation and deactivates within the binding', async () => {
    await expect(subActions.deactivateSiteSubcontractor('site_1', form({ id: 'sub_1', dangerConfirmText: 'nope' }))).rejects.toThrow(/did not match/)
    expect(subWrites()).toBe(0)
    await subActions.deactivateSiteSubcontractor('site_1', form({ id: 'sub_1', dangerConfirmText: 'Bricks Co' }))
    expect(mocks.prisma.subcontractor.updateMany).toHaveBeenCalledWith({
      where: { id: 'sub_1', companyId: 'company_1', OR: [{ siteId: null }, { siteId: 'site_1' }] },
      data: { isActive: false },
    })
    expect(mocks.logActivity).toHaveBeenCalledTimes(1)
  })

  it.each(SUB_ACTIONS)('$name fails when the guarded write matches no row', async ({ run }) => {
    mocks.prisma.subcontractor.updateMany.mockResolvedValue({ count: 0 })
    await expect(run()).rejects.toThrow(/access denied/)
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
