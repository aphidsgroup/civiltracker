'use server'

import { requireAssignedScopeMutation } from '@/lib/auth/site-mutation'
import { hasPermission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { UPLOAD_POLICIES } from '@/lib/uploads/upload-policy'
import { releaseMediaForDeletedRecord } from '@/lib/uploads/media-claim'
import { revalidatePath } from 'next/cache'
import { auditLogData } from '@/lib/audit-data'

const PHOTO_NOT_FOUND = 'FORBIDDEN: Photo not found or access denied'

/*
 * Delete a site photo. Only the uploader (still holding a live SITE_PHOTO upload grant)
 * or a holder of `sites.update` (Company Admin / Project Manager) may delete, with the
 * SITE_PHOTO policy's module (TASKS) enabled, and only a photo on a live site of exactly the live company
 * within the principal's `assignedSiteScope` (field roles: their assigned sites). The
 * photo and its media row are deleted company-scoped, and audited, in one transaction; the external
 * asset is destroyed only after that commits, and only when no photo still references it and
 * no media row for it is claimed by another record (see `releaseMediaForDeletedRecord`).
 */
export async function deleteSitePhotoAction(photoId: string, confirmationText?: string) {
  const policy = UPLOAD_POLICIES.SITE_PHOTO
  const { user, scope } = await requireAssignedScopeMutation(['sites.update', ...policy.permissions], policy.module)
  if (user.role === 'SUPER_ADMIN') throw new Error('FORBIDDEN: Tenant context required')
  const companyId = user.companyId

  const photo = await prisma.sitePhoto.findFirst({
    where: { id: photoId, companyId, site: scope },
    include: { task: { select: { name: true } } },
  })
  if (!photo) throw new Error(PHOTO_NOT_FOUND)

  const isUploader = !!photo.uploadedById && photo.uploadedById === user.id
  if (!isUploader && !hasPermission(user.role, 'sites.update')) {
    throw new Error('FORBIDDEN: Only the uploader or a site manager can delete this photo')
  }

  const expected = (photo.caption || photo.task?.name || photo.category || photo.id).trim()
  if ((confirmationText ?? '').trim() !== expected) {
    throw new Error('Photo delete confirmation text did not match the photo label')
  }

  const assetUnreferenced = await prisma.$transaction(async (tx) => {
    const result = await tx.sitePhoto.deleteMany({
      where: { id: photo.id, companyId, site: scope },
    })
    if (result.count !== 1) throw new Error(PHOTO_NOT_FOUND)

    // The audit record shares the transaction: a failed audit write keeps the photo.
    await tx.auditLog.create({
      data: auditLogData({
        userId: user.id,
        companyId,
        action: 'DELETE',
        module: 'SITE_PHOTO',
        recordId: photo.id,
        description: `${user.name ?? user.email} permanently deleted site photo "${expected}"`,
        before: {
          caption: photo.caption,
          category: photo.category,
          siteId: photo.siteId,
          taskId: photo.taskId,
          cloudinaryPublicId: photo.cloudinaryPublicId,
          secureUrl: photo.secureUrl,
        },
        after: { deleted: true },
      }),
    })

    // The media row is retired under its row lock before the remaining references are
    // counted, so an attach of the same upload racing this delete either commits first
    // (and is counted, keeping the file) or is refused. Another photo (of any tenant) may
    // share the public id, or a bill attachment; the stored file is kept if so.
    const shared = { where: { cloudinaryPublicId: photo.cloudinaryPublicId } }
    return releaseMediaForDeletedRecord(
      tx,
      { cloudinaryPublicId: photo.cloudinaryPublicId, companyId, recordId: photo.id },
      async () => (await tx.sitePhoto.count(shared)) > 0 || (await tx.billAttachment.count(shared)) > 0,
    )
  })

  // The database has committed; a failed external delete only leaves an orphaned asset.
  if (assetUnreferenced) {
    try {
      const cloudinary = (await import('@/lib/cloudinary')).default
      await cloudinary.uploader.destroy(photo.cloudinaryPublicId)
    } catch (err) {
      console.error('Failed to delete from Cloudinary', err)
    }
  }

  revalidatePath('/mobile/site-photo')
  revalidatePath(`/sites/${photo.siteId}/photos`)
  return { success: true }
}
