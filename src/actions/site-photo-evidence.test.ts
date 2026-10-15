import { beforeEach, describe, expect, it, vi } from 'vitest'

const NOW = new Date('2026-10-15T06:00:00.000Z').getTime()

const mocks = vi.hoisted(() => {
  const prisma = {
    companyMember: { findFirst: vi.fn() },
    site: { findFirst: vi.fn(), findUnique: vi.fn() },
    projectChecklistTask: { findFirst: vi.fn() },
    mediaAsset: { findFirst: vi.fn(), deleteMany: vi.fn() },
    sitePhoto: { create: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(),
  }
  return {
    prisma,
    user: { current: null as null | { id: string; email: string; name: string; role: string; companyId?: string } },
    destroy: vi.fn(),
    logActivity: vi.fn(),
    revalidatePath: vi.fn(),
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('@/lib/auth/require-user', () => ({
  requireUser: async () => {
    if (!mocks.user.current) throw new Error('UNAUTHORIZED: Authentication required')
    return mocks.user.current
  },
}))
vi.mock('@/lib/auth', () => ({ auth: async () => (mocks.user.current ? { user: mocks.user.current } : null) }))
vi.mock('@/lib/cloudinary', () => ({ default: { uploader: { destroy: mocks.destroy } } }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { uploadMobileSitePhotoAction } from './mobile-photo'
import { uploadChecklistPhotoAction } from './checklists'

const engineer = { id: 'user-eng', email: 'eng@a.test', name: 'Eng', role: 'SITE_ENGINEER', companyId: 'company-a' }

const asset = {
  id: 'asset-1',
  companyId: 'company-a',
  siteId: 'site-a',
  module: 'SITE_PHOTO',
  cloudinaryPublicId: 'civil-tracker/a/site-a/SITE_PHOTO/2026/10/photo_abc',
  secureUrl: 'https://res.cloudinary.com/demo/image/upload/v1/civil-tracker/a/site-a/SITE_PHOTO/2026/10/photo_abc.jpg',
  uploadedById: 'user-eng',
}

async function expectDenied(pending: Promise<unknown>, message: RegExp) {
  const result = (await pending) as { success: boolean; error?: string }
  expect(result.success).toBe(false)
  expect(result.error).toMatch(message)
}

function freshLocation(overrides: Record<string, unknown> = {}) {
  return { latitude: 13.0827123, longitude: 80.2707456, accuracyMeters: 7, capturedAt: NOW - 3_000, ...overrides }
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    siteId: 'site-a',
    publicId: asset.cloudinaryPublicId,
    caption: 'Slab casting',
    tag: 'Civil',
    location: freshLocation(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  for (const group of Object.values(mocks.prisma)) {
    if (typeof group === 'function') group.mockReset()
    else for (const fn of Object.values(group)) fn.mockReset()
  }
  mocks.destroy.mockReset().mockResolvedValue({ result: 'ok' })
  mocks.logActivity.mockReset()
  mocks.revalidatePath.mockReset()
  mocks.user.current = engineer

  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.prisma) => unknown) => fn(mocks.prisma))
  mocks.prisma.site.findFirst.mockImplementation(async ({ where }: { where: { id: string; companyId: string } }) =>
    where.id === 'site-a' && where.companyId === 'company-a' ? { id: 'site-a', companyId: 'company-a' } : null,
  )
  mocks.prisma.mediaAsset.findFirst.mockResolvedValue(asset)
  mocks.prisma.mediaAsset.deleteMany.mockResolvedValue({ count: 1 })
  mocks.prisma.sitePhoto.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'photo-new', ...data }))
})

