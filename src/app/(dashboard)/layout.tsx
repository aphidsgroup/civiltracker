import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import DashboardSidebar from '@/components/layout/DashboardSidebar'
import DashboardTopbar from '@/components/layout/DashboardTopbar'
import ResponsiveShell from '@/components/responsive/ResponsiveShell'
import { prisma } from '@/lib/prisma'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyFilter = session.user.role === 'SUPER_ADMIN' ? {} : { companyId: session.user.companyId }
  const pendingApprovalsCount = await prisma.approval.count({
    where: { ...companyFilter, currentStatus: 'PENDING', deletedAt: null },
  })

  return (
    <ResponsiveShell
      layoutClass="admin-layout"
      sidebar={<DashboardSidebar user={session.user} pendingApprovalsCount={pendingApprovalsCount} />}
      topbar={({ toggleMobileMenu }) => <DashboardTopbar user={session.user} toggleMobileMenu={toggleMobileMenu} pendingApprovalsCount={pendingApprovalsCount} />}
    >
      {children}
    </ResponsiveShell>
  )
}
