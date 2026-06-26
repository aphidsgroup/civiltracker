import { requireUser } from '@/lib/auth/require-user'
import prisma from '@/lib/prisma'
import MobilePhotoClient from '@/components/mobile/MobilePhotoClient'

export const metadata = {
  title: 'Site Photos & Geofenced Field Gallery | Civil Tracker Mobile',
  description: 'Capture progress photos with auto-tagged GPS coordinates and time stamps.',
}

export default async function MobileSitePhotoPage() {
  const user = await requireUser()

  const sites = user.companyId
    ? await prisma.site.findMany({
        where: { companyId: user.companyId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
      })
    : []

  const fallbackSites = sites.length > 0 ? sites : [
    { id: 'site-a', name: 'Anna Nagar Villa' },
    { id: 'site-b', name: 'Metro Heights Tower A' }
  ]

  return <MobilePhotoClient sites={fallbackSites} />
}
