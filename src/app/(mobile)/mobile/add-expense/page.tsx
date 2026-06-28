import { requireUser } from '@/lib/auth/require-user'
import prisma from '@/lib/prisma'
import MobileAddExpenseClient from '@/components/mobile/MobileAddExpenseClient'

export const metadata = {
  title: 'Add Site Expense & Petty Cash | Civil Tracker Mobile',
  description: 'Log petty cash expenditures and attach GPS-tagged receipt vouchers.',
}

export default async function MobileAddExpensePage({ searchParams }: { searchParams: Promise<{ siteId?: string }> }) {
  const user = await requireUser()
  const { siteId } = await searchParams

  const sites = user.companyId
    ? await prisma.site.findMany({
        where: { companyId: user.companyId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
      })
    : []

  const fallbackSites = sites.length > 0 ? sites : [
    { id: 'site-a', name: 'Anna Nagar Villa' },
    { id: 'site-b', name: 'Metro Heights Tower A' }
  ]

  const matchedSite = fallbackSites.find(s => s.id === siteId) || fallbackSites[0]

  return <MobileAddExpenseClient sites={fallbackSites} defaultSiteName={matchedSite.name} defaultSiteId={siteId} />
}
