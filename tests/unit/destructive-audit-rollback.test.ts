import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'

/**
 * Regression for destructive operations committing unaudited.
 *
 * Vendor deactivation and site photo deletion wrote their mutation, then called the
 * best-effort `logActivity`, which swallowed any failure: a failed audit write left the
 * vendor deactivated or the photo deleted with no audit trail.
 *
 * Now the audit record is written with `tx.auditLog.create` on the same transaction as
 * the mutation. An audit failure throws out of the transaction, so the mutation rolls
 * back, the error reaches the caller unchanged, and no post-commit side effect (the
 * Cloudinary destroy, cache revalidation) runs.
 *
 * The transaction mock stages writes and commits them only when the callback resolves,
 * as the database would. `@/lib/audit-data`, `@/lib/permissions` and
 * `@/lib/auth/site-mutation` are real.
 */
const mocks = vi.hoisted(() => {
  const tx = {
    vendor: { findFirst: vi.fn(), updateMany: vi.fn() },
    sitePhoto: { deleteMany: vi.fn(), count: vi.fn() },
    billAttachment: { count: vi.fn() },
    mediaAsset: { updateMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    tx,
    staged: [] as Array<[string, unknown]>,
    committed: [] as Array<[string, unknown]>,
    requireUser: vi.fn(),
    revalidatePath: vi.fn(),
    logActivity: vi.fn(),
    destroy: vi.fn(),
    prisma: {
      company: { findUnique: vi.fn() },
      companyMember: { findFirst: vi.fn() },
      site: { findFirst: vi.fn() },
      vendor: { findFirst: vi.fn(), updateMany: vi.fn() },
      sitePhoto: { findFirst: vi.fn(), deleteMany: vi.fn() },
      mediaAsset: { deleteMany: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('@/lib/cloudinary', () => ({ default: { uploader: { destroy: mocks.destroy } } }))

const { deactivateVendorAction } = await import('@/actions/vendors')
const { deleteSitePhotoAction } = await import('@/actions/site-photos')

const SITES: Row[] = [{ id: 'site_1', companyId: 'company_1', deletedAt: null, assignedEngineerId: null, engineerId: null }]
const VENDORS: Row[] = [
  { id: 'vendor_1', companyId: 'company_1', siteId: null, name: 'Bricks Co', category: 'Masonry', amountPayable: 500, isActive: true },
]
const PHOTOS: Row[] = [
  { id: 'photo_1', companyId: 'company_1', siteId: 'site_1', caption: 'Slab', category: null, taskId: null, cloudinaryPublicId: 'pub_1', secureUrl: 'https://x/1', uploadedById: 'user_x', task: null },
]

const siteRelation: RelationResolver = (row, key) => (key === 'site' ? SITES.find((site) => site.id === row.siteId) ?? null : undefined)

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

function stage(name: string, result: (args: { where?: Row; data?: Row }) => unknown) {
  return async (args: { where?: Row; data?: Row }) => {
    mocks.staged.push([name, args.data ?? args.where])
    return result(args)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.staged.length = 0
  mocks.committed.length = 0

  mocks.requireUser.mockResolvedValue({ id: 'user_admin', name: 'Admin', email: 'admin@acme.test', role: 'COMPANY_ADMIN', companyId: 'company_1' })
  mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: null, status: 'ACTIVE' })
  mocks.prisma.companyMember.findFirst.mockResolvedValue(null)
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)

  const vendors = inMemoryDelegate(VENDORS, siteRelation)
  mocks.tx.vendor.findFirst.mockImplementation(vendors.findFirst)
  mocks.tx.vendor.updateMany.mockImplementation(stage('vendor.updateMany', () => ({ count: 1 })))

  mocks.prisma.sitePhoto.findFirst.mockImplementation(inMemoryDelegate(PHOTOS, siteRelation).findFirst)
  mocks.tx.sitePhoto.deleteMany.mockImplementation(stage('sitePhoto.deleteMany', () => ({ count: 1 })))
  mocks.tx.sitePhoto.count.mockResolvedValue(0)
  mocks.tx.billAttachment.count.mockResolvedValue(0)
  mocks.tx.mediaAsset.updateMany.mockImplementation(stage('mediaAsset.updateMany', () => ({ count: 1 })))
  mocks.tx.mediaAsset.deleteMany.mockImplementation(stage('mediaAsset.deleteMany', () => ({ count: 1 })))
  mocks.tx.mediaAsset.count.mockResolvedValue(0)

  mocks.tx.auditLog.create.mockImplementation(stage('auditLog.create', () => ({ id: 'audit_1' })))

  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => {
    mocks.staged.length = 0
    const result = await fn(mocks.tx)
    mocks.committed.push(...mocks.staged)
    return result
  })
})

function directWrites() {
  const { prisma } = mocks
  return [prisma.vendor.updateMany, prisma.sitePhoto.deleteMany, prisma.mediaAsset.deleteMany, prisma.auditLog.create, mocks.logActivity]
    .reduce((sum, fn) => sum + fn.mock.calls.length, 0)
}

describe('deactivateVendorAction: mandatory audit', () => {
  it('commits the deactivation together with its audit record', async () => {
    await deactivateVendorAction(form({ id: 'vendor_1', dangerConfirmText: 'Bricks Co' }))
    expect(mocks.committed.map(([name]) => name)).toEqual(['vendor.updateMany', 'auditLog.create'])
    expect(mocks.committed[1][1]).toMatchObject({ userId: 'user_admin', companyId: 'company_1', action: 'UPDATE', module: 'VENDOR', recordId: 'vendor_1' })
    expect(directWrites()).toBe(0)
  })

  it('a failed audit write rolls the deactivation back and surfaces the error', async () => {
    const auditError = new Error('auditLog insert failed')
    mocks.tx.auditLog.create.mockRejectedValueOnce(auditError)

    await expect(deactivateVendorAction(form({ id: 'vendor_1', dangerConfirmText: 'Bricks Co' }))).rejects.toBe(auditError)

    expect(mocks.tx.vendor.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.committed).toEqual([])
    expect(directWrites()).toBe(0)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe('deleteSitePhotoAction: mandatory audit', () => {
  it('commits the delete together with its audit record, then destroys the asset', async () => {
    await expect(deleteSitePhotoAction('photo_1', 'Slab')).resolves.toEqual({ success: true })
    expect(mocks.committed.map(([name]) => name)).toEqual(['sitePhoto.deleteMany', 'auditLog.create', 'mediaAsset.updateMany', 'mediaAsset.deleteMany'])
    expect(mocks.committed[1][1]).toMatchObject({ userId: 'user_admin', companyId: 'company_1', action: 'DELETE', module: 'SITE_PHOTO', recordId: 'photo_1' })
    expect(mocks.destroy).toHaveBeenCalledWith('pub_1')
    expect(directWrites()).toBe(0)
  })

  it('a failed audit write rolls the delete back, keeps the asset and surfaces the error', async () => {
    const auditError = new Error('auditLog insert failed')
    mocks.tx.auditLog.create.mockRejectedValueOnce(auditError)

    await expect(deleteSitePhotoAction('photo_1', 'Slab')).rejects.toBe(auditError)

    expect(mocks.tx.sitePhoto.deleteMany).toHaveBeenCalledTimes(1)
    expect(mocks.tx.mediaAsset.updateMany).not.toHaveBeenCalled()
    expect(mocks.tx.mediaAsset.deleteMany).not.toHaveBeenCalled()
    expect(mocks.committed).toEqual([])
    expect(mocks.destroy).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    expect(directWrites()).toBe(0)
  })
})
