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

  const matchedSite = sites.find((s) => s.id === siteId) || sites[0]

  return (
    <MobileRequestMaterialClient
      sites={sites}
      defaultSiteId={matchedSite?.id}
      defaultSiteName={matchedSite?.name || 'Active Site'}
    />
  )
}
