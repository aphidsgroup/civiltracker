import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import InventoryClient, { type SerializedAsset } from '@/components/inventory/InventoryClient'

export const metadata = { title: 'Company Inventory & Equipment | Civil Tracker' }
export const dynamic = 'force-dynamic'

export default async function InventoryPage() {
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

  if (!companyId && session.user.role !== 'SUPER_ADMIN') {
    redirect('/dashboard')
  }

  const [company, sites, rawAssets] = await Promise.all([
    companyId
      ? prisma.company.findUnique({
          where: { id: companyId },
          select: { name: true },
        })
      : Promise.resolve(null),

    companyId
      ? prisma.site.findMany({
          where: { companyId, deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : prisma.site.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),

    prisma.companyAsset.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        deletedAt: null,
        isActive: true,
      },
      include: {
        site: { select: { id: true, name: true } },
      },
      orderBy: [{ updatedAt: 'desc' }],
    }).catch((err) => {
      console.error('Error fetching assets:', err)
      return []
    }),
  ])

  // Convert Decimals & Dates to JSON-safe primitives
  const serializedAssets: SerializedAsset[] = rawAssets.map((a) => ({
    id: a.id,
    companyId: a.companyId,
    siteId: a.siteId,
    name: a.name,
    assetCode: a.assetCode,
    category: a.category,
    brand: a.brand,
    modelNumber: a.modelNumber,
    serialNumber: a.serialNumber,
    quantity: a.quantity,
    unit: a.unit,
    status: a.status as SerializedAsset['status'],
    conditionNotes: a.conditionNotes,
    purchaseDate: a.purchaseDate ? a.purchaseDate.toISOString() : null,
    purchaseCost: a.purchaseCost ? Number(a.purchaseCost) : null,
    currentValue: a.currentValue ? Number(a.currentValue) : null,
    assignedTo: a.assignedTo,
    locationName: a.locationName,
    notes: a.notes,
    isActive: a.isActive,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    site: a.site ? { id: a.site.id, name: a.site.name } : null,
  }))

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto w-full">
      <InventoryClient
        initialAssets={serializedAssets}
        sites={sites}
        companyName={company?.name || session.user.companyName || 'Company'}
      />
    </div>
  )
}
