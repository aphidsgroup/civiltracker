import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import DashboardSidebar from '@/components/layout/DashboardSidebar'
import DashboardTopbar from '@/components/layout/DashboardTopbar'
import ResponsiveShell from '@/components/responsive/ResponsiveShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <ResponsiveShell
      layoutClass="admin-layout"
      sidebar={<DashboardSidebar user={session.user} />}
      topbar={({ toggleMobileMenu }) => <DashboardTopbar user={session.user} toggleMobileMenu={toggleMobileMenu} />}
    >
      {children}
    </ResponsiveShell>
  )
}
