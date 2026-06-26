import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { ClipboardList, FileSpreadsheet, DollarSign, Receipt } from 'lucide-react'

export const metadata = { title: 'BOQ | Civil Tracker' }

export default async function BOQPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const items = await prisma.bOQItem.findMany({
    where: { companyId },
    include: { site: { select: { name: true } } },
    orderBy: [{ siteId: 'asc' }, { category: 'asc' }],
  })

  const totalAgg = await prisma.bOQItem.aggregate({
    where: { companyId },
    _sum: { amount: true, totalWithGst: true },
  })
  const totalAmount = Number(totalAgg._sum.amount || 0)
  const totalWithGst = Number(totalAgg._sum.totalWithGst || 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Bill of Quantities</h1>
        <a href="/boq/new" className="bg-blue-600 text-white rounded-lg px-4 py-2 text-xs font-bold no-underline hover:bg-blue-700 transition-colors">
          + Add BOQ Item
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'BOQ Items', value: items.length, icon: ClipboardList, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/50' },
          { label: 'Base Amount', value: `₹${(totalAmount / 100000).toFixed(2)}L`, icon: FileSpreadsheet, color: 'text-slate-900 dark:text-slate-100', bg: 'bg-slate-100 dark:bg-slate-800' },
          { label: 'With GST', value: `₹${(totalWithGst / 100000).toFixed(2)}L`, icon: DollarSign, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/50' },
          { label: 'GST Amount', value: `₹${((totalWithGst - totalAmount) / 100000).toFixed(2)}L`, icon: Receipt, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/50' },
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

      {items.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center shadow-sm flex flex-col items-center justify-center">
          <div className="p-4 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-full mb-4">
            <ClipboardList className="w-10 h-10" />
          </div>
          <h2 className="font-bold text-lg text-slate-900 dark:text-slate-100 mb-2">No BOQ items yet</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
            Create BOQ items per site to track quantities, rates, and costs by category.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Description</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Site</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Unit</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Qty</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Rate</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">GST%</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {items.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3.5 text-sm font-semibold text-slate-900 dark:text-slate-100 max-w-[200px]">
                      <div className="truncate">{item.description}</div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{item.site.name}</td>
                    <td className="px-4 py-3.5 text-xs font-semibold text-slate-700 dark:text-slate-300">{item.category}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{item.unit}</td>
                    <td className="px-4 py-3.5 text-sm font-bold text-slate-900 dark:text-slate-100">{Number(item.quantity).toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-sm font-bold text-slate-900 dark:text-slate-100">₹{Number(item.rate).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3.5 text-sm font-bold text-slate-900 dark:text-slate-100">₹{Number(item.amount).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{item.gstPercent}%</td>
                    <td className="px-4 py-3.5 text-sm font-extrabold text-blue-600 dark:text-blue-400">₹{Number(item.totalWithGst).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
