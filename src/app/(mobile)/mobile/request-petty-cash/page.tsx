import { requireUser } from '@/lib/auth/require-user'
import prisma from '@/lib/prisma'
import MobileRequestPettyCashClient from '@/components/mobile/MobileRequestPettyCashClient'

export const metadata = {
  title: 'Request Petty Cash | Civil Tracker Mobile',
  description: 'Submit site petty cash requisitions to Company Admin for disbursement.',
}

export default async function RequestPettyCashPage({
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
    <MobileRequestPettyCashClient
      sites={sites}
      defaultSiteId={matchedSite?.id}
      defaultSiteName={matchedSite?.name || 'Active Site'}
    />
  )
}
