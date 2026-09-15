'use server'

import { requireChecklistSite } from '@/lib/auth/checklist-site'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function uploadMobileSitePhotoAction(formData: {
  siteId: string
  imageUrl: string
  caption: string
  gps: string
}) {
  const { user, site } = await requireChecklistSite(formData.siteId)

  await prisma.sitePhoto.create({
    data: {
      companyId: site.companyId,
      siteId: site.id,
      secureUrl: formData.imageUrl,
      cloudinaryPublicId: `field_gps_${Date.now()}`,
      caption: formData.caption.trim() || 'Site Operations Photo',
      category: formData.gps ? `GPS:${formData.gps}` : 'Civil',
      uploadedById: user.id,
    },
  })

  revalidatePath('/mobile/site-photo')
  return { success: true }
}
