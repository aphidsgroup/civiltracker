import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for project checklist mutations checking the tenant site but no permission.
 *
 * `requireChecklistSite` admits every live member of the company and a CLIENT on their
 * assigned site, and the mutations used it as their only gate. A CLIENT, VENDOR or
 * SUBCONTRACTOR could therefore tick tasks, add, rename or delete tasks, neglect
 * categories, enable or delete the whole checklist and attach checklist photos, and the
 * TASKS module was never consulted.
 *
 * Now each mutation names what it needs from the existing permission vocabulary before
 * the site is read: structural edits need `tasks.manage`; ticking progress needs
 * `tasks.manage` or `dpr.create` (field staff report progress, but may not set the
 * client-done or neglected flags); checklist photos need `tasks.manage` or
 * `sitePhotos.upload`. All of them need the TASKS module. Reads and the client's own
 * photo confirmation are unchanged.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module` and `@/lib/auth/checklist-site` are real.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    company: { findUnique: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findFirst: vi.fn() },
    mediaAsset: { findFirst: vi.fn() },
    $transaction: vi.fn(),
    checklistTemplate: { findFirst: vi.fn() },
    projectChecklist: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    projectChecklistCategory: { findFirst: vi.fn(), update: vi.fn() },
    projectChecklistTask: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
    sitePhoto: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const actions = await import('@/actions/checklists')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', deletedAt: null, clientUserId: 'user_client', name: 'Tower A' },
  { id: 'site_dead', companyId: 'company_1', deletedAt: new Date('2026-01-01'), clientUserId: 'user_client' },
]

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

let modules: unknown

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['SITES', 'TASKS']
  mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER'))
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)
  // Field roles are assigned to site_1; checklist photos bind to an uploaded asset
  // (see checklist-photo-media-asset.test.ts for the asset and assignment rules).
  mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: ['site_1'] })
  mocks.prisma.mediaAsset.findFirst.mockResolvedValue({ secureUrl: 'https://res.cloudinary.com/demo/x.jpg', cloudinaryPublicId: 'x' })
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.prisma) => unknown) => fn(mocks.prisma))
  mocks.prisma.checklistTemplate.findFirst.mockResolvedValue({ id: 'tpl_1', stages: [] })
  mocks.prisma.projectChecklist.findFirst.mockImplementation(async (args: { select?: unknown }) => (args?.select
    ? { id: 'checklist_1', templateId: 'tpl_1', createdAt: new Date('2026-01-01'), _count: { stages: 0 } }
    : null))
  mocks.prisma.projectChecklist.deleteMany.mockResolvedValue({ count: 1 })
  mocks.prisma.projectChecklistCategory.findFirst.mockResolvedValue({ id: 'cat_1' })
  mocks.prisma.projectChecklistTask.findFirst.mockResolvedValue({
    id: 'task_1', name: 'Pour slab', categoryId: 'cat_1',
    category: { name: 'Slab', stage: { name: 'Structure', checklistId: 'checklist_1' } },
    _count: { sitePhotos: 0, attachments: 0 },
  })
  mocks.prisma.projectChecklistTask.deleteMany.mockResolvedValue({ count: 1 })
  mocks.prisma.projectChecklistTask.count.mockResolvedValue(0)
  mocks.prisma.sitePhoto.count.mockResolvedValue(0)
  mocks.prisma.projectChecklistTask.findMany.mockResolvedValue([])
  mocks.prisma.auditLog.findMany.mockResolvedValue([])
})

const MUTATIONS = {
  enableChecklistForProject: (site = 'site_1') => actions.enableChecklistForProject(site, 'tpl_1'),
  toggleTaskStatus: (site = 'site_1') => actions.toggleTaskStatus(site, 'task_1', 'COMPLETED'),
  toggleCategoryNeglect: (site = 'site_1') => actions.toggleCategoryNeglect(site, 'cat_1', true),
  addCustomTask: (site = 'site_1') => actions.addCustomTask(site, 'cat_1', 'Extra'),
  editChecklistTask: (site = 'site_1') => actions.editChecklistTask(site, 'task_1', 'Renamed'),
  deleteChecklistTask: (site = 'site_1') => actions.deleteChecklistTask(site, 'task_1', 'Pour slab'),
  deleteProjectChecklist: (site = 'site_1') => actions.deleteProjectChecklist(site, 'Tower A'),
  uploadChecklistPhotoAction: (site = 'site_1') => actions.uploadChecklistPhotoAction('task_1', site, 'asset_1'),
}

type MutationName = keyof typeof MUTATIONS
const ALL = Object.keys(MUTATIONS) as MutationName[]
const STRUCTURAL: MutationName[] = ['enableChecklistForProject', 'toggleCategoryNeglect', 'addCustomTask', 'editChecklistTask', 'deleteChecklistTask', 'deleteProjectChecklist']

function writeCount() {
  return [
    mocks.prisma.projectChecklist.create, mocks.prisma.projectChecklist.delete, mocks.prisma.projectChecklist.deleteMany,
    mocks.prisma.projectChecklistCategory.update,
    mocks.prisma.projectChecklistTask.create, mocks.prisma.projectChecklistTask.update, mocks.prisma.projectChecklistTask.delete,
    mocks.prisma.projectChecklistTask.deleteMany,
    mocks.prisma.sitePhoto.create, mocks.prisma.auditLog.create, mocks.prisma.auditLog.deleteMany,
  ].reduce((sum, fn) => sum + fn.mock.calls.length, 0)
}

describe('checklist mutations: role and permission', () => {
  it.each(ALL.flatMap((name) => ['CLIENT', 'VENDOR', 'SUBCONTRACTOR', 'ACCOUNTANT', 'PURCHASE_MANAGER'].map((role) => ({ name, role }))))(
    '$role cannot $name',
    async ({ name, role }) => {
      mocks.requireUser.mockResolvedValue(principal(role))
      await expect(MUTATIONS[name]()).rejects.toThrow(/FORBIDDEN/)
      expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
      expect(writeCount()).toBe(0)
    },
  )

  it.each(STRUCTURAL.flatMap((name) => ['SITE_ENGINEER', 'SUPERVISOR'].map((role) => ({ name, role }))))(
    '$role cannot make the structural change $name',
    async ({ name, role }) => {
      mocks.requireUser.mockResolvedValue(principal(role))
      await expect(MUTATIONS[name]()).rejects.toThrow(/FORBIDDEN/)
      expect(writeCount()).toBe(0)
    },
  )

  it.each(['SITE_ENGINEER', 'SUPERVISOR'])('%s may tick task progress and attach a checklist photo', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(MUTATIONS.toggleTaskStatus()).resolves.toEqual({ success: true })
    await expect(MUTATIONS.uploadChecklistPhotoAction()).resolves.toEqual({ success: true })
  })

  it.each([
    ['client-done', true, false],
    ['neglected', false, true],
  ])('field staff cannot set the %s flag', async (_flag, isClientDone, isNeglected) => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    await expect(actions.toggleTaskStatus('site_1', 'task_1', 'PENDING', isClientDone, isNeglected)).rejects.toThrow(/FORBIDDEN/)
    expect(writeCount()).toBe(0)
  })

  it('field staff ticking progress leaves the manager-only flags untouched', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))
    await actions.toggleTaskStatus('site_1', 'task_1', 'COMPLETED')
    const data = mocks.prisma.projectChecklistTask.update.mock.calls[0][0].data
    expect(data).not.toHaveProperty('isClientDone')
    expect(data).not.toHaveProperty('isNeglected')
    expect(data).toMatchObject({ status: 'COMPLETED', completedById: 'user_supervisor' })
  })

  it.each(ALL)('a PROJECT_MANAGER (tasks.manage) may %s', async (name) => {
    await expect(MUTATIONS[name]()).resolves.toEqual({ success: true })
  })

  it('a manager may still set the client-done and neglected flags', async () => {
    await actions.toggleTaskStatus('site_1', 'task_1', 'PENDING', true, true)
    expect(mocks.prisma.projectChecklistTask.update.mock.calls[0][0].data).toMatchObject({ isClientDone: true, isNeglected: true })
  })
})

describe('checklist mutations: live principal, module and site', () => {
  it.each(ALL)('%s refuses a revoked principal', async (name) => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))
    await expect(MUTATIONS[name]()).rejects.toThrow(/UNAUTHORIZED/)
    expect(writeCount()).toBe(0)
  })

  it.each(ALL)('%s refuses when the TASKS module is disabled', async (name) => {
    modules = ['SITES']
    await expect(MUTATIONS[name]()).rejects.toThrow(/Module TASKS is not enabled/)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(writeCount()).toBe(0)
  })

  it.each(ALL)('%s refuses a deleted site', async (name) => {
    await expect(MUTATIONS[name]('site_dead')).rejects.toThrow(/access denied/)
    expect(writeCount()).toBe(0)
  })

  it.each(ALL)('%s refuses another tenant\'s manager', async (name) => {
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER', 'company_2'))
    await expect(MUTATIONS[name]()).rejects.toThrow(/access denied/)
    expect(writeCount()).toBe(0)
  })
})

describe('client read and photo confirmation behavior is preserved', () => {
  it('a CLIENT still reads pending tasks of their assigned site', async () => {
    mocks.requireUser.mockResolvedValue(principal('CLIENT'))
    await expect(actions.getPendingTasks('site_1')).resolves.toEqual([])
  })

  it('a CLIENT still confirms an approved photo on their assigned site', async () => {
    mocks.requireUser.mockResolvedValue(principal('CLIENT'))
    mocks.prisma.sitePhoto.findFirst.mockResolvedValue({
      id: 'photo_1', companyId: 'company_1', siteId: 'site_1', taskId: 'task_1',
      site: { companyId: 'company_1' },
      task: { category: { stage: { checklist: { siteId: 'site_1', companyId: 'company_1' } } } },
    })
    await expect(actions.clientApproveTaskPhoto('photo_1')).resolves.toEqual({ success: true })
    expect(mocks.prisma.projectChecklistTask.update).toHaveBeenCalledTimes(1)
  })
})