describe('uploadMobileSitePhotoAction', () => {
  it('accepts a legitimate fresh coordinate and stores structured telemetry from the verified upload', async () => {
    const result = await uploadMobileSitePhotoAction({
      ...baseInput(),
      // A client-supplied URL must never become trusted.
      imageUrl: 'https://evil.example/fake.jpg',
    } as Parameters<typeof uploadMobileSitePhotoAction>[0])

    expect(result).toMatchObject({ success: true, photo: { id: 'photo-new', imageUrl: asset.secureUrl } })

    const claimWhere = mocks.prisma.mediaAsset.findFirst.mock.calls[0][0].where
    expect(claimWhere).toMatchObject({
      cloudinaryPublicId: asset.cloudinaryPublicId,
      companyId: 'company-a',
      siteId: 'site-a',
      module: 'SITE_PHOTO',
      uploadedById: 'user-eng',
      sitePhoto: { is: null },
    })

    const data = mocks.prisma.sitePhoto.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      companyId: 'company-a',
      siteId: 'site-a',
      mediaAssetId: 'asset-1',
      cloudinaryPublicId: asset.cloudinaryPublicId,
      secureUrl: asset.secureUrl,
      category: 'Civil',
      uploadedById: 'user-eng',
      locationStatus: 'DEVICE_REPORTED',
      latitude: 13.0827123,
      longitude: 80.2707456,
      locationAccuracyMeters: 7,
      locationCapturedAt: new Date(NOW - 3_000),
    })
    expect(String(data.category)).not.toMatch(/gps/i)
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.destroy).not.toHaveBeenCalled()

    // Audit trail records that a location was captured, not where.
    const audit = mocks.logActivity.mock.calls[0][0]
    expect(audit).toMatchObject({ action: 'CREATE', module: 'SITE_PHOTO', recordId: 'photo-new' })
    expect(JSON.stringify(audit)).not.toContain('13.0827')
    expect(JSON.stringify(audit)).not.toContain('80.2707')
  })

  it('denies missing location and discards the unclaimed upload', async () => {
    await expectDenied(uploadMobileSitePhotoAction(baseInput({ location: undefined }) as never), /location is required/i)
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
    expect(mocks.prisma.mediaAsset.deleteMany).toHaveBeenCalledWith({
      where: {
        cloudinaryPublicId: asset.cloudinaryPublicId,
        uploadedById: 'user-eng',
        module: 'SITE_PHOTO',
        sitePhoto: { is: null },
      },
    })
    expect(mocks.destroy).toHaveBeenCalledWith(asset.cloudinaryPublicId)
  })

  it('denies the legacy display-string GPS and the fabricated fallback coordinate', async () => {
    await expectDenied(uploadMobileSitePhotoAction(baseInput({ location: undefined, gps: '28.5355° N, 77.3910° E' }) as never), /location/i)
    await expectDenied(uploadMobileSitePhotoAction(baseInput({ location: freshLocation({ latitude: 28.5355, longitude: 77.391 }) }) as never), /could not be verified/i)
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
  })

  it.each([
    ['out-of-bounds latitude', { latitude: 123.4 }, /out of range/i],
    ['NaN longitude', { longitude: Number.NaN }, /invalid/i],
    ['string coordinates', { latitude: '13.08' }, /invalid/i],
    ['poor accuracy', { accuracyMeters: 1500 }, /too imprecise/i],
    ['stale fix', { capturedAt: NOW - 60 * 60_000 }, /out of date/i],
  ])('denies %s', async (_label, overrides, message) => {
    await expectDenied(uploadMobileSitePhotoAction(baseInput({ location: freshLocation(overrides) }) as never), message)
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
  })

  it('denies an upload that is not a verified, unclaimed SITE_PHOTO asset of this user/site', async () => {
    mocks.prisma.mediaAsset.findFirst.mockResolvedValue(null)
    await expectDenied(uploadMobileSitePhotoAction(baseInput() as never), /upload not found/i)
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
  })

  it('denies a site belonging to another company', async () => {
    await expectDenied(uploadMobileSitePhotoAction(baseInput({ siteId: 'site-b' }) as never), /site/i)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('treats a concurrent duplicate claim as already used', async () => {
    mocks.prisma.sitePhoto.create.mockRejectedValue(Object.assign(new Error('Unique constraint'), { code: 'P2002' }))
    await expectDenied(uploadMobileSitePhotoAction(baseInput() as never), /already/i)
  })

  describe('retake', () => {
    const oldPhoto = {
      id: 'photo-old',
      companyId: 'company-a',
      siteId: 'site-a',
      uploadedById: 'user-eng',
      mediaAssetId: 'asset-old',
      cloudinaryPublicId: 'civil-tracker/a/site-a/SITE_PHOTO/2026/09/old',
      caption: 'Old',
      category: 'GPS:28.5355° N, 77.3910° E',
    }

    beforeEach(() => {
      mocks.prisma.sitePhoto.findFirst.mockResolvedValue(oldPhoto)
    })

    it('requires new telemetry — the old photo is untouched without it', async () => {
      await expectDenied(uploadMobileSitePhotoAction(baseInput({ location: undefined, replacesPhotoId: 'photo-old' }) as never), /location is required/i)
      expect(mocks.prisma.sitePhoto.delete).not.toHaveBeenCalled()
      expect(mocks.destroy).not.toHaveBeenCalledWith(oldPhoto.cloudinaryPublicId)
    })

    it('replaces the old photo atomically with the freshly located one', async () => {
      await uploadMobileSitePhotoAction(baseInput({ replacesPhotoId: 'photo-old' }) as never)

      expect(mocks.prisma.sitePhoto.findFirst.mock.calls[0][0].where).toMatchObject({
        id: 'photo-old',
        companyId: 'company-a',
        siteId: 'site-a',
      })
      expect(mocks.prisma.sitePhoto.delete).toHaveBeenCalledWith({ where: { id: 'photo-old' } })
      expect(mocks.prisma.sitePhoto.create.mock.calls[0][0].data).toMatchObject({
        locationStatus: 'DEVICE_REPORTED',
        latitude: 13.0827123,
        caption: 'Slab casting',
      })
      // Old category was a legacy GPS string and must not be carried forward.
      expect(mocks.prisma.sitePhoto.create.mock.calls[0][0].data.category).toBe('Civil')
      expect(mocks.destroy).toHaveBeenCalledWith(oldPhoto.cloudinaryPublicId)
      expect(mocks.logActivity.mock.calls[0][0]).toMatchObject({ action: 'RETAKE' })
    })

    it("cannot replace another user's or another company's photo", async () => {
      mocks.prisma.sitePhoto.findFirst.mockResolvedValue({ ...oldPhoto, uploadedById: 'someone-else' })
      await expectDenied(uploadMobileSitePhotoAction(baseInput({ replacesPhotoId: 'photo-old' }) as never), /not allowed/i)

      mocks.prisma.sitePhoto.findFirst.mockResolvedValue(null)
      await expectDenied(uploadMobileSitePhotoAction(baseInput({ replacesPhotoId: 'photo-old' }) as never), /not found/i)

      expect(mocks.prisma.sitePhoto.delete).not.toHaveBeenCalled()
      expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
    })
  })
})

