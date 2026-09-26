import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for field roles reading and ticking checklists of sites they are not
 * assigned to.
 *
 * `requireChecklistSite` bound a site to "a live site of the caller's company" (a CLIENT
 * to their own site), so a SITE_ENGINEER or SUPERVISOR could read the pending tasks of,
 * and tick progress on, any site of the company. `getPendingChecklistPhotos()` without a
 * site listed every company checklist task awaiting a photo, to field roles and clients
 * alike.
 *
 * Now every checklist read and mutation binds the site through the shared
 * `assignedSiteScope` (field roles: their assigned live sites; other roles: every live
 * company site), a CLIENT stays bound to their exact site, and the site-less photo list
 * covers only the sites the caller may read. An unassigned, deleted or foreign site fails
 * before any checklist data is queried.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module`, `@/lib/auth/site-mutation` and
 * `@/lib/auth/checklist-site` are real.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    company: { findUnique: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findFirst: vi.fn(), findMany: vi.fn() },
    checklistTemplate: { findFirst: vi.fn() },
    projectChecklist: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    projectChecklistCategory: { findFirst: vi.fn(), update: vi.fn() },
    projectChecklistTask: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const actions = await import('@/actions/checklists')

const ENGINEER = 'user_site_engineer'
const SUPERVISOR = 'user_supervisor'

const SITES: Row[] = [
  { id: 'site_mine', companyId: 'company_1', deletedAt: null, assignedEngineerId: ENGINEER, engineerId: null, clientUserId: 'user_client', name: 'Mine' },
  { id: 'site_listed', companyId: 'company_1', deletedAt: null, assignedEngineerId: null, engineerId: null, clientUserId: null, name: 'Listed' },
  { id: 'site_theirs', companyId: 'company_1', deletedAt: null, assignedEngineerId: 'user_someone_else', engineerId: null, clientUserId: 'user_other_client', name: 'Theirs' },
  { id: 'site_dead', companyId: 'company_1', deletedAt: new Date('2026-01-01'), assignedEngineerId: ENGINEER, engineerId: SUPERVISOR, clientUserId: 'user_client', name: 'Dead' },
  { id: 'site_other', companyId: 'company_2', deletedAt: null, assignedEngineerId: ENGINEER, engineerId: SUPERVISOR, clientUserId: 'user_client', name: 'Foreign' },
]

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
  mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['SITES', 'TASKS'], status: 'ACTIVE' })
  // Field roles are assigned to site_listed by active membership (and ENGINEER to site_mine directly).
  mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: ['site_listed'] })
  const sites = inMemoryDelegate(SITES)
  mocks.prisma.site.findFirst.mockImplementation(sites.findFirst)
  mocks.prisma.site.findMany.mockImplementation(sites.findMany)
  mocks.prisma.checklistTemplate.findFirst.mockResolvedValue({ id: 'tpl_1', stages: [] })
  mocks.prisma.projectChecklist.findFirst.mockImplementation(async (args: { select?: unknown }) => (args?.select ? { id: 'checklist_1' } : null))
  mocks.prisma.projectChecklistCategory.findFirst.mockResolvedValue({ id: 'cat_1' })
  mocks.prisma.projectChecklistTask.findFirst.mockResolvedValue({ id: 'task_1', name: 'Pour slab' })
  mocks.prisma.projectChecklistTask.findMany.mockResolvedValue([])
  mocks.prisma.auditLog.findMany.mockResolvedValue([])
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.prisma) => unknown) => fn(mocks.prisma))
})

/** Every checklist read or mutation that takes a site id. */
const SITE_CALLS = {
  getPendingTasks: (site: string) => actions.getPendingTasks(site),
  getPendingChecklistPhotos: (site: string) => actions.getPendingChecklistPhotos(site),
  toggleTaskStatus: (site: string) => actions.toggleTaskStatus(site, 'task_1', 'COMPLETED'),
  toggleCategoryNeglect: (site: string) => actions.toggleCategoryNeglect(site, 'cat_1', true),
  addCustomTask: (site: string) => actions.addCustomTask(site, 'cat_1', 'New task'),
  editChecklistTask: (site: string) => actions.editChecklistTask(site, 'task_1', 'Renamed'),
  deleteChecklistTask: (site: string) => actions.deleteChecklistTask(site, 'task_1'),
  deleteProjectChecklist: (site: string) => actions.deleteProjectChecklist(site),
  enableChecklistForProject: (site: string) => actions.enableChecklistForProject(site, 'tpl_1'),
}

function checklistDataQueries() {
  const { prisma } = mocks
  return [
    prisma.checklistTemplate.findFirst, prisma.projectChecklist.findFirst, prisma.projectChecklistCategory.findFirst,
    prisma.projectChecklistTask.findFirst, prisma.projectChecklistTask.findMany, prisma.auditLog.findMany,
    prisma.projectChecklist.create, prisma.projectChecklist.delete, prisma.projectChecklistCategory.update,
    prisma.projectChecklistTask.create, prisma.projectChecklistTask.update, prisma.projectChecklistTask.delete,
    prisma.auditLog.create, prisma.auditLog.deleteMany,
  ].reduce((sum, fn) => sum + fn.mock.calls.length, 0)
}

describe('checklist field-role assigned-site scope', () => {
  describe.each(['SITE_ENGINEER', 'SUPERVISOR'])('%s', (role) => {
    beforeEach(() => mocks.requireUser.mockResolvedValue(principal(role)))

    it.each(Object.keys(SITE_CALLS) as (keyof typeof SITE_CALLS)[])(
      'refuses %s on an unassigned company site before any checklist query',
      async (name) => {
        await expect(SITE_CALLS[name]('site_theirs')).rejects.toThrow(/FORBIDDEN/)
        expect(checklistDataQueries()).toBe(0)
      },
    )

    it.each(['site_dead', 'site_other', 'missing'])('refuses reads and progress on site %s', async (siteId) => {
      await expect(actions.getPendingTasks(siteId)).rejects.toThrow(/FORBIDDEN/)
      await expect(actions.getPendingChecklistPhotos(siteId)).rejects.toThrow(/FORBIDDEN/)
      await expect(actions.toggleTaskStatus(siteId, 'task_1', 'COMPLETED')).rejects.toThrow(/FORBIDDEN/)
      expect(checklistDataQueries()).toBe(0)
    })

    it('reads and ticks progress on a site assigned by active membership', async () => {
      await expect(actions.getPendingTasks('site_listed')).resolves.toEqual([])
      await expect(actions.getPendingChecklistPhotos('site_listed')).resolves.toEqual([])
      await expect(actions.toggleTaskStatus('site_listed', 'task_1', 'COMPLETED')).resolves.toEqual({ success: true })
      expect(mocks.prisma.companyMember.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: `user_${role.toLowerCase()}`, companyId: 'company_1', isActive: true },
      }))
    })

    it('loses a membership-listed site once the membership is inactive', async () => {
      mocks.prisma.companyMember.findFirst.mockResolvedValue(null)
      await expect(actions.getPendingTasks('site_listed')).rejects.toThrow(/FORBIDDEN/)
      expect(checklistDataQueries()).toBe(0)
    })

    it('lists pending checklist photos only for assigned live sites', async () => {
      await actions.getPendingChecklistPhotos()
      const where = mocks.prisma.projectChecklistTask.findMany.mock.calls[0][0].where
      const expected = role === 'SITE_ENGINEER' ? ['site_mine', 'site_listed'] : ['site_listed']
      expect(where.category.stage.checklist).toEqual({ companyId: 'company_1', siteId: { in: expected } })
    })
  })

  it('reads a site the engineer is directly assigned to', async () => {
    await expect(actions.getPendingTasks('site_mine')).resolves.toEqual([])
    expect(mocks.prisma.projectChecklist.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { siteId: 'site_mine', companyId: 'company_1' },
    }))
  })
})

describe('checklist scope for other roles', () => {
  it.each(['COMPANY_ADMIN', 'PROJECT_MANAGER'])('lets a %s act on any live site of its company', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(actions.getPendingTasks('site_theirs')).resolves.toEqual([])
    await expect(actions.toggleTaskStatus('site_theirs', 'task_1', 'COMPLETED')).resolves.toEqual({ success: true })
    await expect(actions.deleteProjectChecklist('site_theirs')).resolves.toEqual({ success: true })
    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
  })

  it.each(['COMPANY_ADMIN', 'PROJECT_MANAGER'])('refuses a %s on a deleted or foreign site', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    for (const siteId of ['site_dead', 'site_other']) {
      await expect(actions.getPendingTasks(siteId)).rejects.toThrow(/FORBIDDEN/)
      await expect(actions.deleteProjectChecklist(siteId)).rejects.toThrow(/FORBIDDEN/)
    }
    expect(checklistDataQueries()).toBe(0)
  })

  it('lists pending checklist photos for every live site of an admin company', async () => {
    mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
    await actions.getPendingChecklistPhotos()
    const where = mocks.prisma.projectChecklistTask.findMany.mock.calls[0][0].where
    expect(where.category.stage.checklist).toEqual({ companyId: 'company_1', siteId: { in: ['site_mine', 'site_listed', 'site_theirs'] } })
  })

  it('keeps a CLIENT bound to their exact site', async () => {
    mocks.requireUser.mockResolvedValue(principal('CLIENT'))
    await expect(actions.getPendingTasks('site_mine')).resolves.toEqual([])
    await expect(actions.getPendingTasks('site_theirs')).rejects.toThrow(/FORBIDDEN/)
    await expect(actions.getPendingTasks('site_dead')).rejects.toThrow(/FORBIDDEN/)
    await expect(actions.getPendingTasks('site_other')).rejects.toThrow(/FORBIDDEN/)

    await actions.getPendingChecklistPhotos()
    const where = mocks.prisma.projectChecklistTask.findMany.mock.calls[0][0].where
    expect(where.category.stage.checklist).toEqual({ companyId: 'company_1', siteId: { in: ['site_mine'] } })
  })

  it('returns no photos without querying tasks when the caller may read no site', async () => {
    mocks.prisma.companyMember.findFirst.mockResolvedValue(null)
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))
    await expect(actions.getPendingChecklistPhotos()).resolves.toEqual([])
    expect(mocks.prisma.projectChecklistTask.findMany).not.toHaveBeenCalled()
  })

  it('refuses a tenant principal without a company', async () => {
    mocks.requireUser.mockResolvedValue({ ...principal('SITE_ENGINEER'), companyId: null })
    await expect(actions.getPendingTasks('site_mine')).rejects.toThrow(/FORBIDDEN/)
    await expect(actions.getPendingChecklistPhotos()).resolves.toEqual([])
    expect(checklistDataQueries()).toBe(0)
  })
})
