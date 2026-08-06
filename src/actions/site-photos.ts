'use server'

import { requireUser } from '@/lib/auth/require-user'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/audit'

// Delete a site photo — only the uploader or admin can delete
export async function deleteSitePhotoAction(photoId: string, confirmationText?: string) {
  const user = await requireUser()

  const photo = await prisma.sitePhoto.findUnique({
    where: { id: photoId },
    include: { task: { select: { name: true } } },
  })
  if (!photo) throw new Error('Photo not found')

  // Only allow the uploader or same company admin to delete
  if (photo.companyId !== user.companyId && user.role !== 'SUPER_ADMIN') throw new Error('Unauthorized')

  const expected = (photo.caption || photo.task?.name || photo.category || photo.id).trim()
  if ((confirmationText ?? '').trim() !== expected) {
    throw new Error('Photo delete confirmation text did not match the photo label')
  }

  await logActivity({
    userId: user.id,
    companyId: photo.companyId,
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
  })

  // Delete from Cloudinary
  try {
    const cloudinary = (await import('@/lib/cloudinary')).default
    await cloudinary.uploader.destroy(photo.cloudinaryPublicId)
  } catch (err) {
    console.error('Failed to delete from Cloudinary', err)
  }

  // Delete MediaAsset if it exists
  try {
    await prisma.mediaAsset.deleteMany({
      where: { cloudinaryPublicId: photo.cloudinaryPublicId }
    })
  } catch (err) {
    console.error('Failed to delete MediaAsset', err)
  }

  await prisma.sitePhoto.delete({ where: { id: photoId } })

  revalidatePath('/mobile/site-photo')
  revalidatePath(`/sites/${photo.siteId}/photos`)
  return { success: true }
}
