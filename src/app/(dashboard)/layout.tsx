import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import DashboardSidebar from '@/components/layout/DashboardSidebar'
import DashboardTopbar from '@/components/layout/DashboardTopbar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <DashboardSidebar user={session.user} />
      <div style={{ marginLeft: '250px', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }} className="ct-main">
        <DashboardTopbar user={session.user} />
        <main style={{ flex: 1, padding: '24px', maxWidth: '1400px', width: '100%' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
