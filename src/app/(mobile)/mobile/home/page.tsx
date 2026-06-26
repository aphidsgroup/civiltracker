import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import Link from 'next/link'
import {
  Building2, ChevronDown, Bell, Upload, Receipt, CheckSquare,
  Camera, FileEdit, AlertCircle, FileText, ArrowRight, Wallet, Users, Sparkles
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
    : '₹' + todaySpend.toLocaleString('en-IN')

  const budget = Number(activeSite?.budget ?? 0)
  const spent = Number(activeSite?.spent ?? 0)
  const budgetPct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 12 // Fallback demo %

  const startDate = activeSite?.startDate
  const targetDate = activeSite?.targetEndDate
  const dayOfProject = startDate
    ? Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000) + 1
    : 184
  const totalDays = startDate && targetDate
    ? Math.floor((new Date(targetDate).getTime() - new Date(startDate).getTime()) / 86400000)
    : 365

  const firstName = session?.user?.name?.split(' ')[0] ?? 'Engineer'
  const roleTitle = session?.user?.role?.replace(/_/g, ' ') ?? 'Site Engineer'

  return (
    <div className="space-y-6 p-4 sm:p-6 select-none">
      {/* Top Sticky Appbar */}
      <div className="flex items-center justify-between sticky top-0 z-30 bg-slate-50/95 backdrop-blur-md py-2 -mx-4 px-4 sm:-mx-6 sm:px-6 border-b border-slate-200/50">
        <div className="flex items-center gap-2.5 bg-white px-3 py-2 rounded-2xl border border-slate-200 shadow-sm max-w-[220px] active:scale-98 transition-all">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0 text-white shadow-md shadow-blue-600/20">
            <Building2 size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-extrabold text-slate-900 truncate">{activeSite?.name ?? 'Kundrathur G+1 House'}</div>
            <div className="text-[10px] text-slate-400 font-bold truncate">Madras Crafters</div>
          </div>
          <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-[11px] font-extrabold px-3 py-1.5 rounded-full border border-emerald-200/60 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Synced</span>
          </div>
          <Link
            href="/mobile/notifications"
            className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-700 relative shadow-sm hover:bg-slate-50 active:scale-95 transition-all"
          >
            <Bell size={18} />
            {pendingBillsCount > 0 && (
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 absolute top-2 right-2 border-2 border-white" />
            )}
          </Link>
        </div>
      </div>

      {/* Greeting Section */}
      <div className="flex justify-between items-start pt-1">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight m-0">
            {getGreeting()}, {firstName}
          </h1>
          <p className="text-xs font-bold text-slate-500 m-0 capitalize flex items-center gap-1.5">
            <span className="text-blue-600 font-extrabold">{roleTitle.toLowerCase()}</span>
            <span>·</span>
            <span className="truncate max-w-[180px]">{activeSite?.name ?? 'Main Site'}</span>
          </p>
        </div>
        <div className="text-right text-xs font-black text-slate-400 whitespace-nowrap pt-1">
          {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
        </div>
      </div>

      {/* Today On Site Hero Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden border border-white/10 space-y-6">
        <div className="absolute right-0 top-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex justify-between items-center relative z-10">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-blue-200 bg-white/10 px-3 py-1 rounded-full backdrop-blur-md">
            <Sparkles size={12} className="text-amber-300" />
            <span>TODAY ON SITE</span>
          </div>
          <div className="text-xs font-extrabold text-slate-300">
            Day {dayOfProject} of {totalDays}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 py-2 border-y border-white/10 relative z-10">
          <div>
            <div className="text-3xl font-black text-white tracking-tight">{todaySpendFmt}</div>
            <div className="text-xs font-semibold text-slate-300 mt-1 flex items-center gap-1">
              <Wallet size={13} className="text-blue-400" />
              <span>Today&apos;s Spend</span>
            </div>
          </div>
          <div className="border-l border-white/10 pl-4">
            <div className="text-3xl font-black text-white tracking-tight">
              {todayAttendance}<span className="text-lg font-bold text-slate-400">/{totalLabour > 0 ? totalLabour : '—'}</span>
            </div>
            <div className="text-xs font-semibold text-slate-300 mt-1 flex items-center gap-1">
              <Users size={13} className="text-emerald-400" />
              <span>Labour Present</span>
            </div>
          </div>
        </div>

        <div className="space-y-2 relative z-10">
          <div className="flex justify-between text-xs font-bold">
            <span className="text-slate-300">Budget Utilized</span>
            <span className="text-amber-300 font-mono font-black">{budgetPct}%</span>
          </div>
          <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 via-blue-400 to-amber-400 rounded-full transition-all duration-1000"
              style={{ width: `${Math.max(6, budgetPct)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Quick Actions Grid */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-400 m-0">Quick Actions</h2>
          <span className="text-[11px] font-bold text-blue-600">Within 3 taps</span>
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          <Link
            href="/mobile/add"
            className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md active:scale-95 transition-all flex items-center gap-3.5 no-underline group"
          >
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
              <Upload size={22} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-900 leading-tight">Upload Bill</div>
              <div className="text-[11px] font-medium text-slate-400 mt-0.5">Vendor invoice</div>
            </div>
          </Link>

          <Link
            href="/mobile/add-expense"
            className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md active:scale-95 transition-all flex items-center gap-3.5 no-underline group"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
              <Receipt size={22} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-900 leading-tight">Add Expense</div>
              <div className="text-[11px] font-medium text-slate-400 mt-0.5">Petty cash</div>
            </div>
          </Link>

          <Link
            href="/labour/attendance"
            className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md active:scale-95 transition-all flex items-center gap-3.5 no-underline group"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
              <CheckSquare size={22} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-900 leading-tight">Attendance</div>
              <div className="text-[11px] font-medium text-slate-400 mt-0.5">Mark workers</div>
            </div>
          </Link>

          <Link
            href="/mobile/site-photo"
            className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md active:scale-95 transition-all flex items-center gap-3.5 no-underline group"
          >
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
              <Camera size={22} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-900 leading-tight">Site Photos</div>
              <div className="text-[11px] font-medium text-slate-400 mt-0.5">Progress pic</div>
            </div>
          </Link>
        </div>
      </div>

      {/* Daily Progress Report Action Card */}
      <Link
        href="/mobile/add"
        className="block bg-slate-900 hover:bg-slate-800 active:scale-98 text-white p-5 rounded-3xl shadow-xl shadow-slate-900/15 transition-all no-underline"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/10 text-blue-400 flex items-center justify-center flex-shrink-0 backdrop-blur-md">
              <FileEdit size={24} />
            </div>
            <div>
              <div className="text-base font-black tracking-tight text-white">Daily Progress Report</div>
              <div className="flex items-center gap-1.5 text-xs text-amber-300 font-bold mt-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>Due by 7:00 PM today</span>
              </div>
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-slate-400">
            <ArrowRight size={18} />
          </div>
        </div>
      </Link>

      {/* Recent Bill Uploads Feed */}
      <div className="space-y-3 pt-2">
        <div className="flex justify-between items-center px-1">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-400 m-0">Recent Bill Uploads</h2>
          <Link href="/mobile/reports" className="text-xs font-extrabold text-blue-600 no-underline">View all</Link>
        </div>

        {recentExpenses.length > 0 ? (
          <div className="space-y-2.5">
            {recentExpenses.slice(0, 3).map(exp => (
              <div key={exp.id} className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600 flex-shrink-0 font-bold">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">{exp.description}</div>
                    <div className="text-[10px] text-slate-400 font-medium truncate">{exp.paidTo ?? 'Vendor'}</div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <div className="text-xs font-black text-slate-900">₹{Number(exp.amount).toLocaleString('en-IN')}</div>
                  <div className="text-[10px] font-extrabold text-amber-600 uppercase mt-0.5">{exp.approvalStatus}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-10 text-center border border-slate-200 shadow-sm">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <div className="text-xs font-bold text-slate-400">No uploads yet today</div>
          </div>
        )}
      </div>
    </div>
  )
}
