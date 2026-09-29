import { prisma } from '@/lib/prisma'
import { requireSuperAdminPage } from '@/lib/pages/super-admin-page-access'
import ResponsiveShell from '@/components/responsive/ResponsiveShell'
import SuperAdminSidebar from '@/components/layout/SuperAdminSidebar'
import SuperAdminTopbar from '@/components/layout/SuperAdminTopbar'

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdminPage()

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
