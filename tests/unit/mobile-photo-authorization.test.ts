import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * `uploadMobileSitePhotoAction` resolved the site without a mutation grant (any member,
 * including a CLIENT on their portal site, could post photos), ignored the TASKS module,
 * let field staff post to sites they are not assigned to, and stored whatever `imageUrl`
 * the browser sent — an arbitrary external URL, or another tenant's Cloudinary asset —
 * under a made-up public id that the photo delete path could never clean up.
 *
 * Now it requires live `sitePhotos.upload` or `tasks.manage` and the TASKS module before
 * any read, a live company site the principal is assigned to (field roles), and a
 * MediaAsset id the caller uploaded as a SITE_PHOTO for exactly that site and company.
 * The photo row copies the asset's own URL and public id; client-sent URLs are ignored.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module` and `@/lib/auth/site-mutation` are real.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  auth: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    company: { findUnique: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findFirst: vi.fn() },
    mediaAsset: { findFirst: vi.fn() },
    sitePhoto: { create: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { uploadMobileSitePhotoAction } = await import('@/actions/mobile-photo')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', deletedAt: null, assignedEngineerId: null, engineerId: null },
  { id: 'site_mine', companyId: 'company_1', deletedAt: null, assignedEngineerId: 'user_site_engineer', engineerId: null },
  { id: 'site_dead', companyId: 'company_1', deletedAt: new Date('2026-01-01'), assignedEngineerId: 'user_site_engineer', engineerId: null },
  { id: 'site_other', companyId: 'company_2', deletedAt: null, assignedEngineerId: 'user_site_engineer', engineerId: null },
]

const ASSETS: Row[] = [
  { id: 'asset_1', companyId: 'company_1', siteId: 'site_1', module: 'SITE_PHOTO', uploadedById: 'user_company_admin', secureUrl: 'https://res.cloudinary.com/demo/a1.jpg', cloudinaryPublicId: 'civil-tracker/acme/site_1/SITE_PHOTO/a1' },
  { id: 'asset_mine', companyId: 'company_1', siteId: 'site_mine', module: 'SITE_PHOTO', uploadedById: 'user_site_engineer', secureUrl: 'https://res.cloudinary.com/demo/m.jpg', cloudinaryPublicId: 'civil-tracker/acme/site_mine/SITE_PHOTO/m' },
  { id: 'asset_bill', companyId: 'company_1', siteId: 'site_1', module: 'BILL', uploadedById: 'user_company_admin', secureUrl: 'https://res.cloudinary.com/demo/b.pdf', cloudinaryPublicId: 'b' },
  { id: 'asset_other_site', companyId: 'company_1', siteId: 'site_mine', module: 'SITE_PHOTO', uploadedById: 'user_company_admin', secureUrl: 'x', cloudinaryPublicId: 'x' },
  { id: 'asset_foreign', companyId: 'company_2', siteId: 'site_other', module: 'SITE_PHOTO', uploadedById: 'user_company_admin', secureUrl: 'f', cloudinaryPublicId: 'f' },
  { id: 'asset_someone_else', companyId: 'company_1', siteId: 'site_1', module: 'SITE_PHOTO', uploadedById: 'user_other', secureUrl: 's', cloudinaryPublicId: 's' },
]

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

const photo = (overrides: Record<string, unknown> = {}) =>
  ({ siteId: 'site_1', mediaAssetId: 'asset_1', caption: 'Slab poured', gps: '13.08, 80.27', ...overrides }) as Parameters<typeof uploadMobileSitePhotoAction>[0]

let modules: unknown

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['TASKS', 'SITES']
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.auth.mockResolvedValue({ user: principal('COMPANY_ADMIN') })
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: [] })
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)
  mocks.prisma.mediaAsset.findFirst.mockImplementation(inMemoryDelegate(ASSETS).findFirst)
  mocks.prisma.sitePhoto.create.mockImplementation(async (args: { data: Row }) => ({ id: 'photo_1', ...args.data }))
})

