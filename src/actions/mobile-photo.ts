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
 * user uploaded as a SITE_PHOTO for exactly that site and company that no photo row uses
 * yet (the same single-use policy as a checklist photo). The stored URL and public id
 * come from that asset; nothing the browser sends is used as a URL. The asset is read,
 * its use checked, the photo created and a SITE_PHOTO CREATE audit event appended on one
 * transaction client, so a photo without its audit rolls back.
 */
export async function uploadMobileSitePhotoAction(formData: {
  siteId: string
  mediaAssetId: string
  caption: string
  gps: string
}) {
  const policy = UPLOAD_POLICIES.SITE_PHOTO
  const { user, site } = await requireAssignedSiteMutation(String(formData?.siteId ?? ''), policy.permissions, policy.module)

  const mediaAssetId = typeof formData.mediaAssetId === 'string' ? formData.mediaAssetId.trim() : ''
  if (!mediaAssetId || mediaAssetId.length > 64) throw new Error(MEDIA_NOT_FOUND)
  const caption = boundedText(formData.caption, 500)
  const gps = boundedText(formData.gps, 100)

  const photo = await prisma.$transaction(async (tx) => {
    const asset = await tx.mediaAsset.findFirst({
      where: { id: mediaAssetId, companyId: user.companyId, siteId: site.id, module: 'SITE_PHOTO', uploadedById: user.id },
      select: { id: true, secureUrl: true, cloudinaryPublicId: true },
    })
    if (!asset) throw new Error(MEDIA_NOT_FOUND)

    // One upload backs one photo row, so deleting a photo never strands another's image.
    const bound = await tx.sitePhoto.findFirst({
      where: { cloudinaryPublicId: asset.cloudinaryPublicId },
      select: { id: true },
    })
    if (bound) throw new Error('FORBIDDEN: Uploaded photo is already attached')

    const created = await tx.sitePhoto.create({
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

    // Identifiers only: no stored URL, public id, or the caption/GPS text the client sent.
    await tx.auditLog.create({
      data: {
        userId: user.id,
        companyId: user.companyId,
        module: 'SITE_PHOTO',
        action: 'CREATE',
        recordId: created.id,
        after: { change: 'SITE_PHOTO_ATTACHED', photoId: created.id, mediaAssetId: asset.id, siteId: site.id, hasCaption: !!caption, hasGps: !!gps },
      },
    })
    return created
  })

  revalidatePath('/mobile/site-photo')
  return { success: true, id: photo.id }
}
