import { requireUser } from '@/lib/auth/require-user'
import prisma from '@/lib/prisma'
import MobilePhotoClient from '@/components/mobile/MobilePhotoClient'

export const metadata = {
  title: 'Site Photos & Geofenced Field Gallery | Civil Tracker Mobile',
  description: 'Capture progress photos with auto-tagged GPS coordinates and time stamps.',
}

export default async function MobileSitePhotoPage({ searchParams }: { searchParams: Promise<{ siteId?: string }> }) {
  const user = await requireUser()
  const { siteId } = await searchParams

  const sites = user.companyId
    ? await prisma.site.findMany({
        where: { companyId: user.companyId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
      })
    : []

  const photos = await prisma.sitePhoto.findMany({
    where: { companyId: user.companyId },
    include: { site: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20
  })

  const mappedPhotos = photos.map(p => ({
    id: p.id,
    title: p.caption || 'Site Photo',
    meta: p.createdAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    tag: p.category || 'Civil',
    imageUrl: p.secureUrl
  }))

  return <MobilePhotoClient sites={sites} defaultSiteId={siteId} initialPhotos={mappedPhotos} />
}
