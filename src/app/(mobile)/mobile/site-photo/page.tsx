import prisma from '@/lib/prisma'
import { assignedSiteWhere, exitDeniedPage, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'
import { UPLOAD_POLICIES } from '@/lib/uploads/upload-policy'
import MobilePhotoClient from '@/components/mobile/MobilePhotoClient'

export const metadata = {
  title: 'Site Photos & Geofenced Field Gallery | Civil Tracker Mobile',
  description: 'Capture progress photos with auto-tagged GPS coordinates and time stamps.',
}

export default async function MobileSitePhotoPage({ searchParams }: { searchParams: Promise<{ siteId?: string }> }) {
  // The live principal and the same grants `uploadMobileSitePhotoAction` enforces, before
  // any read: a SITE_PHOTO upload permission with its module enabled.
  const policy = UPLOAD_POLICIES.SITE_PHOTO
  const gate = await resolveTenantPageAccess({
    grants: policy.permissions.map((permission) => ({ permission, module: policy.module })),
  })
  if (gate.status === 'denied') exitDeniedPage(gate, '/mobile/site-photo')
  const { companyId } = gate.access

  // Live sites of exactly the live company, narrowed for a field role to the sites its
  // active membership of this company assigns it — none at all without an assignment.
  // Photos are read only through those sites.
  const siteWhere = await assignedSiteWhere(gate.access)

  const { siteId } = await searchParams

  const [sites, photos] = await Promise.all([
    prisma.site.findMany({
      where: siteWhere,
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    }),
    prisma.sitePhoto.findMany({
      where: { companyId, site: siteWhere },
      include: { site: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20
    }),
  ])
  const defaultSiteId = sites.some((site) => site.id === siteId) ? siteId : undefined

  const mappedPhotos = photos.map(p => ({
    id: p.id,
    dbId: p.id,
    title: p.caption || 'Site Photo',
    meta: p.createdAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }),
    tag: p.category || 'Civil',
    imageUrl: p.secureUrl,
    siteId: p.siteId ?? undefined
  }))


  return <MobilePhotoClient sites={sites} defaultSiteId={defaultSiteId} initialPhotos={mappedPhotos} />
}
