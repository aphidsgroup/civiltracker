'use server'

import { requireUser } from '@/lib/auth/require-user'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function uploadMobileSitePhotoAction(formData: {
  siteId: string
  imageUrl: string
  caption: string
  gps: string
}) {
  const user = await requireUser()
  if (!user.companyId) throw new Error('No active workspace context')

  const photo = await prisma.sitePhoto.create({
    data: {
      companyId: user.companyId,
      siteId: formData.siteId,
      secureUrl: formData.imageUrl,
      cloudinaryPublicId: `field_gps_${Date.now()}`,
      caption: formData.caption.trim() || 'Site Operations Photo',
      category: `GPS:${formData.gps}`,
      uploadedById: user.id
    }
  })

  revalidatePath('/mobile/site-photo')
  return { success: true, photo }
}
