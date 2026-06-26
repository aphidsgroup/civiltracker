import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import DashboardSidebar from '@/components/layout/DashboardSidebar'
import DashboardTopbar from '@/components/layout/DashboardTopbar'
import ResponsiveShell from '@/components/responsive/ResponsiveShell'
import { prisma } from '@/lib/prisma'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = session.user.companyId
  const companyFilter = session.user.role === 'SUPER_ADMIN' ? {} : { companyId }

  const [pendingApprovalsCount, company] = await Promise.all([
    prisma.approval.count({
      where: { ...companyFilter, currentStatus: 'PENDING', deletedAt: null },
    }),
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
