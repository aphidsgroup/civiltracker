'use server'

import { requireUser } from '@/lib/auth/require-user'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

// Delete a site photo — only the uploader or admin can delete
export async function deleteSitePhotoAction(photoId: string) {
  const user = await requireUser()

  const photo = await prisma.sitePhoto.findUnique({ where: { id: photoId } })
  if (!photo) throw new Error('Photo not found')

  // Only allow the uploader or same company admin to delete
  if (photo.companyId !== user.companyId) throw new Error('Unauthorized')

  await prisma.sitePhoto.delete({ where: { id: photoId } })

  revalidatePath('/mobile/site-photo')
  revalidatePath(`/sites/${photo.siteId}/photos`)
  return { success: true }
}
