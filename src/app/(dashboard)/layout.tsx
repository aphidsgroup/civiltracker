import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import DashboardSidebar from '@/components/layout/DashboardSidebar'
import DashboardTopbar from '@/components/layout/DashboardTopbar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="ct app">
      <DashboardSidebar user={session.user} />
      <div className="main">
        <DashboardTopbar user={session.user} />
        <div className="content">
          {children}
        </div>
      </div>
    </div>
  )
}
