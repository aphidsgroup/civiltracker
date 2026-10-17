import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import DashboardSidebar from '@/components/layout/DashboardSidebar'
import DashboardTopbar from '@/components/layout/DashboardTopbar'
import ResponsiveShell from '@/components/responsive/ResponsiveShell'
import { prisma } from '@/lib/prisma'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  let companyId = session.user.companyId
  if (!companyId && session.user.role !== 'SUPER_ADMIN') {
    const member = await prisma.companyMember.findFirst({
      where: { userId: session.user.id, isActive: true },
      select: { companyId: true },
    })
    companyId = member?.companyId
  }

  const companyFilter = session.user.role === 'SUPER_ADMIN' ? {} : (companyId ? { companyId } : {})

  const [pendingApprovalsCount, company] = await Promise.all([
    prisma.approval.count({
      where: { ...companyFilter, currentStatus: 'PENDING', deletedAt: null },
    }),
    companyId ? prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, plan: true, city: true, logo: true },
    }) : Promise.resolve(null),
  ])

  const resolvedCompanyName = company?.name ?? session.user.companyName
  const resolvedCompanyLogo = company?.logo ?? session.user.companyLogo

  return (
    <ResponsiveShell
      layoutClass="admin-layout"
      sidebar={
        <DashboardSidebar
          user={session.user}
          pendingApprovalsCount={pendingApprovalsCount}
          companyName={resolvedCompanyName}
          companyPlan={company?.plan}
          companyCity={company?.city ?? undefined}
          companyLogo={resolvedCompanyLogo}
        />
      }
      topbar={
        <DashboardTopbar
          user={session.user}
          pendingApprovalsCount={pendingApprovalsCount}
          companyName={resolvedCompanyName}
          companyLogo={resolvedCompanyLogo}
        />
      }
    >
      {children}
    </ResponsiveShell>
  )
}
