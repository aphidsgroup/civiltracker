import { requireUser } from '@/lib/auth/require-user'
import prisma from '@/lib/prisma'
import MobileRequestEquipmentClient from '@/components/mobile/MobileRequestEquipmentClient'

export const metadata = {
  title: 'Request Tools & Equipments | Civil Tracker Mobile',
  description: 'Submit site tool and machinery requisitions to Company Admin for allocation.',
}

export default async function RequestEquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>
}) {
  const user = await requireUser()
  const { siteId } = await searchParams

  const [sites, companyAssets] = await Promise.all([
    user.companyId
      ? prisma.site.findMany({
          where: {
            companyId: user.companyId,
            deletedAt: null,
            status: 'ACTIVE',
          },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : [],

    user.companyId
      ? prisma.companyAsset.findMany({
          where: {
            companyId: user.companyId,
            deletedAt: null,
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            category: true,
            brand: true,
            status: true,
            locationName: true,
          },
          take: 50,
          orderBy: { name: 'asc' },
        }).catch(() => [])
      : Promise.resolve([]),
  ])

  const matchedSite = sites.find((s) => s.id === siteId) || sites[0]

  return (
    <MobileRequestEquipmentClient
      sites={sites}
      companyAssets={companyAssets}
      defaultSiteId={matchedSite?.id}
      defaultSiteName={matchedSite?.name || 'Active Site'}
    />
  )
}
