import { requireUser } from '@/lib/auth/require-user'
import prisma from '@/lib/prisma'
import MobileUploadBillClient from '@/components/mobile/MobileUploadBillClient'

export const metadata = {
  title: 'Upload Bill & Voucher Scan | Civil Tracker Mobile',
  description: 'Scan vendor bills and OCR challans auto-tagged with date, time, and GPS telemetry.',
}

export default async function MobileUploadBillPage() {
  const user = await requireUser()

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

  return <MobileUploadBillClient sites={fallbackSites} defaultSiteName={fallbackSites[0].name} />
}
