import { prisma } from '@/lib/prisma'
import { assignedSiteWhere, exitDeniedPage, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'
import MobileClientAdvanceClient from '@/components/mobile/MobileClientAdvanceClient'

export const metadata = {
  title: 'Client Advance | Civil Tracker',
  description: 'Record advance payments received from clients.',
}

export default async function MobileClientAdvancePage({ searchParams }: { searchParams: Promise<{ siteId?: string }> }) {
  // Live principal, `payments.manage` and the CLIENTS module, never the JWT claims, before
  // any read: the same permission `createClientAdvance` enforces.
  const gate = await resolveTenantPageAccess({ grants: [{ permission: 'payments.manage', module: 'CLIENTS' }] })
  if (gate.status === 'denied') exitDeniedPage(gate, '/mobile/add-client-advance')

  const { siteId } = await searchParams

  // ACTIVE live sites of the live company, narrowed for a field role to its assigned sites.
  const sites = await prisma.site.findMany({
    where: { ...(await assignedSiteWhere(gate.access)), status: 'ACTIVE' },
    select: { id: true, name: true, location: true },
    orderBy: { name: 'asc' },
  })

  const matchedSite = sites.find(s => s.id === siteId)

  return <MobileClientAdvanceClient sites={sites} defaultSiteId={matchedSite?.id} />
}
