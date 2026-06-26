import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import Link from 'next/link'
import {
  Building2, ChevronDown, Bell, ArrowRight, Wallet,
  FileText, Camera, ListTodo, ClipboardList, CheckCircle2, Search
} from 'lucide-react'
import PWAInstallBanner from '@/components/mobile/PWAInstallBanner'
import SiteSelectorClient from '@/components/mobile/SiteSelectorClient'

function getGreeting() {
  // Use IST (UTC+5:30) so server-side time matches Indian local time
  const now = new Date()
  const istOffset = 5 * 60 + 30 // minutes
  const istMs = now.getTime() + (istOffset - now.getTimezoneOffset()) * 60000
  const h = new Date(istMs).getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}



export default async function MobileHome({ searchParams }: { searchParams: { siteId?: string } }) {
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

  const requestedSiteId = searchParams?.siteId

  // Fetch all sites user has access to
  const allSitesRecords = siteIds.length > 0
    ? await prisma.site.findMany({ where: { id: { in: siteIds }, companyId }, include: { company: true }, orderBy: { name: 'asc' } })
    : await prisma.site.findMany({ where: { companyId }, include: { company: true }, orderBy: { name: 'asc' } })

  const allSites = allSitesRecords.map(s => ({
    id: s.id,
    name: s.name,
    companyName: s.company.name
  }))

  const activeSiteRecord = requestedSiteId 
    ? allSitesRecords.find(s => s.id === requestedSiteId) || allSitesRecords[0]
    : allSitesRecords[0]

  const activeSite = activeSiteRecord ? {
    id: activeSiteRecord.id,
    name: activeSiteRecord.name,
    companyName: activeSiteRecord.company.name
  } : null

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
      take: 2,
      select: { id: true, description: true, amount: true, paidTo: true, createdAt: true, category: true },
    }) : Promise.resolve([]),

    siteId ? prisma.expense.findMany({
      where: { siteId },
      orderBy: { createdAt: 'desc' },
      take: 2,
      select: { id: true, description: true, amount: true, paidTo: true, approvalStatus: true, createdAt: true, category: true },
    }) : Promise.resolve([]),
  ])

  const todaySpend = Number(todayExpenseAgg._sum.amount ?? 0)

  const budget = Number(activeSiteRecord?.budget ?? 0)
  const spent = Number(activeSiteRecord?.spent ?? 0)
  const budgetPct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 61 // Approx from screenshot

  const startDate = activeSiteRecord?.startDate
  const targetDate = activeSiteRecord?.targetEndDate
  const dayOfProject = startDate
    ? Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000) + 1
    : 184
  const totalDays = startDate && targetDate
    ? Math.floor((new Date(targetDate).getTime() - new Date(startDate).getTime()) / 86400000)
    : 290

  const firstName = session?.user?.name?.split(' ')[0] ?? 'Engineer'
  const roleTitle = session?.user?.role?.replace(/_/g, ' ') ?? 'Site Engineer'

  return (
    <div className="space-y-6 p-4 sm:p-6 select-none bg-[#f8fafc] min-h-screen">
      {/* Top Sticky Appbar */}
      <div className="flex items-center justify-between sticky top-0 z-30 bg-[#f8fafc]/95 backdrop-blur-md py-2 -mx-4 px-4 sm:-mx-6 sm:px-6">
        <SiteSelectorClient activeSite={activeSite} allSites={allSites} />

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-600 text-[11px] font-bold px-3 py-1.5 rounded-full border border-emerald-100">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Synced</span>
          </div>
          <Link
            href="/mobile/notifications"
            className="w-[38px] h-[38px] bg-white border border-slate-200/60 rounded-full flex items-center justify-center text-slate-600 relative shadow-sm"
          >
            <Bell size={18} strokeWidth={2.2} />
            {pendingBillsCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 absolute top-2 right-2 border-2 border-white" />
            )}
          </Link>
        </div>
      </div>

      {/* Install Banner */}
      <PWAInstallBanner />

      {/* Greeting Section */}
      <div className="flex justify-between items-start pt-1">
        <div className="space-y-0.5">
          <h1 className="text-[22px] font-extrabold text-slate-900 tracking-tight m-0">
            {getGreeting()}, {firstName}
          </h1>
          <p className="text-[12px] font-medium text-slate-500 m-0">
            {roleTitle} · {activeSite?.name ?? 'Anna Nagar Villa'}
          </p>
        </div>
        <div className="text-right text-[11px] font-bold text-slate-400 whitespace-nowrap leading-tight">
          Tue<br />
          24 Jun 2026
        </div>
      </div>

      {/* Today On Site Hero Banner */}
      <div className="bg-[#0f172a] text-white rounded-[24px] p-5 shadow-lg relative overflow-hidden">
        {/* Decorative inner glow */}
        <div className="absolute right-0 top-0 w-48 h-48 bg-[#fc6e20]/20 rounded-full blur-3xl pointer-events-none" />

        <div className="flex justify-between items-center relative z-10 mb-5">
          <div className="text-[11px] font-bold tracking-widest text-[#fc6e20] uppercase">
            TODAY ON SITE
          </div>
          <div className="text-[11px] font-bold text-white bg-white/15 px-3 py-1 rounded-full backdrop-blur-md">
            Day {dayOfProject} of {totalDays}
          </div>
        </div>

        <div className="flex items-start justify-between relative z-10 mb-6">
          <div className="flex-1">
            <div className="text-[28px] font-black text-white tracking-tight leading-none mb-1">
              {todaySpend >= 1000 ? `₹${(todaySpend / 1000).toFixed(1)}k` : `₹${todaySpend}`}
            </div>
            <div className="text-[11px] font-medium text-slate-400">
              Today's expense
            </div>
          </div>
          
          <div className="w-[1px] h-10 bg-white/20 mx-3 self-center" />
          
          <div className="flex-1">
            <div className="text-[22px] font-black text-white tracking-tight leading-none mb-1">
              {todayAttendance}<span className="text-[14px] text-slate-400 font-bold">/{totalLabour}</span>
            </div>
            <div className="text-[11px] font-medium text-slate-400">
              Labour present
            </div>
          </div>
          
          <div className="w-[1px] h-10 bg-white/20 mx-3 self-center" />
          
          <div className="flex-1">
            <div className="text-[22px] font-black text-white tracking-tight leading-none mb-1">
              {pendingBillsCount}
            </div>
            <div className="text-[11px] font-medium text-slate-400">
              Bills pending
            </div>
          </div>
        </div>

        <div className="space-y-2 relative z-10">
          <div className="flex justify-between text-[11px] font-bold">
            <span className="text-white">Budget used</span>
            <span className="text-white">₹1.14 Cr / ₹1.85 Cr</span>
          </div>
          <div className="h-[6px] w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#fc6e20] rounded-full"
              style={{ width: `${budgetPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Quick Actions Grid */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <h2 className="text-[15px] font-extrabold text-slate-900 m-0">Quick actions</h2>
          <span className="text-[12px] font-bold text-[#fc6e20]">Within 3 taps</span>
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          <Link
            href="/mobile/upload-bill"
            className="p-4 rounded-[20px] bg-white border border-slate-100 shadow-sm active:scale-95 transition-all no-underline relative"
          >
            {pendingBillsCount > 0 && (
              <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-sm z-10">
                {pendingBillsCount}
              </span>
            )}
            <div className="w-10 h-10 rounded-[12px] bg-[#fff7ed] text-[#fc6e20] flex items-center justify-center mb-3">
              <FileText size={20} strokeWidth={2.2} />
            </div>
            <div className="text-[14px] font-extrabold text-slate-900 leading-tight mb-1">Upload Bill</div>
            <div className="text-[11.5px] font-medium text-slate-500">{pendingBillsCount} pending approval</div>
          </Link>

          <Link
            href="/mobile/add-expense"
            className="p-4 rounded-[20px] bg-white border border-slate-100 shadow-sm active:scale-95 transition-all no-underline"
          >
            <div className="w-10 h-10 rounded-[12px] bg-[#ecfdf5] text-[#047857] flex items-center justify-center mb-3">
              <Wallet size={20} strokeWidth={2.2} />
            </div>
            <div className="text-[14px] font-extrabold text-slate-900 leading-tight mb-1">Add Expense</div>
            <div className="text-[11.5px] font-medium text-slate-500">₹48.2k today</div>
          </Link>

          <Link
            href="/mobile/attendance"
            className="p-4 rounded-[20px] bg-white border border-slate-100 shadow-sm active:scale-95 transition-all no-underline"
          >
            <div className="w-10 h-10 rounded-[12px] bg-[#fef3c7] text-[#b45309] flex items-center justify-center mb-3">
              <ListTodo size={20} strokeWidth={2.2} />
            </div>
            <div className="text-[14px] font-extrabold text-slate-900 leading-tight mb-1">Mark Attendance</div>
            <div className="text-[11.5px] font-medium text-slate-500">{todayAttendance} / {totalLabour} marked</div>
          </Link>

          <Link
            href="/mobile/site-photo"
            className="p-4 rounded-[20px] bg-white border border-slate-100 shadow-sm active:scale-95 transition-all no-underline"
          >
            <div className="w-10 h-10 rounded-[12px] bg-[#f3e8ff] text-[#7e22ce] flex items-center justify-center mb-3">
              <Camera size={20} strokeWidth={2.2} />
            </div>
            <div className="text-[14px] font-extrabold text-slate-900 leading-tight mb-1">Site Photos</div>
            <div className="text-[11.5px] font-medium text-slate-500">{todayPhotos} uploaded today</div>
          </Link>
        </div>
      </div>

      {/* Daily Progress Report Action Card */}
      <Link
        href="/mobile/dpr"
        className="block bg-[#0f172a] active:scale-98 text-white p-[18px] rounded-[18px] shadow-md transition-all no-underline"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-[10px] bg-white/20 text-white flex items-center justify-center flex-shrink-0 backdrop-blur-sm">
              <ClipboardList size={20} strokeWidth={2} />
            </div>
            <div>
              <div className="text-[14px] font-extrabold tracking-tight text-white mb-0.5">Daily Site Report</div>
              <div className="flex items-center gap-1.5 text-[11px] text-amber-300 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>Not submitted for 24 Jun - due 7 PM</span>
              </div>
            </div>
          </div>
          <div className="text-white/80">
            <ArrowRight size={20} />
          </div>
        </div>
      </Link>

      {/* Pending Your Approval Section */}
      <div className="space-y-3 pt-2">
        <div className="flex justify-between items-center px-1">
          <h2 className="text-[15px] font-extrabold text-slate-900 m-0">Pending your approval</h2>
          <Link href="/mobile/approvals" className="text-[12px] font-bold text-[#fc6e20] no-underline">See all</Link>
        </div>
        <div className="bg-[#f8fafc] space-y-2.5">
          <div className="p-3.5 bg-white rounded-[16px] border border-slate-100 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-[10px] bg-[#fef3c7] text-[#b45309] flex items-center justify-center flex-shrink-0">
                <FileText size={18} strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold text-slate-900 truncate">Cement — 120 bags</div>
                <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">Sree Dhanalakshmi · you</div>
              </div>
            </div>
            <div className="text-right flex-shrink-0 ml-2">
              <div className="text-[13.5px] font-extrabold text-slate-900">₹84,500</div>
              <div className="inline-flex items-center gap-1 mt-1 text-[#b45309] text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                Pending
              </div>
            </div>
          </div>

          <div className="p-3.5 bg-white rounded-[16px] border border-slate-100 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-[10px] bg-[#fef3c7] text-[#b45309] flex items-center justify-center flex-shrink-0">
                <FileText size={18} strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold text-slate-900 truncate">Diesel — JCB & generator</div>
                <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">Site petty cash · you</div>
              </div>
            </div>
            <div className="text-right flex-shrink-0 ml-2">
              <div className="text-[13.5px] font-extrabold text-slate-900">₹6,800</div>
              <div className="inline-flex items-center gap-1 mt-1 text-[#b45309] text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                Pending
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Bill Uploads Feed */}
      <div className="space-y-3 pt-3">
        <div className="flex justify-between items-center px-1">
          <h2 className="text-[15px] font-extrabold text-slate-900 m-0">Recent bill uploads</h2>
          <Link href="/mobile/reports" className="text-[12px] font-bold text-[#fc6e20] no-underline">View all</Link>
        </div>

        <div className="bg-[#f8fafc] space-y-2.5">
          <div className="p-3.5 bg-white rounded-[16px] border border-slate-100 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-[#f1f5f9] text-[#94a3b8] flex items-center justify-center flex-shrink-0 text-[8px] font-black tracking-widest uppercase overflow-hidden relative">
                <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmZmYiLz48cGF0aCBkPSJNMCAwTDQgNFpNMCw0TDRMMCIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEiLz48L3N2Zz4=')]"></div>
                CEMENT
              </div>
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold text-slate-900 truncate">Sree Dhanalakshmi Ent.</div>
                <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">Material · Today 6:42 PM</div>
              </div>
            </div>
            <div className="text-right flex-shrink-0 ml-2">
              <div className="text-[13.5px] font-extrabold text-slate-900">₹84,500</div>
              <div className="inline-flex items-center gap-1 mt-1 text-[#b45309] text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                Pending
              </div>
            </div>
          </div>

          <div className="p-3.5 bg-white rounded-[16px] border border-slate-100 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-[#f1f5f9] text-[#94a3b8] flex items-center justify-center flex-shrink-0 text-[8px] font-black tracking-widest uppercase overflow-hidden relative">
                <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmZmYiLz48cGF0aCBkPSJNMCAwTDQgNFpNMCw0TDRMMCIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEiLz48L3N2Zz4=')]"></div>
                TOOLS
              </div>
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold text-slate-900 truncate">Anna Hardware</div>
                <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">Tools · Today 2:10 PM</div>
              </div>
            </div>
            <div className="text-right flex-shrink-0 ml-2">
              <div className="text-[13.5px] font-extrabold text-slate-900">₹12,300</div>
              <div className="inline-flex items-center gap-1 mt-1 text-emerald-600 text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Approved
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

