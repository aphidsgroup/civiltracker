import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import Link from 'next/link'
import { FileText, Download, BarChart2 } from 'lucide-react'

export default async function MobileReports() {
  const session = await auth()
  const companyId = session?.user?.companyId
  const userId = session?.user?.id

  // Fetch active site (similar to home page)
  const member = await prisma.companyMember.findFirst({
    where: { userId, companyId },
  })
  const siteIds = member?.siteIds ?? []
  const activeSite = siteIds.length > 0
    ? await prisma.site.findFirst({ where: { id: { in: siteIds }, companyId } })
    : await prisma.site.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' } })

  const siteId = activeSite?.id

  // Get current month start
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  
  const monthName = now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

  // Aggregate this month's expenses
  const monthExpenseAgg = siteId ? await prisma.expense.aggregate({
    where: { siteId, createdAt: { gte: startOfMonth } },
    _sum: { amount: true }
  }) : { _sum: { amount: 0 } }

  const amountThisMonth = Number(monthExpenseAgg._sum.amount ?? 0)
  const amountLakhs = (amountThisMonth / 100000).toFixed(1)

  // Budget calculations
  const budget = Number(activeSite?.budget ?? 0)
  const spent = Number(activeSite?.spent ?? 0)
  const budgetPct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0

  const reportTypes = [
    { name: 'Site-wise expense report' },
    { name: 'Bill approval report' },
    { name: 'Labour attendance report' },
    { name: 'Salary report' },
    { name: 'Material report' },
    { name: 'Budget vs Actual' },
    { name: 'Daily progress (DPR)' },
  ]

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 sm:p-6 select-none pb-28">
      {/* Header */}
      <div className="flex items-center justify-between pt-2 mb-6">
        <h1 className="text-[24px] font-extrabold text-[#0f172a] m-0 tracking-tight">
          Reports
        </h1>
        <div className="px-3 py-1.5 bg-white border border-slate-200 rounded-[10px] shadow-sm text-[11px] font-bold text-slate-600">
          {monthName}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3.5 mb-8">
        <div className="bg-white rounded-[20px] p-4 border border-slate-100 shadow-sm flex flex-col justify-center h-[90px]">
          <div className="text-[22px] font-black text-[#0f172a] tracking-tight mb-1">
            ₹{amountLakhs} L
          </div>
          <div className="text-[11px] font-bold text-slate-500">
            Expense this month
          </div>
        </div>

        <div className="bg-white rounded-[20px] p-4 border border-slate-100 shadow-sm flex flex-col justify-center h-[90px]">
          <div className="text-[22px] font-black text-[#0f172a] tracking-tight mb-1">
            {budgetPct}%
          </div>
          <div className="text-[11px] font-bold text-slate-500">
            Budget used
          </div>
        </div>
      </div>

      {/* Generate Report Section */}
      <div className="flex justify-between items-center mb-4 px-1">
        <h2 className="text-[15px] font-extrabold text-[#0f172a] m-0">Generate report</h2>
        <span className="text-[11.5px] font-bold text-[#fc6e20]">PDF · Excel</span>
      </div>

      {/* Reports List */}
      <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex flex-col divide-y divide-slate-100">
          {reportTypes.map((report, idx) => (
            <button
              key={idx}
              className="flex items-center justify-between p-4 bg-white hover:bg-slate-50 active:bg-slate-100 transition-colors w-full border-none text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-[12px] bg-[#fff7ed] text-[#fc6e20] flex items-center justify-center flex-shrink-0">
                  <FileText size={20} strokeWidth={2.2} />
                </div>
                <span className="text-[13.5px] font-extrabold text-[#0f172a]">
                  {report.name}
                </span>
              </div>
              <div className="w-8 h-8 rounded-[10px] bg-[#fff7ed] text-[#fc6e20] flex items-center justify-center flex-shrink-0">
                <Download size={16} strokeWidth={2.5} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
