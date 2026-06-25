import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import ResponsiveShell from '@/components/responsive/ResponsiveShell'
import SuperAdminSidebar from '@/components/layout/SuperAdminSidebar'
import SuperAdminTopbar from '@/components/layout/SuperAdminTopbar'

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'SUPER_ADMIN') redirect('/login')

  const companyCount = await prisma.company.count()

  return (
    <ResponsiveShell
      layoutClass="sa-layout"
      sidebar={<SuperAdminSidebar companyCount={companyCount} />}
      topbar={<SuperAdminTopbar />}
    >
      {children}
    </ResponsiveShell>
  )
}
