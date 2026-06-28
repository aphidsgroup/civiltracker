import { requireUser } from '@/lib/auth/require-user'
import prisma from '@/lib/prisma'
import MobileUploadBillClient from '@/components/mobile/MobileUploadBillClient'

export const metadata = {
  title: 'Upload Bill & Voucher Scan | Civil Tracker Mobile',
  description: 'Scan vendor bills and OCR challans auto-tagged with date, time, and GPS telemetry.',
}

export default async function MobileUploadBillPage({ searchParams }: { searchParams: Promise<{ siteId?: string }> }) {
  const user = await requireUser()
  const { siteId } = await searchParams

  const sites = user.companyId
    ? await prisma.site.findMany({
        where: { companyId: user.companyId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { createdAt: 'desc' }
      })
    : []

  const fallbackSites = sites.length > 0 ? sites : [
    { id: 'site-a', name: 'Anna Nagar Villa' },
    { id: 'site-b', name: 'Metro Heights Tower A' }
  ]

  const matchedSite = fallbackSites.find(s => s.id === siteId) || fallbackSites[0]

  return <MobileUploadBillClient sites={fallbackSites} defaultSiteName={matchedSite.name} defaultSiteId={siteId} />
}
