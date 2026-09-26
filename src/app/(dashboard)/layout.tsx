import { redirect } from 'next/navigation'
import DashboardSidebar from '@/components/layout/DashboardSidebar'
import DashboardTopbar from '@/components/layout/DashboardTopbar'
import ResponsiveShell from '@/components/responsive/ResponsiveShell'
import { requireUser } from '@/lib/auth/require-user'
import { prisma } from '@/lib/prisma'
import { getPendingApprovalBadgeCount } from '@/lib/approvals/valid-reads'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Live principal, never the JWT claims: a revoked, deactivated or suspended member goes
  // to /login, and the shell shows the current role, name, company and module controls.
  // Each page still runs its own gate; the layout renders in parallel with it.
  const user = await requireUser().catch(() => null)
  if (!user) redirect('/login')

  const companyId = user.companyId

  const [pendingApprovalsCount, company] = await Promise.all([
    // Live approvals.view and valid rows only; never the JWT role or a raw row count.
    getPendingApprovalBadgeCount(),
    companyId ? prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { name: true, plan: true, city: true },
    }) : Promise.resolve(null),
  ])

  return (
    <ResponsiveShell
      layoutClass="admin-layout"
      sidebar={
        <DashboardSidebar
          user={user}
          pendingApprovalsCount={pendingApprovalsCount}
          companyName={company?.name}
          companyPlan={company?.plan}
          companyCity={company?.city ?? undefined}
        />
      }
      topbar={
        <DashboardTopbar
          user={user}
          pendingApprovalsCount={pendingApprovalsCount}
          companyName={company?.name}
        />
      }
    >
      {children}
    </ResponsiveShell>
  )
}
