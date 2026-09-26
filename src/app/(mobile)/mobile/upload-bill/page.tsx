import { prisma } from '@/lib/prisma'
import { getRoleRedirect } from '@/lib/permissions'
import { assignedSiteWhere, exitDeniedPage, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'
import MobileUploadBillClient from '@/components/mobile/MobileUploadBillClient'

export const metadata = {
  title: 'Upload Bill & Voucher Scan | Civil Tracker Mobile',
  description: 'Scan vendor bills and OCR challans auto-tagged with date, time, and GPS telemetry.',
}

export default async function MobileUploadBillPage({ searchParams }: { searchParams: Promise<{ siteId?: string }> }) {
  // Live principal, `bills.upload` and the BILLS module, never the JWT claims, before any
  // read. The bill is filed through `createExpenseAction`, which also needs
  // `expenses.create` and approval participation, so a role that cannot finish the flow
  // is turned away here too.
  const gate = await resolveTenantPageAccess({ grants: [{ permission: 'bills.upload', module: 'BILLS' }] })
  if (gate.status === 'denied') exitDeniedPage(gate, '/mobile/upload-bill')
  const { can, user } = gate.access
  if (!can('expenses.create') || !can('approvals.view')) {
    exitDeniedPage({ status: 'denied', redirectTo: getRoleRedirect(user.role) }, '/mobile/upload-bill')
  }

  const { siteId } = await searchParams

  // The same policy the expense action enforces: ACTIVE live sites of the live company,
  // and for a field role only the sites it is assigned to.
  const sites = await prisma.site.findMany({
    where: { ...(await assignedSiteWhere(gate.access)), status: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: { createdAt: 'desc' }
  })

  const matchedSite = sites.find(s => s.id === siteId)
  const defaultSite = matchedSite || sites[0]

  return <MobileUploadBillClient sites={sites} defaultSiteName={defaultSite?.name || ''} defaultSiteId={matchedSite?.id} />
}
