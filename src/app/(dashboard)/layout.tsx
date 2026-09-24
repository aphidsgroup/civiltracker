import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import DashboardSidebar from '@/components/layout/DashboardSidebar'
import DashboardTopbar from '@/components/layout/DashboardTopbar'
import ResponsiveShell from '@/components/responsive/ResponsiveShell'
import { prisma } from '@/lib/prisma'
import { getPendingApprovalBadgeCount } from '@/lib/approvals/valid-reads'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = session.user.companyId

  const [pendingApprovalsCount, company] = await Promise.all([
    // Live approvals.view and valid rows only; never the JWT role or a raw row count.
    getPendingApprovalBadgeCount(),
    companyId ? prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, plan: true, city: true },
    }) : Promise.resolve(null),
  ])

  return (
    <ResponsiveShell
      layoutClass="admin-layout"
      sidebar={
        <DashboardSidebar
          user={session.user}
          pendingApprovalsCount={pendingApprovalsCount}
          companyName={company?.name}
          companyPlan={company?.plan}
          companyCity={company?.city ?? undefined}
        />
      }
      topbar={
        <DashboardTopbar
          user={session.user}
          pendingApprovalsCount={pendingApprovalsCount}
          companyName={company?.name}
        />
      }
    >
      {children}
    </ResponsiveShell>
  )
}
