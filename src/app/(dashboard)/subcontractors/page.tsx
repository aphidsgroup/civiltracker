import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Users, FileText, CheckCircle2, AlertCircle, HardHat } from 'lucide-react'

export const metadata = { title: 'Subcontractors | Civil Tracker' }

export default async function SubcontractorsPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const subcontractors = await prisma.subcontractor.findMany({
    where: { companyId },
    orderBy: { name: 'asc' },
  })

  const totalWorkAgg = await prisma.subcontractor.aggregate({
    where: { companyId },
    _sum: { workOrderValue: true, raBilled: true },
  })
  const totalWork = Number(totalWorkAgg._sum.workOrderValue || 0)
  const totalBilled = Number(totalWorkAgg._sum.raBilled || 0)
  const outstanding = totalWork - totalBilled

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Subcontractors</h1>
        <a href="/subcontractors/new" className="bg-[#fc6e20] text-white rounded-lg px-4 py-2 text-xs font-bold no-underline hover:bg-[#e85b0d] transition-colors">
          + Add Subcontractor
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Subcontractors', value: subcontractors.length, icon: Users, color: 'text-[#fc6e20] dark:text-blue-400', bg: 'bg-[#fff7ed] dark:bg-blue-950/50' },
          { label: 'Total Work Orders', value: `₹${(totalWork / 100000).toFixed(2)}L`, icon: FileText, color: 'text-slate-900 dark:text-slate-100', bg: 'bg-slate-100 dark:bg-slate-800' },
          { label: 'RA Billed', value: `₹${(totalBilled / 100000).toFixed(2)}L`, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/50' },
          { label: 'Outstanding', value: `₹${(outstanding / 100000).toFixed(2)}L`, icon: AlertCircle, color: outstanding > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100', bg: outstanding > 0 ? 'bg-amber-50 dark:bg-amber-950/50' : 'bg-slate-100 dark:bg-slate-800' },
        ].map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{k.label}</div>
                <div className={`text-2xl font-extrabold ${k.color}`}>{k.value}</div>
              </div>
              <div className={`p-3 rounded-lg ${k.bg} ${k.color}`}>
                <Icon className="w-6 h-6" />
              </div>
            </div>
          )
        })}
      </div>

      {subcontractors.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center shadow-sm flex flex-col items-center justify-center">
          <div className="p-4 bg-[#fff7ed] dark:bg-indigo-950/50 text-[#fc6e20] dark:text-[#fc6e20] rounded-full mb-4">
            <HardHat className="w-10 h-10" />
          </div>
          <h2 className="font-bold text-lg text-slate-900 dark:text-slate-100 mb-2">No subcontractors yet</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
            Add subcontractors to track trade work, RA billing, and outstanding amounts.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Subcontractor</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Trade</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">GST</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Phone</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Work Order</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">RA Billed</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Advance Given</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pending/Due</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {subcontractors.map(s => {
                  const workOrder = Number(s.workOrderValue) || 0
                  const advance = Number(s.advance) || 0
                  const raBilled = Number(s.raBilled) || 0
                  const pending = workOrder - advance - raBilled
                  
                  return (
                  <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3.5 text-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-[#fc6e20] text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-sm">
                          {s.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="font-bold text-slate-900 dark:text-slate-100">{s.name}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-semibold text-slate-700 dark:text-slate-300">{s.trade ?? '—'}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400 font-mono">{s.gst ?? '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-600 dark:text-slate-300">{s.phone ?? '—'}</td>
                    <td className="px-4 py-3.5 text-sm font-bold text-slate-900 dark:text-slate-100">₹{workOrder.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3.5 text-sm font-bold text-emerald-600 dark:text-emerald-400">₹{raBilled.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3.5 text-sm font-bold text-amber-600 dark:text-amber-400">₹{advance.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3.5 text-sm font-bold text-rose-600 dark:text-rose-400">₹{pending.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3.5 text-sm">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 ${
                        s.isActive 
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' 
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${s.isActive ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-red-500 dark:bg-red-400'}`} />
                        {s.status}
                      </span>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
