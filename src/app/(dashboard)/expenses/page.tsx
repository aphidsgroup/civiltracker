import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import ResponsiveTable from '@/components/responsive/ResponsiveTable'
import MobileCardList from '@/components/responsive/MobileCardList'
import { Plus } from 'lucide-react'

export default async function ExpensesPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const expenses = await prisma.expense.findMany({
    where: { companyId, deletedAt: null },
    include: { site: { select: { name: true } }, createdBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const statusColors: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-800',
    APPROVED: 'bg-emerald-100 text-emerald-800',
    PAID: 'bg-[#fff7ed] text-[#e85b0d]',
    REJECTED: 'bg-red-100 text-red-800',
    DRAFT: 'bg-slate-100 text-slate-700',
  }

  const categoryLabels: Record<string, string> = {
    MATERIAL: 'Material', LABOUR: 'Labour', SUBCONTRACTOR: 'Subcontractor',
    TRANSPORT: 'Transport', TOOLS_EQUIPMENT: 'Tools & Equip', SITE_PETTY_CASH: 'Petty Cash',
    DIESEL: 'Diesel', OFFICE_ADMIN: 'Office/Admin', CLIENT_VARIATION: 'Variation', MISCELLANEOUS: 'Misc',
  }

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const pending = expenses.filter(e => e.approvalStatus === 'PENDING').length
  const approved = expenses.filter(e => ['APPROVED', 'PAID'].includes(e.approvalStatus)).reduce((s, e) => s + Number(e.amount), 0)

  return (
    <div className="flex flex-col gap-5.5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold m-0 mb-1 tracking-tight text-slate-900">Expenses & Bills</h1>
          <p className="text-slate-500 text-xs m-0">{expenses.length} records · {pending} pending approval</p>
        </div>
        <Link href="/mobile/add/expense" className="inline-flex items-center gap-1.5 bg-[#fc6e20] text-white rounded-lg px-4 py-2.5 text-sm font-bold hover:bg-[#e85b0d] transition-colors shadow-sm no-underline">
          <Plus className="w-4 h-4" /> Add Expense
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {[
          { label: 'Total Recorded', value: formatCurrency(total), color: 'text-[#fc6e20]' },
          { label: 'Approved / Paid', value: formatCurrency(approved), color: 'text-emerald-600' },
          { label: 'Pending Approval', value: String(pending) + ' bills', color: 'text-amber-600' },
        ].map(c => (
          <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-[10.5px] text-slate-500 font-bold mb-2 uppercase tracking-wider">{c.label}</div>
            <div className={`text-2xl font-extrabold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 sm:px-5 sm:py-4 border-b border-slate-200">
          <h2 className="text-sm font-extrabold m-0 text-slate-800">Expense Records</h2>
        </div>
        <div className="overflow-x-auto">
          <ResponsiveTable
            desktopView={
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Description</th>
                    <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Site</th>
                    <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Category</th>
                    <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Amount</th>
                    <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Date</th>
                    <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">By</th>
                    <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenses.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap">{e.description}</div>
                        {e.billNumber && <div className="text-[11px] text-slate-500 font-medium">#{e.billNumber}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-semibold">{e.site.name}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#fff7ed] text-[#e85b0d] border border-blue-200">
                          {categoryLabels[e.category] ?? e.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-extrabold text-slate-900">{formatCurrency(Number(e.amount))}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-semibold">{formatDate(e.billDate ?? e.createdAt)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-semibold">{e.createdBy.name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColors[e.approvalStatus] ?? 'bg-slate-100 text-slate-700'}`}>
                          {e.approvalStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
            mobileView={
              <MobileCardList
                items={expenses.map(e => ({
                  id: e.id,
                  title: e.description || 'Expense',
                  subtitle: `${e.site.name} • ${formatDate(e.billDate ?? e.createdAt)}`,
                  meta: <div className="text-sm font-extrabold mt-1 text-slate-900">{formatCurrency(Number(e.amount))}</div>,
                  statusNode: (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColors[e.approvalStatus] ?? 'bg-slate-100 text-slate-700'}`}>
                      {e.approvalStatus}
                    </span>
                  )
                }))}
              />
            }
          />
        </div>
      </div>
    </div>
  )
}