describe('uploadChecklistPhotoAction', () => {
  beforeEach(() => {
    mocks.prisma.projectChecklistTask.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'task-a' ? { id: 'task-a', name: 'Column casting' } : null,
    )
  })

  it('accepts fresh telemetry and links the photo to the task', async () => {
    await uploadChecklistPhotoAction({ taskId: 'task-a', siteId: 'site-a', publicId: asset.cloudinaryPublicId, location: freshLocation() })

    const taskWhere = mocks.prisma.projectChecklistTask.findFirst.mock.calls[0][0].where
    expect(taskWhere).toMatchObject({ id: 'task-a', category: { stage: { checklist: { siteId: 'site-a', companyId: 'company-a' } } } })
    expect(mocks.prisma.sitePhoto.create.mock.calls[0][0].data).toMatchObject({
      taskId: 'task-a',
      secureUrl: asset.secureUrl,
      locationStatus: 'DEVICE_REPORTED',
      longitude: 80.2707456,
    })
  })

  it('denies missing location and discards the upload', async () => {
    await expectDenied(uploadChecklistPhotoAction({ taskId: 'task-a', siteId: 'site-a', publicId: asset.cloudinaryPublicId, location: null }), /location is required/i)
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
    expect(mocks.destroy).toHaveBeenCalledWith(asset.cloudinaryPublicId)
  })

  it('denies a task outside the site/company', async () => {
    await expectDenied(uploadChecklistPhotoAction({ taskId: 'task-other', siteId: 'site-a', publicId: asset.cloudinaryPublicId, location: freshLocation() }), /task not found/i)
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
  })
})

describe('deleteSitePhotoAction (legacy labels)', () => {
  it('does not require typing a legacy GPS string to confirm deletion', async () => {
    const { deleteSitePhotoAction } = await import('./site-photos')
    const legacy = {
      id: 'photo-legacy',
      companyId: 'company-a',
      siteId: 'site-a',
      taskId: null,
      caption: null,
      category: 'GPS:28.5355° N, 77.3910° E',
      cloudinaryPublicId: 'field_gps_1',
      secureUrl: 'https://x',
      task: null,
    }
    ;(mocks.prisma.sitePhoto as Record<string, ReturnType<typeof vi.fn>>).findUnique = vi.fn().mockResolvedValue(legacy)
    mocks.prisma.sitePhoto.delete.mockResolvedValue(legacy)
    await expect(deleteSitePhotoAction('photo-legacy', 'photo-legacy')).resolves.toEqual({ success: true })
  })
})
