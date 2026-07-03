import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function SiteLabourPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params

  const labour = await prisma.labour.findMany({
    where: { siteId: id, companyId: session?.user?.companyId },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200">
        <h3 className="font-bold text-slate-800">Site Labour</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
              <th className="p-4 font-bold">Name</th>
              <th className="p-4 font-bold">Trade</th>
              <th className="p-4 font-bold">Status</th>
              <th className="p-4 font-bold text-right">Daily Wage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {labour.length === 0 && (
              <tr><td colSpan={4} className="p-6 text-center text-slate-500">No labour assigned to this site.</td></tr>
            )}
            {labour.map(l => (
              <tr key={l.id} className="hover:bg-slate-50/50">
                <td className="p-4 font-bold text-slate-900">{l.name}</td>
                <td className="p-4 text-slate-600 font-medium">{l.trade}</td>
                <td className="p-4">
                  {l.isActive ? (
                    <span className="px-2 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase rounded-md">Active</span>
                  ) : (
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase rounded-md">Inactive</span>
                  )}
                </td>
                <td className="p-4 font-bold text-slate-900 text-right">₹{Number(l.dailyWage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
