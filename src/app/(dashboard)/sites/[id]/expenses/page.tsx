import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatCurrency, formatDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function SiteExpensesPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params

  const expenses = await prisma.expense.findMany({
    where: { siteId: id, companyId: session?.user?.companyId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200">
        <h3 className="font-bold text-slate-800">Site Expenses</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
              <th className="p-4 font-bold">Date</th>
              <th className="p-4 font-bold">Description</th>
              <th className="p-4 font-bold">Category</th>
              <th className="p-4 font-bold text-right">Amount</th>
              <th className="p-4 font-bold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {expenses.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-slate-500">No expenses recorded for this site.</td></tr>
            )}
            {expenses.map(e => (
              <tr key={e.id} className="hover:bg-slate-50/50">
                <td className="p-4 whitespace-nowrap text-slate-500 font-medium">{formatDate(e.createdAt)}</td>
                <td className="p-4 font-semibold text-slate-900">{e.description}</td>
                <td className="p-4 text-slate-600">{e.category}</td>
                <td className="p-4 font-bold text-slate-900 text-right">{formatCurrency(Number(e.amount))}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded-md ${
                    e.approvalStatus === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 
                    e.approvalStatus === 'PENDING' ? 'bg-amber-100 text-amber-800' : 
                    'bg-red-100 text-red-800'
                  }`}>
                    {e.approvalStatus}
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
