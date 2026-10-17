import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
import MobileRequestMaterialClient from '@/components/mobile/MobileRequestMaterialClient'

export const metadata = {
  title: 'Request Materials | Civil Tracker Mobile',
  description: 'Submit material requisitions to Company Admin for site supply.',
}

export default async function RequestMaterialPage({
  searchParams,
}: {
  searchParams?: Promise<{ siteId?: string }>
}) {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const user = session.user
  const params = searchParams ? await searchParams : {}
  const siteId = params?.siteId

  // Fetch sites accessible to the user
  let sites: Array<{ id: string; name: string }> = []
  try {
    const isSuperAdmin = user.role === 'SUPER_ADMIN'
    sites = await prisma.site.findMany({
      where: {
        ...(isSuperAdmin ? {} : { companyId: user.companyId || '' }),
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
  } catch (err) {
    console.error('Error fetching sites for request-material:', err)
  }

  // Fetch custom company catalogue items
  let customCatalogueItems: Array<{
    id: string
    category: string
    materialName: string
    variantId: string | null
    specification: string
    brand: string | null
    defaultUnit: string
    allowedUnits: string | null
    isDecimalAllowed: boolean
    packSize: string | null
    notes: string | null
  }> = []

  try {
    const isSuperAdmin = user.role === 'SUPER_ADMIN'
    customCatalogueItems = await prisma.companyCatalogueItem.findMany({
      where: {
        ...(isSuperAdmin ? {} : { companyId: user.companyId || '' }),
        isActive: true,
      },
      select: {
        id: true,
        category: true,
        materialName: true,
        variantId: true,
        specification: true,
        brand: true,
        defaultUnit: true,
        allowedUnits: true,
        isDecimalAllowed: true,
        packSize: true,
        notes: true,
      },
      orderBy: { createdAt: 'desc' },
    })
  } catch (err) {
    console.error('Error fetching custom catalogue items:', err)
  }

  const matchedSite = sites.find((s) => s.id === siteId) || sites[0]

  return (
    <MobileRequestMaterialClient
      sites={sites}
      customCatalogueItems={customCatalogueItems.map((item) => ({
        id: item.id,
        category: item.category || 'General',
        materialName: item.materialName || '',
        variantId: item.variantId || item.id,
        specification: item.specification || '',
        brand: item.brand || null,
        defaultUnit: item.defaultUnit || 'Nos',
        allowedUnits: item.allowedUnits
          ? item.allowedUnits.split(',').map((u) => u.trim()).filter(Boolean)
          : [item.defaultUnit || 'Nos'],
        isDecimalAllowed: Boolean(item.isDecimalAllowed),
        packSize: item.packSize || undefined,
        conversionNote: item.notes || undefined,
      }))}
      defaultSiteId={matchedSite?.id || ''}
      defaultSiteName={matchedSite?.name || 'Active Site'}
    />
  )
}
