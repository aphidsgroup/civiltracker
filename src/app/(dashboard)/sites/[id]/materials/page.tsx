import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function SiteMaterialsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params

  const materials = await prisma.material.findMany({
    where: { siteId: id, companyId: session?.user?.companyId },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center">
        <h3 className="font-bold text-slate-800">Site Materials</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
              <th className="p-4 font-bold">Material Name</th>
              <th className="p-4 font-bold">Unit</th>
              <th className="p-4 font-bold text-right">Available Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {materials.length === 0 && (
              <tr><td colSpan={3} className="p-6 text-center text-slate-500">No materials tracked for this site.</td></tr>
            )}
            {materials.map(m => (
              <tr key={m.id} className="hover:bg-slate-50/50">
                <td className="p-4 font-bold text-slate-900">{m.name}</td>
                <td className="p-4 text-slate-600 font-medium">{m.unit}</td>
                <td className="p-4 font-bold text-slate-900 text-right">
                  <span className={`px-2 py-1 rounded-md text-xs ${Number(m.currentStock) < 10 ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-slate-100 text-slate-700'}`}>
                    {Number(m.currentStock)} {m.unit}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
