import type { Prisma, Role } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getPhotoDisplayCategory, toSitePhotoLocationView, type SitePhotoLocationView } from '@/lib/site-photo-location-view'

// Server-only data loaders for photo galleries. They return minimal DTOs so
// raw SitePhoto rows (and their coordinates) never reach client components.

const galleryTaskInclude = {
  task: { select: { id: true, name: true, isClientDone: true, category: { select: { name: true, stage: { select: { name: true } } } } } },
} satisfies Prisma.SitePhotoInclude

type GalleryRow = Prisma.SitePhotoGetPayload<{ include: typeof galleryTaskInclude }>
type GalleryRowInput = Omit<GalleryRow, 'task' | 'dprId' | 'taskId' | 'cloudinaryPublicId' | 'approvedById' | 'uploadedById' | 'mediaAssetId'> & {
  task: GalleryRow['task'] | null
}

export type AdminSitePhoto = {
  id: string
  secureUrl: string
  caption: string | null
  category: string | null
  createdAt: Date
  approvedForClient: boolean
  approvedAt: Date | null
  task: { id: string; name: string; category: { name: string; stage: { name: string } } } | null
  location: SitePhotoLocationView
}

export type ClientPortalPhoto = {
  id: string
  secureUrl: string
  caption: string | null
  category: string | null
  createdAt: Date
  approvedAt: Date | null
  task: { id: string; name: string; isClientDone: boolean; category: { name: string; stage: { name: string } } } | null
}

type Viewer = { role: Role; companyId?: string | null }

function toAdminSitePhoto(row: GalleryRowInput, viewer: Viewer): AdminSitePhoto {
  return {
    id: row.id,
    secureUrl: row.secureUrl,
    caption: row.caption,
    category: getPhotoDisplayCategory(row.category),
    createdAt: row.createdAt,
    approvedForClient: row.approvedForClient,
    approvedAt: row.approvedAt,
    task: row.task ? { id: row.task.id, name: row.task.name, category: row.task.category } : null,
    location: toSitePhotoLocationView(row, viewer),
  }
}

export function toClientPortalPhoto(row: GalleryRowInput): ClientPortalPhoto {
  return {
    id: row.id,
    secureUrl: row.secureUrl,
    caption: row.caption,
    category: getPhotoDisplayCategory(row.category),
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
    task: row.task,
  }
}

export async function getAdminSitePhotoGallery(siteId: string, viewer: Viewer) {
  if (!viewer.companyId) return null
  const companyId = viewer.companyId
  const site = await prisma.site.findFirst({ where: { id: siteId, companyId, deletedAt: null }, select: { id: true } })
  if (!site) return null

  const [pending, approved] = await Promise.all([
    prisma.sitePhoto.findMany({
      where: { siteId, companyId, approvedForClient: false },
      include: galleryTaskInclude,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.sitePhoto.findMany({
      where: { siteId, companyId, approvedForClient: true },
      include: galleryTaskInclude,
      orderBy: { approvedAt: 'desc' },
    }),
  ])

  return {
    pending: pending.map((row) => toAdminSitePhoto(row, viewer)),
    approved: approved.map((row) => toAdminSitePhoto(row, viewer)),
  }
}

export async function getClientPortalApprovedPhotos(siteId: string) {
  const rows = await prisma.sitePhoto.findMany({
    where: { siteId, approvedForClient: true },
    include: galleryTaskInclude,
    orderBy: { approvedAt: 'desc' },
  })
  return rows.map(toClientPortalPhoto)
}
