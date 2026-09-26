import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'

/**
 * Regression for the direct labour mutations in `@/actions/labour` binding only to the
 * live company.
 *
 * `createLabourAction`, `updateLabourAction`, `updateLabourRosterAction`,
 * `markLabourPaidAction` and `deactivateLabourAction` checked the site and the worker
 * against the company alone, so a field role holding `labour.manage` could register a
 * worker on, move a worker to or from, pay, or deactivate a worker of a site it is not
 * assigned to. The same field-role policy the muster-roll actions enforce now applies:
 * SITE_ENGINEER, SUPERVISOR and SUBCONTRACTOR act only on the live sites they are the
 * engineer of or that their *active* membership lists — both the worker's current site and
 * any target site — and are refused before any update or payment. Privileged company roles
 * keep acting on every live site of their company.
 *
 * Today no field role holds `labour.manage`; the permission matrix is widened here so the
 * site binding itself is exercised the day one does. `@/lib/auth/site-mutation` is real.
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
    redirect: vi.fn(),
    logActivity: vi.fn(),
    tx,
    prisma: {
      company: { findUnique: vi.fn() },
      companyMember: { findFirst: vi.fn() },
      site: { findFirst: vi.fn() },
      labour: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
      labourAttendance: { findFirst: vi.fn(), updateMany: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

const FIELD_ROLES = ['SITE_ENGINEER', 'SUPERVISOR', 'SUBCONTRACTOR'] as const

vi.mock('@/lib/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/permissions')>()
  return {
    ...actual,
    hasPermission: (role: string, permission: string) =>
      ((FIELD_ROLES as readonly string[]).includes(role) && permission === 'labour.manage') ||
      actual.hasPermission(role as never, permission as never),
  }
})
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))

const labourActions = await import('@/actions/labour')

const SITES: Row[] = [
  // Assigned through the active membership.
  { id: 'site_mine', companyId: 'company_1', deletedAt: null, assignedEngineerId: null, engineerId: null },
  // Assigned as the site's engineer.
  { id: 'site_engineer', companyId: 'company_1', deletedAt: null, assignedEngineerId: null, engineerId: 'user_field' },
  // A live site of the same company the field role is not assigned to.
  { id: 'site_theirs', companyId: 'company_1', deletedAt: null, assignedEngineerId: 'someone_else', engineerId: null },
  { id: 'site_dead', companyId: 'company_1', deletedAt: new Date('2026-01-01'), assignedEngineerId: 'user_field', engineerId: null },
  { id: 'site_other', companyId: 'company_2', deletedAt: null, assignedEngineerId: 'user_field', engineerId: null },
]

const LABOUR: Row[] = [
  { id: 'lab_mine', companyId: 'company_1', siteId: 'site_mine', name: 'Ravi', trade: 'MASON', isActive: true },
  { id: 'lab_theirs', companyId: 'company_1', siteId: 'site_theirs', name: 'Kumar', trade: 'HELPER', isActive: true },
  { id: 'lab_dead', companyId: 'company_1', siteId: 'site_dead', name: 'Old', trade: 'HELPER', isActive: true },
  { id: 'lab_other', companyId: 'company_2', siteId: 'site_other', name: 'Foreign', trade: 'HELPER', isActive: true },
]

const MEMBERS: Row[] = [
  { userId: 'user_field', companyId: 'company_1', isActive: true, siteIds: ['site_mine'] },
  // A deactivated membership that used to list the other site: it grants nothing.
  { userId: 'user_field', companyId: 'company_1', isActive: false, siteIds: ['site_theirs'] },
]

const relations: RelationResolver = (row, key) => {
  if (key === 'site') return SITES.find((site) => site.id === row.siteId) ?? null
  return undefined
}

function principal(role: string) {
  const id = (FIELD_ROLES as readonly string[]).includes(role) ? 'user_field' : `user_${role.toLowerCase()}`
  return { id, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId: 'company_1' }
}

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.append(key, value)
  return fd
}

const workerFields = { name: 'Ravi K', phone: '', trade: 'MASON', dailyWage: '800', overtimeRate: '', openingAdvance: '' }
const editForm = (id: string, siteId: string) => form({ ...workerFields, id, siteId, isActive: 'true' })
const rosterForm = (id: string, siteId: string) => form({ ...workerFields, id, siteId, status: 'active' })

function allWrites() {
  const { prisma, tx } = mocks
  return [
    prisma.labour.create, prisma.labour.updateMany, prisma.labourAttendance.updateMany,
    tx.labour.updateMany, tx.labourAttendance.updateMany, mocks.logActivity,
  ].reduce((sum, fn) => sum + fn.mock.calls.length, 0)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
  mocks.auth.mockResolvedValue({ user: principal('COMPANY_ADMIN') })
  mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['SITES', 'LABOUR'], status: 'ACTIVE' })
  mocks.prisma.companyMember.findFirst.mockImplementation(inMemoryDelegate(MEMBERS).findFirst)
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)

  const labour = inMemoryDelegate(LABOUR, relations)
  for (const delegate of [mocks.prisma.labour, mocks.tx.labour]) {
    delegate.findFirst.mockImplementation(labour.findFirst)
    delegate.updateMany.mockImplementation(labour.updateMany)
  }
  mocks.prisma.labour.create.mockImplementation(async (args: { data: Row }) => ({ id: 'lab_new', ...args.data }))
  mocks.tx.labourAttendance.findFirst.mockResolvedValue(null)
  mocks.tx.labourAttendance.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx))
})

const SITE_DENIED = /Site not found or access denied/
const LABOUR_DENIED = /Labour not found or access denied/

describe.each(FIELD_ROLES)('direct labour mutations for a field %s', (role) => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue(principal(role))
  })

  it.each(['site_theirs', 'site_dead', 'site_other', 'missing'])('createLabourAction refuses site %s', async (siteId) => {
    await expect(labourActions.createLabourAction(form({ ...workerFields, siteId }))).rejects.toThrow(SITE_DENIED)
    expect(allWrites()).toBe(0)
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it.each(['site_mine', 'site_engineer'])('createLabourAction registers a worker on assigned site %s', async (siteId) => {
    await labourActions.createLabourAction(form({ ...workerFields, siteId }))
    expect(mocks.prisma.labour.create).toHaveBeenCalledWith({ data: expect.objectContaining({ companyId: 'company_1', siteId }) })
  })

  it.each([
    ['updateLabourAction', (id: string, siteId: string) => labourActions.updateLabourAction(editForm(id, siteId))],
    ['updateLabourRosterAction', (id: string, siteId: string) => labourActions.updateLabourRosterAction(rosterForm(id, siteId))],
  ] as const)('%s refuses moving an assigned worker onto an unassigned site', async (_name, run) => {
    await expect(run('lab_mine', 'site_theirs')).rejects.toThrow(SITE_DENIED)
    expect(allWrites()).toBe(0)
  })

  it.each([
    ['updateLabourAction', (id: string, siteId: string) => labourActions.updateLabourAction(editForm(id, siteId))],
    ['updateLabourRosterAction', (id: string, siteId: string) => labourActions.updateLabourRosterAction(rosterForm(id, siteId))],
  ] as const)('%s refuses pulling a worker off an unassigned site onto an assigned one', async (_name, run) => {
    for (const id of ['lab_theirs', 'lab_dead', 'lab_other']) {
      await expect(run(id, 'site_mine')).rejects.toThrow(LABOUR_DENIED)
    }
    expect(allWrites()).toBe(0)
  })

  it('updateLabourAction moves an assigned worker between assigned sites', async () => {
    await labourActions.updateLabourAction(editForm('lab_mine', 'site_engineer'))
    expect(mocks.prisma.labour.updateMany).toHaveBeenCalledTimes(1)
    const [{ where, data }] = mocks.prisma.labour.updateMany.mock.calls[0]
    expect(data).toMatchObject({ siteId: 'site_engineer' })
    expect(where).toMatchObject({ id: 'lab_mine', companyId: 'company_1', site: expect.objectContaining({ companyId: 'company_1', deletedAt: null, OR: expect.any(Array) }) })
  })

  it('updateLabourRosterAction edits an assigned worker', async () => {
    await labourActions.updateLabourRosterAction(rosterForm('lab_mine', 'site_mine'))
    expect(mocks.prisma.labour.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'lab_mine', companyId: 'company_1' },
      data: expect.objectContaining({ siteId: 'site_mine' }),
    }))
  })

  it.each(['lab_theirs', 'lab_dead', 'lab_other'])('markLabourPaidAction refuses worker %s before any payment', async (id) => {
    await expect(labourActions.markLabourPaidAction(form({ id, amount: '500' }))).rejects.toThrow(LABOUR_DENIED)
    expect(mocks.tx.labourAttendance.findFirst).not.toHaveBeenCalled()
    expect(allWrites()).toBe(0)
  })

  it('markLabourPaidAction pays an assigned worker against attendance on its own site only', async () => {
    mocks.tx.labourAttendance.findFirst.mockResolvedValue({ id: 'att_1' })
    await labourActions.markLabourPaidAction(form({ id: 'lab_mine', amount: '500' }))
    expect(mocks.tx.labourAttendance.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { labourId: 'lab_mine', siteId: 'site_mine' },
    }))
    expect(mocks.tx.labourAttendance.updateMany).toHaveBeenCalledWith({
      where: { id: 'att_1', labourId: 'lab_mine' },
      data: { advance: { increment: 500 } },
    })
  })

  it.each(['lab_theirs', 'lab_dead', 'lab_other'])('deactivateLabourAction refuses worker %s before any write or audit', async (id) => {
    const name = LABOUR.find((row) => row.id === id)!.name as string
    await expect(labourActions.deactivateLabourAction(form({ id, dangerConfirmText: name }))).rejects.toThrow(LABOUR_DENIED)
    expect(allWrites()).toBe(0)
  })

  it('deactivateLabourAction deactivates an assigned worker', async () => {
    await labourActions.deactivateLabourAction(form({ id: 'lab_mine', dangerConfirmText: 'Ravi' }))
    expect(mocks.prisma.labour.updateMany).toHaveBeenCalledWith({ where: { id: 'lab_mine', companyId: 'company_1' }, data: { isActive: false } })
    expect(mocks.logActivity).toHaveBeenCalledTimes(1)
  })

  it('a deactivated membership grants no site', async () => {
    mocks.prisma.companyMember.findFirst.mockResolvedValue(null)
    await expect(labourActions.createLabourAction(form({ ...workerFields, siteId: 'site_mine' }))).rejects.toThrow(SITE_DENIED)
    await expect(labourActions.markLabourPaidAction(form({ id: 'lab_mine', amount: '5' }))).rejects.toThrow(LABOUR_DENIED)
    expect(allWrites()).toBe(0)
  })
})

describe('privileged company roles keep company-wide labour management', () => {
  it('COMPANY_ADMIN moves, pays and deactivates a worker on any live company site', async () => {
    mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))

    await labourActions.updateLabourAction(editForm('lab_theirs', 'site_mine'))
    expect(mocks.prisma.labour.updateMany.mock.calls[0][0].where).toEqual({
      id: 'lab_theirs', companyId: 'company_1', site: { companyId: 'company_1', deletedAt: null },
    })

    mocks.tx.labourAttendance.findFirst.mockResolvedValue({ id: 'att_any' })
    await labourActions.markLabourPaidAction(form({ id: 'lab_theirs', amount: '100' }))
    expect(mocks.tx.labourAttendance.findFirst.mock.calls[0][0].where).toEqual({ labourId: 'lab_theirs' })
    expect(mocks.tx.labourAttendance.updateMany).toHaveBeenCalledTimes(1)

    await labourActions.deactivateLabourAction(form({ id: 'lab_theirs', dangerConfirmText: 'Kumar' }))
    expect(mocks.logActivity).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
  })

  it('COMPANY_ADMIN is still refused deleted and foreign sites and workers', async () => {
    mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
    await expect(labourActions.createLabourAction(form({ ...workerFields, siteId: 'site_other' }))).rejects.toThrow(SITE_DENIED)
    await expect(labourActions.markLabourPaidAction(form({ id: 'lab_other', amount: '5' }))).rejects.toThrow(LABOUR_DENIED)
    await expect(labourActions.deactivateLabourAction(form({ id: 'lab_dead', dangerConfirmText: 'Old' }))).rejects.toThrow(LABOUR_DENIED)
    expect(allWrites()).toBe(0)
  })

  it.each(['PROJECT_MANAGER', 'ACCOUNTANT', 'CLIENT'])('%s without labour.manage is refused before any read', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(labourActions.markLabourPaidAction(form({ id: 'lab_mine', amount: '5' }))).rejects.toThrow(/labour\.manage/)
    await expect(labourActions.deactivateLabourAction(form({ id: 'lab_mine', dangerConfirmText: 'Ravi' }))).rejects.toThrow(/labour\.manage/)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.labour.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })
})
