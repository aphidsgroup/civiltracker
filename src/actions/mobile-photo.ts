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

  // Resolve companyId — site engineers may not have it in their JWT
  let companyId = user.companyId ?? null
  if (!companyId) {
    const site = await prisma.site.findUnique({ where: { id: formData.siteId }, select: { companyId: true } })
    if (!site) throw new Error('Site not found')
    companyId = site.companyId
  }

  await prisma.sitePhoto.create({
    data: {
      companyId,
      siteId: formData.siteId,
      secureUrl: formData.imageUrl,
      cloudinaryPublicId: `field_gps_${Date.now()}`,
      caption: formData.caption.trim() || 'Site Operations Photo',
      category: formData.gps ? `GPS:${formData.gps}` : 'Civil',
      uploadedById: user.id
    }
  })

  revalidatePath('/mobile/site-photo')
  return { success: true }
}

