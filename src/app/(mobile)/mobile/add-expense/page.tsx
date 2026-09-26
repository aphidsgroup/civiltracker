import { prisma } from '@/lib/prisma'
import { getRoleRedirect } from '@/lib/permissions'
import { assignedSiteWhere, exitDeniedPage, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'
import MobileAddExpenseClient from '@/components/mobile/MobileAddExpenseClient'

export const metadata = {
  title: 'Add Site Expense & Petty Cash | Civil Tracker Mobile',
  description: 'Log petty cash expenditures and attach GPS-tagged receipt vouchers.',
}

export default async function MobileAddExpensePage({ searchParams }: { searchParams: Promise<{ siteId?: string }> }) {
  // Live principal, `expenses.create` and the EXPENSES module, never the JWT claims, before
  // any read. `createExpenseAction` also raises an approval, so a role outside the approval
  // flow is turned away here too.
  const gate = await resolveTenantPageAccess({ grants: [{ permission: 'expenses.create', module: 'EXPENSES' }] })
  if (gate.status === 'denied') exitDeniedPage(gate, '/mobile/add-expense')
  const { can, user } = gate.access
  if (!can('approvals.view')) {
    exitDeniedPage({ status: 'denied', redirectTo: getRoleRedirect(user.role) }, '/mobile/add-expense')
  }

  const { siteId } = await searchParams

  // The same policy the expense action enforces: ACTIVE live sites of the live company,
  // and for a field role only the sites it is assigned to.
  const sites = await prisma.site.findMany({
    where: { ...(await assignedSiteWhere(gate.access)), status: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  })

  const matchedSite = sites.find(s => s.id === siteId)
  const defaultSite = matchedSite || sites[0]

  return <MobileAddExpenseClient sites={sites} defaultSiteName={defaultSite?.name || ''} defaultSiteId={matchedSite?.id} />
}
