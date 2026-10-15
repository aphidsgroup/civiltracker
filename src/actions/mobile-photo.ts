'use server'

import { requireUser } from '@/lib/auth/require-user'
import { revalidatePath } from 'next/cache'
import { createSitePhotoEvidence, SitePhotoEvidenceError, SITE_PHOTO_TAGS } from '@/lib/site-photo-evidence'
import type { DeviceLocationTelemetry } from '@/lib/browser-location'

export async function uploadMobileSitePhotoAction(input: {
  siteId: string
  publicId: string
  caption: string
  tag: string
  location: DeviceLocationTelemetry
  replacesPhotoId?: string
}) {
  const user = await requireUser()

  const tag = SITE_PHOTO_TAGS.find((t) => t === input.tag) ?? 'Civil'
  let photo
  try {
    photo = await createSitePhotoEvidence(user, {
      siteId: input.siteId,
      publicId: input.publicId,
      location: input.location,
      caption: input.caption,
      category: tag,
      replacesPhotoId: input.replacesPhotoId,
    })
  } catch (err) {
    if (err instanceof SitePhotoEvidenceError) return { success: false as const, error: err.message }
    throw err
  }

  revalidatePath('/mobile/site-photo')
  revalidatePath(`/sites/${photo.siteId}/photos`)
  return { success: true as const, photo: { id: photo.id, imageUrl: photo.secureUrl } }
}
