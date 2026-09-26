import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'

/**
 * Regression for `deleteSitePhotoAction` letting any company member delete any photo.
 *
 * The action looked the photo up by bare id, then allowed any member of the photo's
 * company (a SUPERVISOR, an ACCOUNTANT, a CLIENT) despite its "uploader or admin"
 * comment. It ignored whether the site was deleted, destroyed the Cloudinary asset
 * *before* the database rows (a failed delete left a row pointing at a destroyed image),
 * deleted MediaAsset rows by public id across every tenant and deleted the photo by bare
 * id.
 *
 * Now only the uploader or a holder of `sites.update` (Company Admin / Project Manager)
 * may delete, the photo must belong to a live site of exactly the live company, the
 * photo and media rows are deleted company-scoped in one transaction, and the external
 * asset is destroyed only after that commits and only when no photo still references it.
 */
const mocks = vi.hoisted(() => {
  const tx = {
    sitePhoto: { deleteMany: vi.fn(), count: vi.fn() },
    mediaAsset: { deleteMany: vi.fn() },
  }
  return {
    requireUser: vi.fn(),
    revalidatePath: vi.fn(),
    logActivity: vi.fn(),
    destroy: vi.fn(),
    order: [] as string[],
    tx,
    prisma: {
      company: { findUnique: vi.fn() },
      companyMember: { findFirst: vi.fn() },
      sitePhoto: { findFirst: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
      mediaAsset: { deleteMany: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('@/lib/cloudinary', () => ({ default: { uploader: { destroy: mocks.destroy } } }))

const { deleteSitePhotoAction } = await import('@/actions/site-photos')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', deletedAt: null, assignedEngineerId: null, engineerId: null },
  { id: 'site_theirs', companyId: 'company_1', deletedAt: null, assignedEngineerId: 'user_someone_else', engineerId: null },
  { id: 'site_dead', companyId: 'company_1', deletedAt: new Date('2026-01-01'), assignedEngineerId: null, engineerId: null },
  { id: 'site_other', companyId: 'company_2', deletedAt: null, assignedEngineerId: null, engineerId: null },
]

const PHOTOS: Row[] = [
  { id: 'photo_1', companyId: 'company_1', siteId: 'site_1', caption: 'Slab', category: null, taskId: null, cloudinaryPublicId: 'pub_1', secureUrl: 'https://x/1', uploadedById: 'user_supervisor', task: null },
  { id: 'photo_dead', companyId: 'company_1', siteId: 'site_dead', caption: 'Old', category: null, taskId: null, cloudinaryPublicId: 'pub_dead', secureUrl: 'https://x/2', uploadedById: 'user_supervisor', task: null },
  { id: 'photo_theirs', companyId: 'company_1', siteId: 'site_theirs', caption: 'Beam', category: null, taskId: null, cloudinaryPublicId: 'pub_theirs', secureUrl: 'https://x/4', uploadedById: 'user_supervisor', task: null },
  { id: 'photo_accountant', companyId: 'company_1', siteId: 'site_1', caption: 'Receipt', category: null, taskId: null, cloudinaryPublicId: 'pub_acct', secureUrl: 'https://x/5', uploadedById: 'user_accountant', task: null },
  { id: 'photo_other', companyId: 'company_2', siteId: 'site_other', caption: 'Foreign', category: null, taskId: null, cloudinaryPublicId: 'pub_other', secureUrl: 'https://x/3', uploadedById: 'user_x', task: null },
]

const siteRelation: RelationResolver = (row, key) => (key === 'site' ? SITES.find((site) => site.id === row.siteId) ?? null : undefined)

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

let modules: unknown

beforeEach(() => {
  vi.clearAllMocks()
  mocks.order.length = 0
  modules = ['SITES', 'TASKS']
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  // Field roles are assigned to site_1 by active membership, never to site_theirs.
  mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: ['site_1'] })
  const photos = inMemoryDelegate(PHOTOS, siteRelation)
  mocks.prisma.sitePhoto.findFirst.mockImplementation(photos.findFirst)
  mocks.tx.sitePhoto.deleteMany.mockImplementation(async (args: { where: Row }) => {
    mocks.order.push('db:sitePhoto')
    return photos.updateMany(args)
  })
  mocks.tx.sitePhoto.count.mockResolvedValue(0)
  mocks.tx.mediaAsset.deleteMany.mockImplementation(async () => {
    mocks.order.push('db:mediaAsset')
    return { count: 1 }
  })
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => {
    const result = await fn(mocks.tx)
    mocks.order.push('commit')
    return result
  })
  mocks.destroy.mockImplementation(async () => {
    mocks.order.push('cloud:destroy')
  })
})

function deleted() {
  return mocks.tx.sitePhoto.deleteMany.mock.calls.length + mocks.prisma.sitePhoto.delete.mock.calls.length + mocks.prisma.sitePhoto.deleteMany.mock.calls.length
}

describe('deleteSitePhotoAction authorization', () => {
  it('refuses a revoked principal before reading the photo', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Account is inactive'))
    await expect(deleteSitePhotoAction('photo_1', 'Slab')).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.prisma.sitePhoto.findFirst).not.toHaveBeenCalled()
    expect(mocks.destroy).not.toHaveBeenCalled()
  })

  it('refuses a SUPER_ADMIN, which has no tenant context', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root', email: 'r@x', name: 'Root', role: 'SUPER_ADMIN' })
    await expect(deleteSitePhotoAction('photo_1', 'Slab')).rejects.toThrow(/FORBIDDEN/)
    expect(deleted()).toBe(0)
  })

  it.each([
    ['another tenant\'s photo', 'photo_other', 'Foreign'],
    ['a photo on a deleted site', 'photo_dead', 'Old'],
    ['a missing photo', 'nope', 'x'],
  ])('refuses %s without touching the database or cloud', async (_name, photoId, label) => {
    await expect(deleteSitePhotoAction(photoId, label)).rejects.toThrow(/not found or access denied/)
    expect(deleted()).toBe(0)
    expect(mocks.destroy).not.toHaveBeenCalled()
  })

  it('reads the photo only through the live company and a live site', async () => {
    await deleteSitePhotoAction('photo_1', 'Slab')
    expect(mocks.prisma.sitePhoto.findFirst.mock.calls[0][0].where).toEqual({ id: 'photo_1', companyId: 'company_1', site: { companyId: 'company_1', deletedAt: null } })
  })

  it.each(['SITE_ENGINEER', 'ACCOUNTANT', 'PURCHASE_MANAGER', 'CLIENT', 'VENDOR', 'SUBCONTRACTOR'])(
    'refuses a %s who did not upload the photo',
    async (role) => {
      mocks.requireUser.mockResolvedValue(principal(role))
      await expect(deleteSitePhotoAction('photo_1', 'Slab')).rejects.toThrow(/FORBIDDEN/)
      expect(deleted()).toBe(0)
      expect(mocks.destroy).not.toHaveBeenCalled()
      expect(mocks.logActivity).not.toHaveBeenCalled()
    },
  )

  it('allows the uploader', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))
    await expect(deleteSitePhotoAction('photo_1', 'Slab')).resolves.toEqual({ success: true })
  })

  it.each(['COMPANY_ADMIN', 'PROJECT_MANAGER'])('allows a %s who did not upload the photo', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(deleteSitePhotoAction('photo_1', 'Slab')).resolves.toEqual({ success: true })
  })

  it.each(['SUPERVISOR', 'COMPANY_ADMIN'])('refuses a %s while the TASKS module is disabled, before reading the photo', async (role) => {
    modules = ['SITES']
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(deleteSitePhotoAction('photo_1', 'Slab')).rejects.toThrow(/Module TASKS is not enabled/)
    expect(mocks.prisma.sitePhoto.findFirst).not.toHaveBeenCalled()
    expect(deleted()).toBe(0)
    expect(mocks.destroy).not.toHaveBeenCalled()
  })

  it('refuses an uploader whose live role no longer holds a photo grant, before reading the photo', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))
    await expect(deleteSitePhotoAction('photo_accountant', 'Receipt')).rejects.toThrow(/FORBIDDEN/)
    expect(mocks.prisma.sitePhoto.findFirst).not.toHaveBeenCalled()
    expect(deleted()).toBe(0)
  })

  it('refuses the uploader on a site it is no longer assigned to', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))
    await expect(deleteSitePhotoAction('photo_theirs', 'Beam')).rejects.toThrow(/not found or access denied/)
    expect(deleted()).toBe(0)
    expect(mocks.destroy).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })

  it('refuses the uploader once its membership is inactive', async () => {
    mocks.prisma.companyMember.findFirst.mockResolvedValue(null)
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))
    await expect(deleteSitePhotoAction('photo_1', 'Slab')).rejects.toThrow(/not found or access denied/)
    expect(deleted()).toBe(0)
  })

  it('binds the uploader read and guarded delete to its assigned-site scope', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))
    await deleteSitePhotoAction('photo_1', 'Slab')
    const scope = {
      companyId: 'company_1',
      deletedAt: null,
      OR: [{ assignedEngineerId: 'user_supervisor' }, { engineerId: 'user_supervisor' }, { id: { in: ['site_1'] } }],
    }
    expect(mocks.prisma.sitePhoto.findFirst.mock.calls[0][0].where).toEqual({ id: 'photo_1', companyId: 'company_1', site: scope })
    expect(mocks.tx.sitePhoto.deleteMany).toHaveBeenCalledWith({ where: { id: 'photo_1', companyId: 'company_1', site: scope } })
  })

  it.each(['COMPANY_ADMIN', 'PROJECT_MANAGER'])('lets a %s delete on any live company site', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(deleteSitePhotoAction('photo_theirs', 'Beam')).resolves.toEqual({ success: true })
    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
  })

  it('refuses a mismatched confirmation before any delete', async () => {
    await expect(deleteSitePhotoAction('photo_1', 'wrong')).rejects.toThrow(/confirmation/)
    expect(deleted()).toBe(0)
    expect(mocks.destroy).not.toHaveBeenCalled()
  })
})

