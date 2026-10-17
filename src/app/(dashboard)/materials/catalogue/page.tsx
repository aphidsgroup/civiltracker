import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
import MaterialCatalogueClient from '@/components/materials/MaterialCatalogueClient'

export const metadata = {
  title: 'Material Specification Catalogue | Civil Tracker',
  description: 'Master 10-domain construction material catalogue with variants, specifications, and approved brands.',
}

export default async function MaterialCataloguePage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const user = session.user
  const isSuperAdmin = user.role === 'SUPER_ADMIN'
  const companyFilter = isSuperAdmin ? {} : { companyId: user.companyId || '' }

  let companyName = 'Company Wide'
  let customItems: Array<{
    id: string
    category: string
    materialName: string
    specification: string
    brand: string | null
    defaultUnit: string
    allowedUnits: string | null
    isDecimalAllowed: boolean
    packSize: string | null
    notes: string | null
    createdAt: string
  }> = []

  try {
    if (user.companyId) {
      const company = await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { name: true },
      })
      if (company?.name) companyName = company.name
    }

    const rawCustomItems = await prisma.companyCatalogueItem.findMany({
      where: {
        ...companyFilter,
        isActive: true,
      },
      select: {
        id: true,
        category: true,
        materialName: true,
        specification: true,
        brand: true,
        defaultUnit: true,
        allowedUnits: true,
        isDecimalAllowed: true,
        packSize: true,
        notes: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    customItems = rawCustomItems.map((item) => ({
      id: item.id,
      category: item.category || 'General',
      materialName: item.materialName || '',
      specification: item.specification || '',
      brand: item.brand,
      defaultUnit: item.defaultUnit || 'Nos',
      allowedUnits: item.allowedUnits,
      isDecimalAllowed: Boolean(item.isDecimalAllowed),
      packSize: item.packSize,
      notes: item.notes,
      createdAt: item.createdAt.toISOString(),
    }))
  } catch (err) {
    console.error('Error loading catalogue page data:', err)
  }

  return (
    <MaterialCatalogueClient
      customItems={customItems}
      companyName={companyName}
    />
  )
}
