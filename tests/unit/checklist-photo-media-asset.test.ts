import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for `uploadChecklistPhotoAction` persisting whatever the browser sent.
 *
 * The action stored the client's `imageUrl` verbatim as the photo's `secureUrl` and made
 * up a `cloudinaryPublicId`, so any caller holding the photo grant could pin an arbitrary
 * external URL (tracking pixel, phishing page, another tenant's Cloudinary asset) on a
 * checklist task, where managers and the client portal would load it; the made-up public
 * id also meant the photo delete path could never clean the asset up. Field roles could
 * attach photos on any live company site, assigned or not.
 *
 * Now it takes a MediaAsset id produced by `/api/upload`: live SITE_PHOTO grants
 * (`sitePhotos.upload` or `tasks.manage`) + TASKS before any read, a live company site the
 * principal is assigned to, a task of that site's checklist, and an asset the same user
 * uploaded as a SITE_PHOTO for exactly that site and company, not yet bound to a photo.
 * The URL and public id are copied from the asset, all inside one transaction.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module` and `@/lib/auth/site-mutation` are real.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    company: { findUnique: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findFirst: vi.fn() },
    projectChecklistTask: { findFirst: vi.fn() },
    mediaAsset: { findFirst: vi.fn() },
    sitePhoto: { findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { uploadChecklistPhotoAction } = await import('@/actions/checklists')

const ENGINEER = 'user_site_engineer'

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', deletedAt: null, assignedEngineerId: null, engineerId: null },
  { id: 'site_mine', companyId: 'company_1', deletedAt: null, assignedEngineerId: ENGINEER, engineerId: null },
  { id: 'site_dead', companyId: 'company_1', deletedAt: new Date('2026-01-01'), assignedEngineerId: ENGINEER, engineerId: null },
  { id: 'site_other', companyId: 'company_2', deletedAt: null, assignedEngineerId: ENGINEER, engineerId: null },
]

const ASSETS: Row[] = [
  { id: 'asset_1', companyId: 'company_1', siteId: 'site_1', module: 'SITE_PHOTO', uploadedById: 'user_project_manager', secureUrl: 'https://res.cloudinary.com/demo/a1.jpg', cloudinaryPublicId: 'civil-tracker/acme/site_1/SITE_PHOTO/a1' },
  { id: 'asset_mine', companyId: 'company_1', siteId: 'site_mine', module: 'SITE_PHOTO', uploadedById: ENGINEER, secureUrl: 'https://res.cloudinary.com/demo/m.jpg', cloudinaryPublicId: 'civil-tracker/acme/site_mine/SITE_PHOTO/m' },
  { id: 'asset_bill', companyId: 'company_1', siteId: 'site_1', module: 'BILL', uploadedById: 'user_project_manager', secureUrl: 'b', cloudinaryPublicId: 'b' },
  { id: 'asset_other_site', companyId: 'company_1', siteId: 'site_mine', module: 'SITE_PHOTO', uploadedById: 'user_project_manager', secureUrl: 'x', cloudinaryPublicId: 'x' },
  { id: 'asset_foreign', companyId: 'company_2', siteId: 'site_1', module: 'SITE_PHOTO', uploadedById: 'user_project_manager', secureUrl: 'f', cloudinaryPublicId: 'f' },
  { id: 'asset_someone_else', companyId: 'company_1', siteId: 'site_1', module: 'SITE_PHOTO', uploadedById: 'user_other', secureUrl: 's', cloudinaryPublicId: 's' },
  { id: 'asset_used', companyId: 'company_1', siteId: 'site_1', module: 'SITE_PHOTO', uploadedById: 'user_project_manager', secureUrl: 'u', cloudinaryPublicId: 'already/bound' },
]

const PHOTOS: Row[] = [{ id: 'photo_old', cloudinaryPublicId: 'already/bound' }]

/** Tasks with the checklist they belong to, flattened for the in-memory `where`. */
const TASKS: Row[] = [
  { id: 'task_1', checklistSiteId: 'site_1', checklistCompanyId: 'company_1' },
  { id: 'task_mine', checklistSiteId: 'site_mine', checklistCompanyId: 'company_1' },
  { id: 'task_other_site', checklistSiteId: 'site_mine', checklistCompanyId: 'company_1' },
]

function taskLookup(args: { where: { id: string; category: { stage: { checklist: { siteId: string; companyId: string } } } } }) {
  const { id, category } = args.where
  const { siteId, companyId } = category.stage.checklist
  const task = TASKS.find((row) => row.id === id && row.checklistSiteId === siteId && row.checklistCompanyId === companyId)
  return Promise.resolve(task ? { id: task.id, name: 'Task' } : null)
}

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

let modules: unknown
let committed: string[]

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['SITES', 'TASKS']
  committed = []
  mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER'))
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: [] })
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)
  mocks.prisma.projectChecklistTask.findFirst.mockImplementation(taskLookup)
  mocks.prisma.mediaAsset.findFirst.mockImplementation(inMemoryDelegate(ASSETS).findFirst)
  mocks.prisma.sitePhoto.findFirst.mockImplementation(inMemoryDelegate(PHOTOS).findFirst)
  mocks.prisma.sitePhoto.create.mockImplementation(async () => {
    committed.push('sitePhoto.create')
    return { id: 'photo_new' }
  })
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.prisma) => unknown) => fn(mocks.prisma))
})

describe('uploadChecklistPhotoAction: gate before any read', () => {
  it('refuses a revoked principal', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Account is inactive'))
    await expect(uploadChecklistPhotoAction('task_1', 'site_1', 'asset_1')).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
  })

  it.each(['CLIENT', 'ACCOUNTANT', 'PURCHASE_MANAGER', 'VENDOR', 'SUBCONTRACTOR'])('refuses live %s', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(uploadChecklistPhotoAction('task_1', 'site_1', 'asset_1')).rejects.toThrow(/FORBIDDEN: Missing required permission/)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.mediaAsset.findFirst).not.toHaveBeenCalled()
  })

  it('refuses SUPER_ADMIN, which has no tenant context', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root', role: 'SUPER_ADMIN', email: 'root@x', name: 'Root' })
    await expect(uploadChecklistPhotoAction('task_1', 'site_1', 'asset_1')).rejects.toThrow(/Tenant context required/)
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
  })

  it('refuses when the TASKS module is disabled', async () => {
    modules = ['SITES']
    await expect(uploadChecklistPhotoAction('task_1', 'site_1', 'asset_1')).rejects.toThrow(/Module TASKS is not enabled/)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
  })
})

describe('uploadChecklistPhotoAction: site and task binding', () => {
  it.each(['site_dead', 'site_other', 'missing'])('refuses site %s', async (siteId) => {
    await expect(uploadChecklistPhotoAction('task_1', siteId, 'asset_1')).rejects.toThrow(/Site not found or access denied/)
    expect(mocks.prisma.mediaAsset.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
  })

  it.each(['SITE_ENGINEER', 'SUPERVISOR'])('refuses a %s on a live company site it is not assigned to', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(uploadChecklistPhotoAction('task_1', 'site_1', 'asset_1')).rejects.toThrow(/Site not found or access denied/)
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
  })

  it('lets a field engineer attach its own asset on an assigned site', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    await expect(uploadChecklistPhotoAction('task_mine', 'site_mine', 'asset_mine')).resolves.toEqual({ success: true })
    expect(committed).toEqual(['sitePhoto.create'])
  })

  it('refuses a task not on the bound site checklist', async () => {
    await expect(uploadChecklistPhotoAction('task_other_site', 'site_1', 'asset_1')).rejects.toThrow(/Checklist task not found or access denied/)
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
  })
})

describe('uploadChecklistPhotoAction: only a tenant-owned uploaded asset', () => {
  it.each([
    ['an external URL', 'https://evil.test/pixel.gif'],
    ['a javascript URL', 'javascript:alert(1)'],
    ["a Cloudinary URL of another tenant's asset", 'https://res.cloudinary.com/demo/f.jpg'],
    ['a raw public id', 'civil-tracker/acme/site_1/SITE_PHOTO/a1'],
    ['a missing asset', 'missing'],
    ["another tenant's asset", 'asset_foreign'],
    ['an asset of another site', 'asset_other_site'],
    ['a non-photo asset', 'asset_bill'],
    ["another user's asset", 'asset_someone_else'],
    ['an asset already bound to a photo', 'asset_used'],
    ['no asset id', ''],
  ])('refuses %s', async (_label, mediaAssetId) => {
    await expect(uploadChecklistPhotoAction('task_1', 'site_1', mediaAssetId)).rejects.toThrow(/Uploaded photo not found|already attached/)
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
  })

  it.each([undefined, null, 42, { secureUrl: 'https://evil.test/x.jpg' }])('refuses a non-string asset id %j', async (mediaAssetId) => {
    await expect(uploadChecklistPhotoAction('task_1', 'site_1', mediaAssetId as unknown as string)).rejects.toThrow(/Uploaded photo not found/)
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
  })

  it('stores the asset URL and public id derived server-side, inside one transaction', async () => {
    await expect(uploadChecklistPhotoAction('task_1', 'site_1', 'asset_1')).resolves.toEqual({ success: true })
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.mediaAsset.findFirst).toHaveBeenCalledWith({
      where: { id: 'asset_1', companyId: 'company_1', siteId: 'site_1', module: 'SITE_PHOTO', uploadedById: 'user_project_manager' },
      select: { secureUrl: true, cloudinaryPublicId: true },
    })
    expect(mocks.prisma.sitePhoto.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company_1',
        siteId: 'site_1',
        taskId: 'task_1',
        secureUrl: 'https://res.cloudinary.com/demo/a1.jpg',
        cloudinaryPublicId: 'civil-tracker/acme/site_1/SITE_PHOTO/a1',
        caption: 'Checklist Task Completed',
        uploadedById: 'user_project_manager',
      },
      select: { id: true },
    })
  })
})
