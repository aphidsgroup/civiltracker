'use server'

import { requireAssignedSiteMutation } from '@/lib/auth/site-mutation'
import { prisma } from '@/lib/prisma'
import { UPLOAD_POLICIES } from '@/lib/uploads/upload-policy'
import { revalidatePath } from 'next/cache'

const MEDIA_NOT_FOUND = 'FORBIDDEN: Uploaded photo not found or access denied'

function boundedText(raw: unknown, max: number): string {
  return typeof raw === 'string' ? raw.trim().slice(0, max) : ''
}

/*
 * Attaches a photo uploaded through `/api/upload` to a site. The live principal must
 * hold a SITE_PHOTO upload grant with the TASKS module enabled, the site must be a live
 * company site the principal is assigned to, and the photo must be a MediaAsset the same
 * user uploaded as a SITE_PHOTO for exactly that site and company. The stored URL and
 * public id come from that asset; nothing the browser sends is used as a URL.
 */
export async function uploadMobileSitePhotoAction(formData: {
  siteId: string
  mediaAssetId: string
  caption: string
  gps: string
}) {
  const policy = UPLOAD_POLICIES.SITE_PHOTO
  const { user, site } = await requireAssignedSiteMutation(String(formData?.siteId ?? ''), policy.permissions, policy.module)

  const mediaAssetId = boundedText(formData.mediaAssetId, 64)
  if (!mediaAssetId) throw new Error(MEDIA_NOT_FOUND)
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: mediaAssetId, companyId: user.companyId, siteId: site.id, module: 'SITE_PHOTO', uploadedById: user.id },
    select: { id: true, secureUrl: true, cloudinaryPublicId: true },
  })
  if (!asset) throw new Error(MEDIA_NOT_FOUND)

  const caption = boundedText(formData.caption, 500)
  const gps = boundedText(formData.gps, 100)
  const photo = await prisma.sitePhoto.create({
    data: {
      companyId: user.companyId,
      siteId: site.id,
      secureUrl: asset.secureUrl,
      cloudinaryPublicId: asset.cloudinaryPublicId,
      caption: caption || 'Site Operations Photo',
      category: gps ? `GPS:${gps}` : 'Civil',
      uploadedById: user.id,
    },
    select: { id: true },
  })

  revalidatePath('/mobile/site-photo')
  return { success: true, id: photo.id }
}
