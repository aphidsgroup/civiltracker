import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ResponsiveShell from '@/components/responsive/ResponsiveShell'
import SuperAdminSidebar from '@/components/layout/SuperAdminSidebar'
import SuperAdminTopbar from '@/components/layout/SuperAdminTopbar'

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'SUPER_ADMIN') redirect('/login')

  return (
    <ResponsiveShell
      layoutClass="sa-layout"
      sidebar={<SuperAdminSidebar />}
      topbar={<SuperAdminTopbar />}
    >
      {children}
    </ResponsiveShell>
  )
}
