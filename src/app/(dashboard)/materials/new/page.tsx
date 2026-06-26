import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'

async function createMaterial(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  const companyId = session.user.companyId
  const siteId = formData.get('siteId') as string
  const name = formData.get('name') as string
  const brand = formData.get('brand') as string
  const unit = formData.get('unit') as string
  const openingStock = formData.get('openingStock') as string
  const minStock = formData.get('minStock') as string

  if (!name || !siteId || !unit) return

  const initialStock = openingStock ? parseFloat(openingStock) : 0

  await prisma.material.create({
    data: {
      companyId,
      siteId,
      name,
      brand: brand || null,
      unit,
      openingStock: initialStock,
      currentStock: initialStock, // Set current to opening
      minStock: minStock ? parseFloat(minStock) : 0,
      isActive: true,
    },
  })

  redirect('/materials')
}

export default async function NewMaterialPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  const sites = await prisma.site.findMany({
    where: { companyId: session.user.companyId, status: 'ACTIVE' },
    select: { id: true, name: true }
  })

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="flex items-center px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Add Material Item</h1>
      </div>
      
      <div className="p-6 max-w-2xl">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <form action={createMaterial}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Material Name *</label>
                <input name="name" required placeholder="OPC Cement 43 Grade"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Assign To Site *</label>
                <select name="siteId" required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent">
                  <option value="">-- Choose Site --</option>
                  {sites.map(site => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Brand / Make</label>
                <input name="brand" placeholder="UltraTech, Tata Tiscon..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Unit of Measurement *</label>
                <select name="unit" required defaultValue="Bags"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent">
                  <option value="Bags">Bags</option>
                  <option value="MT">MT (Metric Ton)</option>
                  <option value="Kgs">Kgs</option>
                  <option value="Ltrs">Ltrs</option>
                  <option value="Nos">Nos (Numbers)</option>
                  <option value="Cum">Cum (Cubic Meter)</option>
                  <option value="Sqft">Sqft</option>
                  <option value="Rft">Rft</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Opening Stock</label>
                <input name="openingStock" type="number" min="0" step="0.01" placeholder="0" defaultValue="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Low Stock Alert (Min Stock)</label>
                <input name="minStock" type="number" min="0" step="0.01" placeholder="10"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent" />
              </div>
            </div>

            <div className="mt-8 flex items-center gap-3 border-t border-gray-100 pt-5">
              <button type="submit"
                className="px-5 py-2.5 bg-[#fc6e20] hover:bg-[#e85b0d] text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer">
                Save Material
              </button>
              <Link href="/materials"
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors inline-block">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
