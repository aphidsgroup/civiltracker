import { requireUser } from '@/lib/auth/require-user'
import prisma from '@/lib/prisma'
import MobilePhotoClient from '@/components/mobile/MobilePhotoClient'

export const metadata = {
  title: 'GPS Geofenced Site Gallery | Civil Tracker Mobile',
  description: 'Capture site telemetry photos with accurate GPS coordinates to verify physical field attendance.',
}

export default async function MobileSitePhotoPage() {
  const user = await requireUser()

  const [photos, sites] = await Promise.all([
    user.companyId
      ? prisma.sitePhoto.findMany({
          where: { companyId: user.companyId },
          include: { site: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : [],
    user.companyId
      ? prisma.site.findMany({
          where: { companyId: user.companyId, deletedAt: null },
          select: { id: true, name: true }
        })
      : []
  ])

  const fallbackSites = sites.length > 0 ? sites : [
    { id: 'site-a', name: 'Metro Heights Tower A' },
    { id: 'site-b', name: 'Green Valley Villas' }
  ]

  const formattedPhotos = photos.map(p => ({
    id: p.id,
    secureUrl: p.secureUrl,
    caption: p.caption,
    category: p.category,
    createdAt: p.createdAt,
    siteName: p.site?.name || 'Assigned Site'
  }))

  const displayPhotos = formattedPhotos.length > 0 ? formattedPhotos : [
    {
      id: 'demo-photo-1',
      secureUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb18f0317?auto=format&fit=crop&w=800&q=80',
      caption: 'Foundation excavation depth check completed',
      category: 'GPS:28.535512, 77.391026',
      createdAt: new Date(),
      siteName: fallbackSites[0].name
    },
    {
      id: 'demo-photo-2',
      secureUrl: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=800&q=80',
      caption: 'Column shuttering alignment verified',
      category: 'GPS:28.536102, 77.391884',
      createdAt: new Date(Date.now() - 3600000),
      siteName: fallbackSites[0].name
    }
  ]

  return (
    <div className="min-h-screen bg-[#f2f5f8] p-4 sm:p-6 pb-28 max-w-lg mx-auto select-none">
      <MobilePhotoClient initialPhotos={displayPhotos} sites={fallbackSites} />
    </div>
  )
}