describe('uploadMobileSitePhotoAction', () => {
  it('refuses a revoked principal before any read', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Account is inactive'))
    await expect(uploadMobileSitePhotoAction(photo())).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.mediaAsset.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
  })

  it.each(['CLIENT', 'ACCOUNTANT', 'PURCHASE_MANAGER', 'VENDOR', 'SUBCONTRACTOR'])('refuses live %s before any read', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(uploadMobileSitePhotoAction(photo())).rejects.toThrow(/sitePhotos\.upload/)
    expect(mocks.prisma.company.findUnique).not.toHaveBeenCalled()
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
  })

  it('refuses SUPER_ADMIN, which has no tenant context', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root', role: 'SUPER_ADMIN', email: 'root@x', name: 'Root' })
    await expect(uploadMobileSitePhotoAction(photo())).rejects.toThrow(/Tenant context required/)
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
  })

  it('refuses when the TASKS module is disabled', async () => {
    modules = ['SITES']
    await expect(uploadMobileSitePhotoAction(photo())).rejects.toThrow(/Module TASKS is not enabled/)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
  })

  it.each(['site_other', 'site_dead', 'missing'])('refuses site %s', async (siteId) => {
    await expect(uploadMobileSitePhotoAction(photo({ siteId }))).rejects.toThrow(/Site not found or access denied/)
    expect(mocks.prisma.mediaAsset.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
  })

  it('refuses a field engineer posting to a live site they are not assigned to', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    await expect(uploadMobileSitePhotoAction(photo({ siteId: 'site_1' }))).rejects.toThrow(/Site not found or access denied/)
    expect(mocks.prisma.companyMember.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user_site_engineer', companyId: 'company_1', isActive: true },
      select: { siteIds: true },
    })
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
  })

  it('lets a field engineer post to an assigned site with their own asset', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    await expect(uploadMobileSitePhotoAction(photo({ siteId: 'site_mine', mediaAssetId: 'asset_mine' }))).resolves.toEqual({ success: true, id: 'photo_1' })
  })

  it('lets a field engineer post to a site listed on their active membership', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: ['site_1'] })
    mocks.prisma.mediaAsset.findFirst.mockResolvedValue({ id: 'asset_x', secureUrl: 'https://res.cloudinary.com/demo/x.jpg', cloudinaryPublicId: 'x' })
    await expect(uploadMobileSitePhotoAction(photo({ siteId: 'site_1', mediaAssetId: 'asset_x' }))).resolves.toMatchObject({ success: true })
  })

  it.each([
    ['a missing asset', 'missing'],
    ["another tenant's asset", 'asset_foreign'],
    ['an asset of another site', 'asset_other_site'],
    ['a non-photo asset', 'asset_bill'],
    ["another user's asset", 'asset_someone_else'],
    ['no asset id', ''],
  ])('refuses %s', async (_label, mediaAssetId) => {
    await expect(uploadMobileSitePhotoAction(photo({ mediaAssetId }))).rejects.toThrow(/Uploaded photo not found or access denied/)
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
  })

  it('refuses a raw URL or public id in place of an uploaded asset', async () => {
    await expect(uploadMobileSitePhotoAction(photo({ mediaAssetId: undefined, imageUrl: 'https://evil.test/x.jpg' }))).rejects.toThrow(/Uploaded photo not found or access denied/)
    await expect(uploadMobileSitePhotoAction(photo({ mediaAssetId: 'https://evil.test/x.jpg' }))).rejects.toThrow(/Uploaded photo not found or access denied/)
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
  })

  it('stores the asset\'s own URL and public id, ignoring any client-sent URL', async () => {
    await uploadMobileSitePhotoAction(photo({ imageUrl: 'https://evil.test/x.jpg' }))
    expect(mocks.prisma.mediaAsset.findFirst).toHaveBeenCalledWith({
      where: { id: 'asset_1', companyId: 'company_1', siteId: 'site_1', module: 'SITE_PHOTO', uploadedById: 'user_company_admin' },
      select: { id: true, secureUrl: true, cloudinaryPublicId: true },
    })
    expect(mocks.prisma.sitePhoto.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company_1',
        siteId: 'site_1',
        secureUrl: 'https://res.cloudinary.com/demo/a1.jpg',
        cloudinaryPublicId: 'civil-tracker/acme/site_1/SITE_PHOTO/a1',
        caption: 'Slab poured',
        category: 'GPS:13.08, 80.27',
        uploadedById: 'user_company_admin',
      },
      select: { id: true },
    })
  })
})
