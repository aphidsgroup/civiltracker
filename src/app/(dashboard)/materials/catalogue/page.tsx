import { requireUser } from '@/lib/auth/require-user'
import prisma from '@/lib/prisma'
import MaterialCatalogueClient from '@/components/materials/MaterialCatalogueClient'

export const metadata = {
  title: 'Material Specification Catalogue | Civil Tracker',
  description: 'Master 10-domain construction material catalogue with variants, specifications, and approved brands.',
}

export default async function MaterialCataloguePage() {
  const user = await requireUser()
  const companyFilter = user.role === 'SUPER_ADMIN' ? {} : { companyId: user.companyId! }

  const company = user.companyId
    ? await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { name: true },
      })
    : null

  const customItems = await prisma.companyCatalogueItem.findMany({
    where: {
      ...companyFilter,
      isActive: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <MaterialCatalogueClient
      customItems={customItems}
      companyName={company?.name || 'Company Wide'}
    />
  )
}