describe('deleteSitePhotoAction database and cloud ordering', () => {
  it('deletes company-scoped rows in one transaction and destroys the asset only after commit', async () => {
    await deleteSitePhotoAction('photo_1', 'Slab')
    expect(mocks.tx.sitePhoto.deleteMany).toHaveBeenCalledWith({ where: { id: 'photo_1', companyId: 'company_1', site: { companyId: 'company_1', deletedAt: null } } })
    expect(mocks.tx.mediaAsset.deleteMany).toHaveBeenCalledWith({ where: { cloudinaryPublicId: 'pub_1', companyId: 'company_1' } })
    expect(mocks.order).toEqual(['db:sitePhoto', 'db:mediaAsset', 'commit', 'cloud:destroy'])
    expect(mocks.destroy).toHaveBeenCalledWith('pub_1')
    expect(mocks.prisma.sitePhoto.delete).not.toHaveBeenCalled()
    expect(mocks.prisma.mediaAsset.deleteMany).not.toHaveBeenCalled()
  })

  it('does not destroy the cloud asset when the database delete fails', async () => {
    mocks.tx.mediaAsset.deleteMany.mockRejectedValue(new Error('db down'))
    await expect(deleteSitePhotoAction('photo_1', 'Slab')).rejects.toThrow('db down')
    expect(mocks.destroy).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })

  it('fails without cloud deletion when the guarded delete matches no row (raced away)', async () => {
    mocks.tx.sitePhoto.deleteMany.mockResolvedValue({ count: 0 })
    await expect(deleteSitePhotoAction('photo_1', 'Slab')).rejects.toThrow(/not found or access denied/)
    expect(mocks.tx.mediaAsset.deleteMany).not.toHaveBeenCalled()
    expect(mocks.destroy).not.toHaveBeenCalled()
  })

  it('keeps the shared asset when another photo still references it', async () => {
    mocks.tx.sitePhoto.count.mockResolvedValue(1)
    await deleteSitePhotoAction('photo_1', 'Slab')
    expect(mocks.tx.sitePhoto.count).toHaveBeenCalledWith({ where: { cloudinaryPublicId: 'pub_1' } })
    expect(mocks.tx.mediaAsset.deleteMany).not.toHaveBeenCalled()
    expect(mocks.destroy).not.toHaveBeenCalled()
  })

  it('still succeeds when the external delete fails after the database commit', async () => {
    mocks.destroy.mockRejectedValue(new Error('cloud down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(deleteSitePhotoAction('photo_1', 'Slab')).resolves.toEqual({ success: true })
  })
})
