import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatCurrency } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function SiteSubcontractorsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params

  // Find subcontractors that have attendance records at this site
  const subcontractors = await prisma.subcontractor.findMany({
    where: { 
      companyId: session?.user?.companyId,
      attendances: {
        some: { siteId: id }
      }
    }
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200">
        <h3 className="font-bold text-slate-800">Site Subcontractors</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
              <th className="p-4 font-bold">Name</th>
              <th className="p-4 font-bold">Trade</th>
              <th className="p-4 font-bold">Phone</th>
              <th className="p-4 font-bold text-right">Work Order Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {subcontractors.length === 0 && (
              <tr><td colSpan={4} className="p-6 text-center text-slate-500">No subcontractors assigned to this site yet.</td></tr>
            )}
            {subcontractors.map(s => {
              return (
                <tr key={s.id} className="hover:bg-slate-50/50">
                  <td className="p-4 font-bold text-slate-900">{s.name}</td>
                  <td className="p-4 text-slate-600 font-medium">{s.trade}</td>
                  <td className="p-4 text-slate-600">{s.phone || '-'}</td>
                  <td className="p-4 font-bold text-slate-900 text-right">{formatCurrency(Number(s.workOrderValue))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
