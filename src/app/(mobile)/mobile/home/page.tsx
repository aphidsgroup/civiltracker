import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import Link from 'next/link'
import {
  Building2, ChevronDown, Bell, Upload, Receipt, CheckSquare,
  Camera, FileEdit, AlertCircle, FileText
} from 'lucide-react'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default async function MobileHome() {
  const session = await auth()
  const companyId = session?.user?.companyId
  const userId = session?.user?.id

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayEnd = new Date(today)
  todayEnd.setHours(23, 59, 59, 999)

  const member = await prisma.companyMember.findFirst({
    where: { userId, companyId },
  })
  const siteIds = member?.siteIds ?? []

  const activeSite = siteIds.length > 0
    ? await prisma.site.findFirst({ where: { id: { in: siteIds }, companyId } })
    : await prisma.site.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' } })

  const siteId = activeSite?.id

  const [
    todayExpenseAgg,
    pendingBillsCount,
    todayAttendance,
    totalLabour,
    todayPhotos,
    pendingApprovals,
    recentExpenses,
  ] = await Promise.all([
    siteId ? prisma.expense.aggregate({
      where: { siteId, createdAt: { gte: today, lte: todayEnd } },
      _sum: { amount: true },
    }) : Promise.resolve({ _sum: { amount: null } }),

    siteId ? prisma.expense.count({
      where: { siteId, approvalStatus: 'PENDING' },
    }) : Promise.resolve(0),

    siteId ? prisma.labourAttendance.count({
      where: { siteId, date: { gte: today, lte: todayEnd }, status: 'PRESENT' },
    }) : Promise.resolve(0),

    siteId ? prisma.labour.count({ where: { siteId, isActive: true } }) : Promise.resolve(0),

    siteId ? prisma.sitePhoto.count({
      where: { siteId, createdAt: { gte: today, lte: todayEnd } },
    }) : Promise.resolve(0),

    siteId ? prisma.expense.findMany({
      where: { siteId, approvalStatus: 'PENDING', createdById: userId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, description: true, amount: true, paidTo: true, createdAt: true, category: true },
    }) : Promise.resolve([]),

    siteId ? prisma.expense.findMany({
      where: { siteId },
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: { id: true, description: true, amount: true, paidTo: true, approvalStatus: true, createdAt: true, category: true },
    }) : Promise.resolve([]),
  ])

  const todaySpend = Number(todayExpenseAgg._sum.amount ?? 0)
  const todaySpendFmt = todaySpend >= 100000
    ? '₹' + (todaySpend / 100000).toFixed(1) + 'L'
    : todaySpend >= 1000
    ? '₹' + (todaySpend / 1000).toFixed(1) + 'k'
    : '₹' + todaySpend

  const budget = Number(activeSite?.budget ?? 0)
  const spent = Number(activeSite?.spent ?? 0)
  const budgetPct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0

  const startDate = activeSite?.startDate
  const targetDate = activeSite?.targetEndDate
  const dayOfProject = startDate
    ? Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000) + 1
    : null
  const totalDays = startDate && targetDate
    ? Math.floor((new Date(targetDate).getTime() - new Date(startDate).getTime()) / 86400000)
    : null

  function fmtAmt(n: number) {
    return '₹' + n.toLocaleString('en-IN')
  }

  function statusChipCls(s: string) {
    if (s === 'APPROVED') return 'bg-[#e2f3ea] text-[#0f7a45]'
    if (s === 'REJECTED') return 'bg-[#fbe6e3] text-[#c4392c]'
    return 'bg-[#fbeacb] text-[#a96c08]'
  }

  function statusLabel(s: string) {
    if (s === 'APPROVED') return 'Approved'
    if (s === 'REJECTED') return 'Rejected'
    if (s === 'PENDING') return 'Pending'
    return s
  }

  function timeAgo(d: Date) {
    const diff = Date.now() - new Date(d).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `Today ${new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  }

  const firstName = session?.user?.name?.split(' ')[0] ?? 'there'

  return (
    <>
      {/* APPBAR */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#f2f5f8] sticky top-0 z-20">
        <div className="flex items-center gap-2.5 bg-white px-3 py-1.5 rounded-[14px] border border-[#e4eaf0] shadow-sm max-w-[210px]">
          <div className="w-8 h-8 rounded-[9px] bg-[#13558e] flex items-center justify-center flex-shrink-0 text-white">
            <Building2 size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-[#16273a] truncate">{activeSite?.name ?? 'No Site'}</div>
            <div className="text-[11px] text-[#647387] truncate">Madras Crafters</div>
          </div>
          <ChevronDown size={14} className="text-[#647387] flex-shrink-0 ml-1" />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-[#e2f3ea] text-[#0f7a45] text-[11px] font-bold px-2.5 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            Synced
          </div>
          <Link href="/mobile/notifications" className="w-9 h-9 bg-white border border-[#e4eaf0] rounded-full flex items-center justify-center text-[#16273a] relative shadow-sm">
            <Bell size={18} />
            {pendingBillsCount > 0 && <span className="w-2 h-2 rounded-full bg-[#e53935] absolute top-2 right-2" />}
          </Link>
        </div>
      </div>

      {/* GREETING */}
      <div className="flex justify-between items-end px-4 pt-2 pb-3">
        <div>
          <div className="text-[18px] font-black text-[#16273a] tracking-tight">{getGreeting()}, {firstName}</div>
          <div className="text-[12.5px] font-semibold text-[#647387] mt-0.5 capitalize">
            {session?.user?.role?.replace(/_/g, ' ').toLowerCase()} · {activeSite?.name ?? '—'}
          </div>
        </div>
        <div className="text-right text-[12px] font-bold text-[#647387]">
          {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
        </div>
      </div>

      {/* TODAY ON SITE CARD */}
      <div className="mx-4 mb-5 p-4 rounded-[20px] bg-gradient-to-br from-[#0d3a63] to-[#1a64a6] text-white shadow-[0_10px_25px_-5px_rgba(13,58,99,0.4)]">
        <div className="flex justify-between items-center mb-3">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-white/70">TODAY ON SITE</div>
          {dayOfProject && totalDays && (
            <div className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-white/15 text-white backdrop-blur-sm">
              Day {dayOfProject} of {totalDays}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between py-2 divide-x divide-white/15">
          <div className="pr-4 flex-1">
            <div className="text-[22px] font-black leading-none tracking-tight">{todaySpendFmt}</div>
            <div className="text-[11.5px] text-white/75 mt-1 font-medium">Today&apos;s spend</div>
          </div>
          <div className="px-4 flex-1">
            <div className="text-[22px] font-black leading-none tracking-tight">{todayAttendance}/{totalLabour || '—'}</div>
            <div className="text-[11.5px] text-white/75 mt-1 font-medium">Labour present</div>
          </div>
          {pendingBillsCount > 0 && (
            <div className="pl-4 flex-1">
              <div className="text-[22px] font-black leading-none tracking-tight text-[#ffd166]">{pendingBillsCount}</div>
              <div className="text-[11.5px] text-white/75 mt-1 font-medium">Bills pending</div>
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-white/15">
          <div className="flex justify-between text-[11px] font-bold mb-1.5 text-white/85">
            <span>Budget utilized</span>
            <span>{budgetPct}%</span>
          </div>
          <div className="h-1.5 bg-black/25 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#4ade80] to-[#22c55e] rounded-full" style={{ width: `${budgetPct}%` }} />
          </div>
        </div>
      </div>

      {/* QUICK ACTIONS */}
      <div className="flex justify-between items-center px-4 mb-2.5">
        <div className="text-[15px] font-extrabold text-[#16273a] tracking-tight">Quick Actions</div>
        <div className="text-[11.5px] font-bold text-[#13558e]">Within 3 taps</div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 mb-4">
        <Link href="/mobile/upload-bill" className="flex items-center gap-3 p-3.5 rounded-[16px] bg-white border border-[#e4eaf0] shadow-sm active:scale-[0.98] transition-transform">
          <div className="w-10 h-10 rounded-[12px] bg-[#e7f0fb] text-[#13558e] flex items-center justify-center flex-shrink-0">
            <Upload size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-bold text-[#16273a] truncate">Upload Bill</div>
            <div className="text-[11px] font-medium text-[#647387] truncate">
              {pendingBillsCount > 0 ? `${pendingBillsCount} pending` : 'Vendor invoice'}
            </div>
          </div>
        </Link>

        <Link href="/mobile/add-expense" className="flex items-center gap-3 p-3.5 rounded-[16px] bg-white border border-[#e4eaf0] shadow-sm active:scale-[0.98] transition-transform">
          <div className="w-10 h-10 rounded-[12px] bg-[#fcefd4] text-[#b6740a] flex items-center justify-center flex-shrink-0">
            <Receipt size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-bold text-[#16273a] truncate">Add Expense</div>
            <div className="text-[11px] font-medium text-[#647387] truncate">
              {todaySpend > 0 ? `${todaySpendFmt} today` : 'Petty cash'}
            </div>
          </div>
        </Link>

        <Link href="/mobile/attendance" className="flex items-center gap-3 p-3.5 rounded-[16px] bg-white border border-[#e4eaf0] shadow-sm active:scale-[0.98] transition-transform relative overflow-hidden">
          <div className="w-10 h-10 rounded-[12px] bg-[#e2f3ea] text-[#0f7a45] flex items-center justify-center flex-shrink-0">
            <CheckSquare size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-bold text-[#16273a] truncate">Attendance</div>
            <div className="text-[11px] font-medium text-[#647387] truncate">
              {totalLabour > 0 ? `${todayAttendance}/${totalLabour} marked` : 'Mark workers'}
            </div>
          </div>
          {todayAttendance === 0 && totalLabour > 0 && (
            <span className="w-2 h-2 rounded-full bg-[#e53935] absolute top-3 right-3 animate-ping" />
          )}
        </Link>

        <Link href="/mobile/site-photo" className="flex items-center gap-3 p-3.5 rounded-[16px] bg-white border border-[#e4eaf0] shadow-sm active:scale-[0.98] transition-transform">
          <div className="w-10 h-10 rounded-[12px] bg-[#ece8fa] text-[#5b47b8] flex items-center justify-center flex-shrink-0">
            <Camera size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-bold text-[#16273a] truncate">Site Photos</div>
            <div className="text-[11px] font-medium text-[#647387] truncate">
              {todayPhotos > 0 ? `${todayPhotos} uploaded` : 'Progress pic'}
            </div>
          </div>
        </Link>
      </div>

      {/* DAILY SITE REPORT BANNER */}
      <Link href="/mobile/dpr" className="flex items-center gap-3 mx-4 mb-5 p-4 rounded-[18px] bg-gradient-to-r from-[#1e293b] to-[#334155] text-white shadow-md active:scale-[0.99] transition-transform">
        <div className="w-11 h-11 rounded-[14px] bg-white/10 flex items-center justify-center text-[#38bdf8] flex-shrink-0">
          <FileText size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-extrabold tracking-tight">Daily Progress Report</div>
          <div className="text-[11.5px] text-slate-300 font-medium flex items-center gap-1.5 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-[#f59e0b] animate-pulse" />
            Due by 7:00 PM today
          </div>
        </div>
        <FileEdit size={18} className="text-white/60 ml-2 flex-shrink-0" />
      </Link>

      {/* PENDING YOUR APPROVAL */}
      {pendingApprovals.length > 0 && (
        <div className="mb-5">
          <div className="flex justify-between items-center px-4 mb-2.5">
            <div className="text-[15px] font-extrabold text-[#16273a] tracking-tight">Pending your approval</div>
            <Link href="/mobile/approvals" className="text-[12px] font-bold text-[#13558e]">See all</Link>
          </div>
          <div className="flex flex-col gap-2.5 px-4">
            {pendingApprovals.map(a => (
              <div key={a.id} className="flex items-center gap-3 p-3.5 bg-white rounded-[16px] border border-[#e4eaf0] shadow-sm">
                <div className="w-10 h-10 rounded-[12px] bg-[#fff3e0] text-[#e07a1f] flex items-center justify-center flex-shrink-0 font-black text-xs">
                  {(a.category ?? 'EX').substring(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-bold text-[#16273a] truncate">{a.description}</div>
                  <div className="text-[11px] font-medium text-[#647387] mt-0.5 truncate">{a.paidTo ?? a.category}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[14px] font-extrabold text-[#16273a] tabular">{fmtAmt(Number(a.amount))}</div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#e07a1f] bg-[#fff3e0] px-2 py-0.5 rounded-full mt-1">
                    <AlertCircle size={10} /> Pending
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RECENT BILL UPLOADS */}
      <div className="mb-20">
        <div className="flex justify-between items-center px-4 mb-2.5">
          <div className="text-[15px] font-extrabold text-[#16273a] tracking-tight">Recent bill uploads</div>
          <Link href="/mobile/upload-bill" className="text-[12px] font-bold text-[#13558e]">View all</Link>
        </div>
        <div className="flex flex-col gap-2.5 px-4">
          {recentExpenses.length === 0 ? (
            <div className="py-8 text-center text-[#647387] bg-white rounded-[16px] border border-[#e4eaf0] text-[13px]">
              No uploads yet today
            </div>
          ) : recentExpenses.map(e => (
            <div key={e.id} className="flex items-center gap-3 p-3.5 bg-white rounded-[16px] border border-[#e4eaf0] shadow-sm">
              <div className="w-10 h-10 rounded-[12px] bg-[#f0f4f8] text-[#13558e] flex items-center justify-center flex-shrink-0 font-black text-xs">
                {(e.category ?? 'BI').substring(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-bold text-[#16273a] truncate">{e.paidTo ?? e.description}</div>
                <div className="text-[11px] font-medium text-[#647387] mt-0.5 truncate">{e.category} · {timeAgo(e.createdAt)}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[14px] font-extrabold text-[#16273a] tabular">{fmtAmt(Number(e.amount))}</div>
                <span className={`inline-flex items-center text-[10px] font-extrabold px-2 py-0.5 rounded-full mt-1 ${statusChipCls(e.approvalStatus)}`}>
                  {statusLabel(e.approvalStatus)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
