import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Building2, DollarSign, Clock, Users, Wallet, CreditCard,
  Plus, Upload, Receipt, CheckSquare, FileText, BarChart3, TrendingUp, AlertCircle
} from 'lucide-react'

function siteStatusChip(progress: number) {
  if (progress >= 75) return { label: 'On track', cls: 'bg-[#e2f3ea] text-[#0f7a45]' }
  if (progress >= 40) return { label: 'In progress', cls: 'bg-[#e7f0fb] text-[#13558e]' }
  return { label: 'Needs review', cls: 'bg-[#fbeacb] text-[#a96c08]' }
}

export default async function CompanyDashboard() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayEnd = new Date(today)
  todayEnd.setHours(23, 59, 59, 999)

  const siteIds = await prisma.site.findMany({ where: { companyId }, select: { id: true } }).then(s => s.map(x => x.id))

  const [
    activeSitesCount, todayExpenseAgg, pendingExpenses,
    totalLabour, todayAttendance, recentPendingExpenses, recentExpenses, sites,
  ] = await Promise.all([
    prisma.site.count({ where: { companyId, deletedAt: null, status: 'ACTIVE' } }),
    prisma.expense.aggregate({ where: { companyId, deletedAt: null, createdAt: { gte: today, lte: todayEnd } }, _sum: { amount: true } }),
    prisma.expense.aggregate({ where: { companyId, deletedAt: null, approvalStatus: 'PENDING' }, _sum: { amount: true }, _count: true }),
    prisma.labour.count({ where: { companyId, isActive: true } }),
    prisma.labourAttendance.count({ where: { siteId: { in: siteIds }, date: { gte: today, lte: todayEnd }, status: 'PRESENT' } }),
    prisma.expense.findMany({ where: { companyId, deletedAt: null, approvalStatus: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 4, select: { id: true, description: true, amount: true, paidTo: true, category: true, site: { select: { name: true } }, createdAt: true } }),
    prisma.expense.findMany({ where: { companyId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 4, select: { id: true, description: true, amount: true, paidTo: true, approvalStatus: true, category: true, createdAt: true, site: { select: { name: true } } } }),
    prisma.site.findMany({ where: { companyId, deletedAt: null, status: 'ACTIVE' }, orderBy: { spent: 'desc' }, take: 5 }),
  ])

  const todaySpend = Number(todayExpenseAgg._sum.amount ?? 0)
  const pendingCount = pendingExpenses._count
  const pendingTotal = Number(pendingExpenses._sum.amount ?? 0)

  function fmtAmt(n: number) {
    if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2) + ' Cr'
    if (n >= 100000) return '₹' + (n / 100000).toFixed(2) + ' L'
    if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'k'
    return '₹' + n
  }

  function statusChipCls(s: string) {
    if (s === 'APPROVED') return 'bg-[#e2f3ea] text-[#0f7a45]'
    if (s === 'REJECTED') return 'bg-[#fbe6e3] text-[#c4392c]'
    return 'bg-[#fbeacb] text-[#a96c08]'
  }

  function statusLabel(s: string) {
    const map: Record<string, string> = { APPROVED: 'Approved', PENDING: 'Pending', REJECTED: 'Rejected', PAID: 'Paid' }
    return map[s] ?? s
  }

  function timeAgo(d: Date) {
    const diff = Date.now() - new Date(d).getTime()
    const hrs = Math.floor(diff / 3600000)
    if (hrs < 1) return `${Math.floor(diff / 60000)}m ago`
    if (hrs < 24) return `${hrs}h ago`
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  }

  const quickActions = [
    { href: '/sites/new', Icon: Plus, label: 'Add Site', color: 'text-[#13558e]', bg: 'bg-[#e7f0fb]' },
    { href: '/bills/upload', Icon: Upload, label: 'Upload Bill', color: 'text-[#0f7a45]', bg: 'bg-[#e2f3ea]' },
    { href: '/expenses/new', Icon: Receipt, label: 'Add Expense', color: 'text-[#b6740a]', bg: 'bg-[#fcefd4]' },
    { href: '/labour', Icon: CheckSquare, label: 'Mark Attendance', color: 'text-[#5b47b8]', bg: 'bg-[#ece8fa]' },
    { href: '/dpr', Icon: FileText, label: 'Create DPR', color: 'text-[#0369a1]', bg: 'bg-[#e0f2fe]' },
    { href: '/reports', Icon: BarChart3, label: 'Generate Report', color: 'text-[#be123c]', bg: 'bg-[#ffe4e6]' },
  ]

  const kpis = [
    { label: 'Active Sites', value: activeSitesCount, sub: 'Active this month', trend: 'up', Icon: Building2 },
    { label: "Today's Expense", value: fmtAmt(todaySpend), sub: 'Across all sites today', trend: 'up', Icon: DollarSign, featured: true },
    { label: 'Bills Pending', value: pendingCount, sub: `${fmtAmt(pendingTotal)} to approve`, trend: 'warn', Icon: Clock },
    { label: 'Labour Present', value: `${todayAttendance}/${totalLabour || '—'}`, sub: `${totalLabour > 0 ? Math.round((todayAttendance / totalLabour) * 100) : 0}% attendance`, trend: 'up', Icon: Users },
    { label: 'Salary Due', value: '—', sub: 'No run scheduled', trend: 'flat', Icon: Wallet },
    { label: 'Client Receivable', value: '—', sub: 'No overdue invoices', trend: 'flat', Icon: CreditCard },
  ]

  return (
    <>
      {/* Quick Actions */}
      <div className="flex gap-2.5 flex-wrap mb-5">
        {quickActions.map(a => (
          <Link key={a.href} href={a.href}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-[#e4eaf0] rounded-[11px] text-[13px] font-semibold text-[#16273a] shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:border-[#b0c8e0] hover:shadow-[0_3px_8px_-2px_rgba(16,40,70,0.1)] transition-all whitespace-nowrap no-underline">
            <div className={`w-[26px] h-[26px] rounded-[8px] flex items-center justify-center ${a.bg} ${a.color} flex-shrink-0`}>
              <a.Icon size={14} strokeWidth={2.2} />
            </div>
            {a.label}
          </Link>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5 mb-5">
        {kpis.map(k => (
          <div key={k.label} className={`rounded-[16px] p-4 border ${
            k.featured
              ? 'bg-gradient-to-br from-[#0d3a63] to-[#1a64a6] border-transparent text-white shadow-[0_8px_24px_-8px_rgba(13,58,99,0.5)]'
              : 'bg-white border-[#e4eaf0] shadow-[0_2px_5px_rgba(16,40,70,0.04)]'
          }`}>
            <div className={`text-[11px] font-bold uppercase tracking-[0.03em] ${k.featured ? 'text-white/70' : 'text-[#647387]'}`}>{k.label}</div>
            <div className={`text-[25px] font-black tracking-[-0.03em] mt-2.5 leading-none tabular ${k.featured ? '' : 'text-[#16273a]'}`}>{k.value}</div>
            <div className={`text-[11.5px] font-bold mt-2 flex items-center gap-1.5 ${
              k.trend === 'up' ? (k.featured ? 'text-white/85' : 'text-[#138a4e]')
              : k.trend === 'warn' ? 'text-[#e08a0b]'
              : k.featured ? 'text-white/70' : 'text-[#647387]'
            }`}>
              {k.trend === 'up' ? <TrendingUp size={12} /> : k.trend === 'warn' ? <AlertCircle size={12} /> : null}
              {k.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4 items-start">
        {/* Left: Sites table */}
        <div className="bg-white border border-[#e4eaf0] rounded-[18px] shadow-[0_2px_6px_rgba(16,40,70,0.04)]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e4eaf0]">
            <div>
              <div className="text-[15px] font-extrabold text-[#16273a] tracking-[-0.02em]">Site-wise cost summary</div>
              <div className="text-[11.5px] text-[#647387] font-semibold mt-0.5">{activeSitesCount} active sites</div>
            </div>
            <Link href="/sites" className="text-[12.5px] font-bold text-[#13558e] no-underline">View all</Link>
          </div>
          <div className="p-0">
            {sites.length === 0 ? (
              <div className="py-10 text-center text-[#647387] text-[13px]">No active sites</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr>
                    {['Site', 'Budget & Progress', 'Spend', 'Status'].map(h => (
                      <th key={h} className="text-left text-[11px] font-bold text-[#647387] uppercase tracking-[0.03em] px-4 py-3 border-b border-[#e4eaf0]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sites.map(site => {
                    const budget = Number(site.budget)
                    const spent = Number(site.spent)
                    const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : site.progress
                    const st = siteStatusChip(site.progress)
                    const barColor = pct > 80 ? 'bg-gradient-to-r from-[#d9483b] to-[#ef6f63]' : pct > 60 ? 'bg-gradient-to-r from-[#e08a0b] to-[#f3b43a]' : 'bg-gradient-to-r from-[#13558e] to-[#1d6fb5]'
                    return (
                      <tr key={site.id} className="border-b border-[#e4eaf0] last:border-0 hover:bg-[#fafbfc] transition-colors">
                        <td className="px-4 py-3">
                          <div className="text-[13.5px] font-bold text-[#16273a]">{site.name}</div>
                          <div className="text-[11px] text-[#647387] font-semibold mt-0.5">{site.location}</div>
                        </td>
                        <td className="px-4 py-3 min-w-[140px]">
                          <div className="h-[7px] bg-[#eef2f6] rounded-full overflow-hidden w-28">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="text-[11px] text-[#647387] font-semibold mt-1">
                            {budget > 0 ? `${fmtAmt(spent)} of ${fmtAmt(budget)}` : `${pct}% complete`}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[13.5px] font-extrabold text-[#16273a] tabular">{fmtAmt(spent)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-extrabold px-2 py-1 rounded-[7px] ${st.cls}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />{st.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex flex-col gap-4">
          {/* Pending Approval */}
          <div className="bg-white border border-[#e4eaf0] rounded-[18px] shadow-[0_2px_6px_rgba(16,40,70,0.04)]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e4eaf0]">
              <div>
                <div className="text-[15px] font-extrabold text-[#16273a] tracking-[-0.02em]">Pending approval</div>
                <div className="text-[11.5px] text-[#647387] font-semibold mt-0.5">{pendingCount} items · {fmtAmt(pendingTotal)}</div>
              </div>
              <Link href="/approvals" className="text-[12.5px] font-bold text-[#13558e] no-underline">Open</Link>
            </div>
            <div>
              {recentPendingExpenses.length === 0 ? (
                <div className="py-6 text-center text-[#647387] text-[13px]">No pending items</div>
              ) : recentPendingExpenses.map(e => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3 border-b border-[#e4eaf0] last:border-0">
                  <div className="w-9 h-9 rounded-[10px] bg-[#fff3e0] text-[#e07a1f] text-[11px] font-extrabold flex items-center justify-center flex-shrink-0">
                    {(e.category ?? 'EX').substring(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-[#16273a] truncate">{e.description}</div>
                    <div className="text-[11px] text-[#647387] font-semibold mt-0.5 truncate">{e.paidTo ?? e.site?.name ?? '—'} · {e.site?.name}</div>
                  </div>
                  <div className="text-[13px] font-bold text-[#16273a] tabular flex-shrink-0">{fmtAmt(Number(e.amount))}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Bills */}
          <div className="bg-white border border-[#e4eaf0] rounded-[18px] shadow-[0_2px_6px_rgba(16,40,70,0.04)]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e4eaf0]">
              <div className="text-[15px] font-extrabold text-[#16273a] tracking-[-0.02em]">Recent bill uploads</div>
              <Link href="/bills" className="text-[12.5px] font-bold text-[#13558e] no-underline">All</Link>
            </div>
            <div>
              {recentExpenses.length === 0 ? (
                <div className="py-6 text-center text-[#647387] text-[13px]">No recent bills</div>
              ) : recentExpenses.map(e => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3 border-b border-[#e4eaf0] last:border-0">
                  <div className="w-9 h-9 rounded-[10px] bg-[#f0f4f8] text-[#13558e] text-[11px] font-extrabold flex items-center justify-center flex-shrink-0">
                    {(e.category ?? 'BI').substring(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-[#16273a] truncate">{e.paidTo ?? e.description}</div>
                    <div className="text-[11px] text-[#647387] font-semibold mt-0.5 truncate">{e.category} · {timeAgo(e.createdAt)}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[13px] font-bold text-[#16273a] tabular">{fmtAmt(Number(e.amount))}</div>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-[7px] mt-1 ${statusChipCls(e.approvalStatus)}`}>
                      {statusLabel(e.approvalStatus)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
