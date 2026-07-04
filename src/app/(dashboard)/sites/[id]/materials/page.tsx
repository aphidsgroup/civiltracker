import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'
import ResponsiveTable from '@/components/responsive/ResponsiveTable'
import MobileCardList from '@/components/responsive/MobileCardList'
import { Package, DollarSign, AlertTriangle, Boxes, Plus } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function SiteMaterialsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user
  const { id: siteId } = await params

  const materials = await prisma.material.findMany({
    where: { companyId, siteId, isActive: true },
    include: { site: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })

  const lowStock = materials.filter(m => Number(m.currentStock) <= Number(m.minStock)).length
  const totalValue = materials.reduce((s, m) => s + Number(m.currentStock) * Number(m.unitCost ?? 0), 0)

  return (
    <div className="flex flex-col gap-6 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Site Materials</h2>
          <p className="text-sm text-slate-500 mt-1">
            {materials.length} items · {lowStock > 0 ? <span className="text-amber-600 font-semibold">⚠️ {lowStock} low stock</span> : 'All stocked'}
          </p>
        </div>
        <Link href={`/materials/new?siteId=${siteId}`} className="bg-[#fc6e20] text-white rounded-lg px-4 py-2 text-xs font-bold no-underline hover:bg-[#e85b0d] transition-colors flex items-center gap-1.5 shadow-sm">
          <Plus size={15} /> Add Material
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Items', value: String(materials.length), icon: Package, color: 'text-[#fc6e20]', bg: 'bg-[#fff7ed]' },
          { label: 'Inventory Value', value: formatCurrency(totalValue), icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Low Stock Alerts', value: String(lowStock), icon: AlertTriangle, color: lowStock > 0 ? 'text-amber-600' : 'text-slate-500', bg: lowStock > 0 ? 'bg-amber-50' : 'bg-slate-100' },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{s.label}</div>
                <div className="text-2xl font-extrabold text-slate-900">{s.value}</div>
              </div>
              <div className={`p-3 rounded-lg ${s.bg} ${s.color}`}>
                <Icon className="w-6 h-6" />
              </div>
            </div>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center gap-2">
          <Boxes className="w-5 h-5 text-slate-500" />
          <h3 className="text-base font-bold text-slate-900">Inventory Tracker</h3>
        </div>
        <div className="overflow-x-auto">
          {materials.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-b-xl">
              <Boxes size={40} className="text-slate-300 mx-auto mb-3" />
              <div className="font-bold text-slate-700">No Materials Tracked</div>
              <div className="text-sm text-slate-500 mt-1 mb-4">You haven't added any materials to this site yet.</div>
              <Link href={`/materials/new?siteId=${siteId}`} className="inline-flex font-bold text-sm text-[#fc6e20] hover:text-[#e85b0d]">
                + Add material inventory
              </Link>
            </div>
          ) : (
            <ResponsiveTable
              desktopView={
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Material</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Unit</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Stock</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Min Level</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Unit Cost</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Value</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {materials.map(m => {
                      const stock = Number(m.currentStock)
                      const min = Number(m.minStock)
                      const val = stock * Number(m.unitCost ?? 0)
                      const isLow = stock <= min
                      return (
                        <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3.5 text-sm">
                            <div className="font-bold text-slate-900">{m.name}</div>
                          </td>
                          <td className="px-4 py-3.5 text-sm">
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">{m.unit}</span>
                          </td>
                          <td className={`px-4 py-3.5 text-sm font-extrabold ${isLow ? 'text-red-600' : 'text-slate-900'}`}>{stock}</td>
                          <td className="px-4 py-3.5 text-sm text-slate-500">{min}</td>
                          <td className="px-4 py-3.5 text-sm font-medium text-slate-600">{m.unitCost ? formatCurrency(Number(m.unitCost)) : '-'}</td>
                          <td className="px-4 py-3.5 text-sm font-bold text-slate-900">{formatCurrency(val)}</td>
                          <td className="px-4 py-3.5 text-sm">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 ${
                              isLow 
                                ? 'bg-red-100 text-red-800' 
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isLow ? 'bg-red-500' : 'bg-emerald-500'}`} />
                              {isLow ? 'Low Stock' : 'Good'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              }
              mobileView={
                <MobileCardList
                  items={materials.map(m => {
                    const stock = Number(m.currentStock)
                    const min = Number(m.minStock)
                    const val = stock * Number(m.unitCost ?? 0)
                    const isLow = stock <= min
                    return {
                      id: m.id,
                      title: m.name,
                      subtitle: m.site.name,
                      meta: (
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-sm font-extrabold text-slate-900">{stock} {m.unit}</span>
                          <span className="text-sm text-slate-500">{formatCurrency(val)}</span>
                        </div>
                      ),
                      statusNode: (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          isLow 
                            ? 'bg-red-100 text-red-800' 
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {isLow ? 'Low Stock' : 'Good'}
                        </span>
                      )
                    }
                  })}
                />
              }
            />
          )}
        </div>
      </div>
    </div>
  )
}
