import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import MobileInventoryClient from '@/components/mobile/MobileInventoryClient'
import type { SerializedAsset, SiteOption } from '@/components/inventory/InventoryClient'

export const dynamic = 'force-dynamic'

export default async function MobileInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const userId = session.user.id
  let companyId = session.user.companyId

  const member = await prisma.companyMember.findFirst({
    where: { userId, ...(companyId ? { companyId } : {}) },
    include: { company: true },
  })

  if (!companyId && session.user.role !== 'SUPER_ADMIN') {
    companyId = member?.companyId
  }

  if (!companyId && session.user.role !== 'SUPER_ADMIN') {
    redirect('/mobile/home')
  }

  const effectiveCompany = member?.company || (companyId ? await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, logo: true }
  }) : null)

  const companyName = effectiveCompany?.name || session.user.companyName || 'Company'
  const companyLogo = effectiveCompany?.logo || session.user.companyLogo || null
  const siteIds = member?.siteIds ?? []

  const resolvedParams = await searchParams
  const requestedSiteId = resolvedParams?.siteId

  // Fetch all sites user has access to
  const allSitesRecords = siteIds.length > 0
    ? await prisma.site.findMany({
        where: { id: { in: siteIds }, companyId, deletedAt: null, status: 'ACTIVE' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : await prisma.site.findMany({
        where: { companyId, deletedAt: null, status: 'ACTIVE' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })

  const sites: SiteOption[] = allSitesRecords.map((s) => ({
    id: s.id,
    name: s.name,
  }))

  const activeSiteRecord = requestedSiteId
    ? allSitesRecords.find((s) => s.id === requestedSiteId) || allSitesRecords[0]
    : allSitesRecords[0]

  const activeSite = activeSiteRecord
    ? { id: activeSiteRecord.id, name: activeSiteRecord.name }
    : null

  // Fetch company equipment
  const rawAssets = await prisma.companyAsset.findMany({
    where: {
      ...(companyId ? { companyId } : {}),
      deletedAt: null,
      isActive: true,
    },
    include: {
      site: { select: { id: true, name: true } },
    },
    orderBy: [{ updatedAt: 'desc' }],
  })

  const serializedAssets: SerializedAsset[] = rawAssets.map((a) => ({
    id: a.id,
    companyId: a.companyId,
    siteId: a.siteId,
    name: a.name,
    assetCode: a.assetCode,
    category: a.category,
    brand: a.brand,
    modelNumber: a.modelNumber,
    serialNumber: a.serialNumber,
    quantity: a.quantity,
    unit: a.unit,
    status: a.status as SerializedAsset['status'],
    conditionNotes: a.conditionNotes,
    purchaseDate: a.purchaseDate ? a.purchaseDate.toISOString() : null,
    purchaseCost: a.purchaseCost ? Number(a.purchaseCost) : null,
    currentValue: a.currentValue ? Number(a.currentValue) : null,
    assignedTo: a.assignedTo,
    locationName: a.locationName,
    notes: a.notes,
    isActive: a.isActive,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    site: a.site ? { id: a.site.id, name: a.site.name } : null,
  }))

  return (
    <MobileInventoryClient
      initialAssets={serializedAssets}
      sites={sites}
      activeSite={activeSite}
      companyName={companyName}
      companyLogo={companyLogo}
    />
  )
}
