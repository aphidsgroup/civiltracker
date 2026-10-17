import { requireUser } from '@/lib/auth/require-user'
import prisma from '@/lib/prisma'
import MobileRequestMaterialClient from '@/components/mobile/MobileRequestMaterialClient'

export const metadata = {
  title: 'Request Materials | Civil Tracker Mobile',
  description: 'Submit material requisitions to Company Admin for site supply.',
}

export default async function RequestMaterialPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>
}) {
  const user = await requireUser()
  const { siteId } = await searchParams

  const sites = user.companyId
    ? await prisma.site.findMany({
        where: {
          companyId: user.companyId,
          deletedAt: null,
          status: 'ACTIVE',
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : []

  const customCatalogueItems = user.companyId
    ? await prisma.companyCatalogueItem.findMany({
        where: {
          companyId: user.companyId,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      })
    : []

  const matchedSite = sites.find((s) => s.id === siteId) || sites[0]

  return (
    <MobileRequestMaterialClient
      sites={sites}
      customCatalogueItems={customCatalogueItems.map((item) => ({
        id: item.id,
        category: item.category,
        materialName: item.materialName,
        variantId: item.variantId || item.id,
        specification: item.specification,
        brand: item.brand,
        defaultUnit: item.defaultUnit,
        allowedUnits: item.allowedUnits ? item.allowedUnits.split(',').map((u) => u.trim()) : [item.defaultUnit],
        isDecimalAllowed: item.isDecimalAllowed,
        packSize: item.packSize || undefined,
        conversionNote: item.notes || undefined,
      }))}
      defaultSiteId={matchedSite?.id}
      defaultSiteName={matchedSite?.name || 'Active Site'}
    />
  )
}

