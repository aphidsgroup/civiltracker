import { Role } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/audit'
import { validateSitePhotoLocation } from '@/lib/site-photo-location'
import type { SessionUser } from '@/types'

// Server-side creation of GPS-tagged SITE_PHOTO evidence.
//
// The browser uploads the image through /api/upload, which records a
// MediaAsset owned by the uploader. Here we re-validate the device-reported
// location, then claim that MediaAsset inside a transaction: the stored URL and
// public id always come from the server-recorded asset, never from the client.
// On any failure the caller's still-unclaimed upload is discarded so no
// GPS-less image is left behind in Cloudinary.

// Expected, user-explainable refusals. Server actions return these as values
// (thrown Server Action errors are redacted in production).
export class SitePhotoEvidenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SitePhotoEvidenceError'
  }
}

export const SITE_PHOTO_TAGS = ['Civil', 'Material', 'Electrical', 'Issue', 'Quality', 'Safety'] as const

export type SitePhotoEvidenceInput = {
  siteId: unknown
  publicId: unknown
  location: unknown
  caption?: unknown
  category?: string | null
  taskId?: string | null
  replacesPhotoId?: unknown
}

function asId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' && value.length <= 300 ? value.trim() : null
}

async function resolveCompanyId(user: SessionUser): Promise<string> {
  if (user.companyId) return user.companyId
  const member = await prisma.companyMember.findFirst({
    where: { userId: user.id, isActive: true },
    select: { companyId: true },
  })
  if (!member) throw new SitePhotoEvidenceError('Unauthorized: no active company context')
  return member.companyId
}

async function destroyCloudinaryAsset(publicId: string) {
  try {
    const cloudinary = (await import('@/lib/cloudinary')).default
    await cloudinary.uploader.destroy(publicId)
  } catch (err) {
    console.error('[SitePhoto] Failed to delete Cloudinary asset', err)
  }
}

export async function discardUnclaimedSitePhotoUpload(userId: string, publicId: unknown) {
  const cloudinaryPublicId = asId(publicId)
  if (!cloudinaryPublicId) return
  try {
    const { count } = await prisma.mediaAsset.deleteMany({
      where: { cloudinaryPublicId, uploadedById: userId, module: 'SITE_PHOTO', sitePhoto: { is: null } },
    })
    if (count > 0) await destroyCloudinaryAsset(cloudinaryPublicId)
  } catch (err) {
    console.error('[SitePhoto] Failed to discard unclaimed upload', err)
  }
}

function isUniqueViolation(err: unknown) {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002'
}

async function claimSitePhotoEvidence(user: SessionUser, input: SitePhotoEvidenceInput) {
  const location = validateSitePhotoLocation(input.location)
  if (!location.ok) throw new SitePhotoEvidenceError(location.message)

  const siteId = asId(input.siteId)
  const publicId = asId(input.publicId)
  if (!siteId) throw new SitePhotoEvidenceError('Site is required')
  if (!publicId) throw new SitePhotoEvidenceError('Upload not found. Please retake the photo.')
  const replacesPhotoId = input.replacesPhotoId == null ? null : asId(input.replacesPhotoId)
  if (input.replacesPhotoId != null && !replacesPhotoId) throw new SitePhotoEvidenceError('Photo to retake not found')

  const companyId = await resolveCompanyId(user)
  const site = await prisma.site.findFirst({ where: { id: siteId, companyId, deletedAt: null }, select: { id: true } })
  if (!site) throw new SitePhotoEvidenceError('Site not found or access denied')

  if (input.taskId) {
    const task = await prisma.projectChecklistTask.findFirst({
      where: { id: input.taskId, category: { stage: { checklist: { siteId, companyId } } } },
      select: { id: true },
    })
    if (!task) throw new SitePhotoEvidenceError('Checklist task not found for this site')
  }

  const caption = typeof input.caption === 'string' ? input.caption.trim().slice(0, 200) : ''

  try {
    return await prisma.$transaction(async (tx) => {
      const asset = await tx.mediaAsset.findFirst({
        where: {
          cloudinaryPublicId: publicId,
          companyId,
          siteId,
          module: 'SITE_PHOTO',
          uploadedById: user.id,
          sitePhoto: { is: null },
        },
      })
      if (!asset) throw new SitePhotoEvidenceError('Upload not found or already used. Please retake the photo.')

      let replaced: { id: string; cloudinaryPublicId: string; taskId: string | null; dprId: string | null; caption: string | null } | null = null
      if (replacesPhotoId) {
        const old = await tx.sitePhoto.findFirst({ where: { id: replacesPhotoId, companyId, siteId } })
        if (!old) throw new SitePhotoEvidenceError('Photo to retake not found')
        if (old.uploadedById !== user.id && user.role !== Role.COMPANY_ADMIN) {
          throw new SitePhotoEvidenceError('You are not allowed to retake this photo')
        }
        await tx.sitePhoto.delete({ where: { id: old.id } })
        await tx.mediaAsset.deleteMany({ where: { cloudinaryPublicId: old.cloudinaryPublicId, companyId } })
        replaced = old
      }

      const photo = await tx.sitePhoto.create({
        data: {
          companyId,
          siteId,
          taskId: input.taskId ?? replaced?.taskId ?? null,
          dprId: replaced?.dprId ?? null,
          mediaAssetId: asset.id,
          cloudinaryPublicId: asset.cloudinaryPublicId,
          secureUrl: asset.secureUrl,
          caption: caption || replaced?.caption || 'Site Operations Photo',
          category: input.category ?? null,
          uploadedById: user.id,
          locationStatus: 'DEVICE_REPORTED',
          latitude: location.value.latitude,
          longitude: location.value.longitude,
          locationAccuracyMeters: location.value.accuracyMeters,
          locationCapturedAt: location.value.capturedAt,
        },
      })
      return { photo, replaced }
    })
  } catch (err) {
    if (isUniqueViolation(err)) throw new SitePhotoEvidenceError('This upload has already been used for another photo')
    throw err
  }
}

export async function createSitePhotoEvidence(user: SessionUser, input: SitePhotoEvidenceInput) {
  let result: Awaited<ReturnType<typeof claimSitePhotoEvidence>>
  try {
    result = await claimSitePhotoEvidence(user, input)
  } catch (err) {
    await discardUnclaimedSitePhotoUpload(user.id, input.publicId)
    throw err
  }

  const { photo, replaced } = result
  await logActivity({
    userId: user.id,
    companyId: photo.companyId,
    action: replaced ? 'RETAKE' : 'CREATE',
    module: 'SITE_PHOTO',
    recordId: photo.id,
    description: `${user.name ?? user.email} ${replaced ? 'retook' : 'uploaded'} GPS-tagged site photo "${photo.caption}"`,
    before: replaced ? { photoId: replaced.id, cloudinaryPublicId: replaced.cloudinaryPublicId } : undefined,
    // Record that a device location was captured, not where.
    after: {
      siteId: photo.siteId,
      taskId: photo.taskId,
      mediaAssetId: photo.mediaAssetId,
      locationStatus: photo.locationStatus,
      locationAccuracyMeters: photo.locationAccuracyMeters,
    },
  })

  if (replaced) await destroyCloudinaryAsset(replaced.cloudinaryPublicId)

  return photo
}
