import prisma from '@/lib/prisma'
import { exitDeniedPage, liveCompanySiteWhere, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'
import Link from 'next/link'
import {
  Building2, ChevronDown, Bell, ArrowRight, Wallet,
  FileText, Camera, ListTodo, ClipboardList, CheckCircle2, Search, IndianRupee
} from 'lucide-react'
import PWAInstallBanner from '@/components/mobile/PWAInstallBanner'
import SiteSelectorClient from '@/components/mobile/SiteSelectorClient'
import LiveClock from '@/components/ui/LiveClock'

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



export default async function MobileHome({ searchParams }: { searchParams: Promise<{ siteId?: string }> }) {
  const gate = await resolveTenantPageAccess({ grants: [{ permission: 'sites.view', module: 'SITES' }] })
  if (gate.status === 'denied') exitDeniedPage(gate, '/mobile/home')
  const { user, companyId, can, moduleEnabled } = gate.access
  const userId = user.id
  const companyName = user.companyName ?? ''

  // Each tile is read only for a live role holding its permission with the module on.
  const show = {
    siteExpenses: can('expenses.view') && moduleEnabled('EXPENSES'),
    ownExpenses: (can('expenses.view') || can('expenses.create')) && moduleEnabled('EXPENSES'),
    labour: (can('labour.view') || can('attendance.mark')) && moduleEnabled('LABOUR'),
    advances: can('payments.view') || (can('reports.clientReceivable') && moduleEnabled('REPORTS')),
    dpr: can('dpr.view') && moduleEnabled('DPR'),
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayEnd = new Date(today)
  todayEnd.setHours(23, 59, 59, 999)

  const member = await prisma.companyMember.findFirst({
    where: { userId, companyId, isActive: true },
    select: { siteIds: true },
  })
  const siteIds = member?.siteIds ?? []

  const resolvedParams = await searchParams
  const requestedSiteId = resolvedParams?.siteId

  // Assigned sites are narrowed to live, active sites of exactly this company; a stale
  // assignment to another tenant's or a deleted site simply drops out.
  const allSitesRecords = await prisma.site.findMany({
    where: { ...liveCompanySiteWhere(companyId), status: 'ACTIVE', ...(siteIds.length > 0 ? { id: { in: siteIds } } : {}) },
    orderBy: { name: 'asc' },
  })

  const allSites = allSitesRecords.map(s => ({
    id: s.id,
    name: s.name,
    companyName,
  }))

  const activeSiteRecord = requestedSiteId
    ? allSitesRecords.find(s => s.id === requestedSiteId) || allSitesRecords[0]
    : allSitesRecords[0]

  const activeSite = activeSiteRecord ? {
    id: activeSiteRecord.id,
    name: activeSiteRecord.name,
    companyName,
  } : null

  const siteId = activeSite?.id
  const onSite = siteId ? { siteId, companyId } : null

  const [
    todayExpenseAgg,
    pendingBillsCount,
    todayAttendance,
    totalLabour,
    todayPhotos,
    pendingApprovals,
    recentExpenses,
    clientAdvancesAgg,
    todayDpr,
  ] = await Promise.all([
    onSite && show.siteExpenses ? prisma.expense.aggregate({
      where: { ...onSite, deletedAt: null, createdAt: { gte: today, lte: todayEnd } },
      _sum: { amount: true },
    }) : Promise.resolve({ _sum: { amount: null } }),

    onSite && show.siteExpenses ? prisma.expense.count({
      where: { ...onSite, deletedAt: null, approvalStatus: 'PENDING' },
    }) : Promise.resolve(0),

    // Attendance rows carry no company column; the site was bound to the company above.
    onSite && show.labour ? prisma.labourAttendance.count({
      where: { siteId: onSite.siteId, date: { gte: today, lte: todayEnd }, status: 'PRESENT' },
    }) : Promise.resolve(0),

    onSite && show.labour ? prisma.labour.count({ where: { ...onSite, isActive: true } }) : Promise.resolve(0),

    onSite ? prisma.sitePhoto.count({
      where: { ...onSite, createdAt: { gte: today, lte: todayEnd } },
    }) : Promise.resolve(0),

    onSite && show.ownExpenses ? prisma.expense.findMany({
      where: { ...onSite, deletedAt: null, approvalStatus: 'PENDING', createdById: userId },
      orderBy: { createdAt: 'desc' },
      take: 2,
      select: { id: true, description: true, amount: true, paidTo: true, createdAt: true, category: true },
    }) : Promise.resolve([]),

    onSite && show.siteExpenses ? prisma.expense.findMany({
      where: { ...onSite, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 2,
      select: { id: true, description: true, amount: true, paidTo: true, approvalStatus: true, createdAt: true, category: true },
    }) : Promise.resolve([]),

    onSite && show.advances ? prisma.payment.aggregate({
      where: { ...onSite, type: 'ADVANCE' },
      _sum: { amount: true },
    }) : Promise.resolve({ _sum: { amount: null } }),

    onSite && show.dpr ? prisma.dailyProgressReport.findFirst({
      where: { ...onSite, date: { gte: today, lte: todayEnd } }
    }) : Promise.resolve(null),
  ])

  const todaySpend = Number(todayExpenseAgg._sum.amount ?? 0)
  const totalAdvances = Number(clientAdvancesAgg._sum.amount ?? 0)
  const now = new Date()

  const budget = Number(activeSiteRecord?.budget ?? 0)
  const spent = Number(activeSiteRecord?.spent ?? 0)
  const budgetPct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0

  const startDate = activeSiteRecord?.startDate
  const targetDate = activeSiteRecord?.targetEndDate
  const dayOfProject = startDate
    ? Math.floor((now.getTime() - new Date(startDate).getTime()) / 86400000) + 1
    : null
  const totalDays = startDate && targetDate
    ? Math.floor((new Date(targetDate).getTime() - new Date(startDate).getTime()) / 86400000)
    : null

  const firstName = user.name?.split(' ')[0] || 'Engineer'
  const roleTitle = user.role.replace(/_/g, ' ')


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
            {roleTitle} {activeSite?.name ? `· ${activeSite.name}` : ''}
          </p>
        </div>
        <div className="text-right text-[11px] font-bold text-slate-400 whitespace-nowrap leading-tight">
          <LiveClock showDate={true} showTime={false} compact={true} />
          <br />
          <LiveClock showDate={false} showTime={true} compact={true} />
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
            {dayOfProject && totalDays ? `Day ${dayOfProject} of ${totalDays}` : 'Day N/A'}
          </div>
        </div>

        <div className="flex items-start justify-between relative z-10 mb-6">
          <div className="flex-1">
            <div className="text-[28px] font-black text-white tracking-tight leading-none mb-1">
              {todaySpend >= 1000 ? `₹${(todaySpend / 1000).toFixed(1)}k` : `₹${todaySpend}`}
            </div>
            <div className="text-[11px] font-medium text-slate-400">
              Today&apos;s expense
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
            <span className="text-white">
              {budget > 0 
                ? (budget >= 10000000 ? `₹${(spent/10000000).toFixed(2)} Cr / ₹${(budget/10000000).toFixed(2)} Cr` : `₹${(spent/100000).toFixed(1)} L / ₹${(budget/100000).toFixed(1)} L`) 
                : 'No budget set'}
            </span>
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
            href={siteId ? `/mobile/upload-bill?siteId=${siteId}` : "/mobile/upload-bill"}
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
            href={siteId ? `/mobile/add-expense?siteId=${siteId}` : "/mobile/add-expense"}
            className="p-4 rounded-[20px] bg-white border border-slate-100 shadow-sm active:scale-95 transition-all no-underline"
          >
            <div className="w-10 h-10 rounded-[12px] bg-[#ecfdf5] text-[#047857] flex items-center justify-center mb-3">
              <Wallet size={20} strokeWidth={2.2} />
            </div>
            <div className="text-[14px] font-extrabold text-slate-900 leading-tight mb-1">Add Expense</div>
            <div className="text-[11.5px] font-medium text-slate-500">
              {todaySpend >= 1000 ? `₹${(todaySpend / 1000).toFixed(1)}k today` : (todaySpend > 0 ? `₹${todaySpend} today` : 'No expenses today')}
            </div>
          </Link>

          <Link
            href={siteId ? `/mobile/attendance?siteId=${siteId}` : "/mobile/attendance"}
            className="p-4 rounded-[20px] bg-white border border-slate-100 shadow-sm active:scale-95 transition-all no-underline"
          >
            <div className="w-10 h-10 rounded-[12px] bg-[#fef3c7] text-[#b45309] flex items-center justify-center mb-3">
              <ListTodo size={20} strokeWidth={2.2} />
            </div>
            <div className="text-[14px] font-extrabold text-slate-900 leading-tight mb-1">Mark Attendance</div>
            <div className="text-[11.5px] font-medium text-slate-500">{todayAttendance} / {totalLabour} marked</div>
          </Link>

          <Link
            href={siteId ? `/mobile/site-photo?siteId=${siteId}` : "/mobile/site-photo"}
            className="p-4 rounded-[20px] bg-white border border-slate-100 shadow-sm active:scale-95 transition-all no-underline"
          >
            <div className="w-10 h-10 rounded-[12px] bg-[#f3e8ff] text-[#7e22ce] flex items-center justify-center mb-3">
              <Camera size={20} strokeWidth={2.2} />
            </div>
            <div className="text-[14px] font-extrabold text-slate-900 leading-tight mb-1">Site Photos</div>
            <div className="text-[11.5px] font-medium text-slate-500">{todayPhotos} uploaded today</div>
          </Link>

          <Link
            href={siteId ? `/mobile/add-client-advance?siteId=${siteId}` : "/mobile/add-client-advance"}
            className="p-4 rounded-[20px] bg-white border border-slate-100 shadow-sm active:scale-95 transition-all no-underline col-span-2"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[12px] bg-[#fef3c7] text-[#b45309] flex items-center justify-center flex-shrink-0">
                <IndianRupee size={20} strokeWidth={2.2} />
              </div>
              <div>
                <div className="text-[14px] font-extrabold text-slate-900 leading-tight mb-0.5">Client Advance</div>
                <div className="text-[11.5px] font-medium text-slate-500">
                  {totalAdvances > 0 ? `₹${totalAdvances.toLocaleString('en-IN')} received` : 'Log advance received from client'}
                </div>
              </div>
            </div>
          </Link>

          <Link
            href={siteId ? `/mobile/checklists?siteId=${siteId}` : "/mobile/checklists"}
            className="p-4 rounded-[20px] bg-white border border-slate-100 shadow-sm active:scale-95 transition-all no-underline col-span-2"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[12px] bg-sky-50 text-sky-600 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 size={20} strokeWidth={2.2} />
              </div>
              <div>
                <div className="text-[14px] font-extrabold text-slate-900 leading-tight mb-0.5">Site Checklist</div>
                <div className="text-[11.5px] font-medium text-slate-500">
                  Update tasks and milestones
                </div>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Daily Progress Report Action Card */}
      <Link
        href={siteId ? `/mobile/dpr?siteId=${siteId}` : "/mobile/dpr"}
        className="block bg-[#0f172a] active:scale-98 text-white p-[18px] rounded-[18px] shadow-md transition-all no-underline"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-[10px] bg-white/20 text-white flex items-center justify-center flex-shrink-0 backdrop-blur-sm">
              <ClipboardList size={20} strokeWidth={2} />
            </div>
            <div>
              <div className="text-[14px] font-extrabold tracking-tight text-white mb-0.5">Daily Site Report</div>
              {todayDpr ? (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Submitted today</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-300 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>Not submitted for <LiveClock showDate={true} showTime={false} compact={true} /></span>
                </div>
              )}
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
          {pendingApprovals.length === 0 ? (
            <div className="p-4 bg-white rounded-[16px] border border-slate-100 shadow-sm text-center">
              <div className="text-[13px] font-medium text-slate-500">No pending approvals</div>
            </div>
          ) : (
            pendingApprovals.map(approval => (
              <div key={approval.id} className="p-3.5 bg-white rounded-[16px] border border-slate-100 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-[10px] bg-[#fef3c7] text-[#b45309] flex items-center justify-center flex-shrink-0">
                    <FileText size={18} strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-bold text-slate-900 truncate">{approval.description}</div>
                    <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">{approval.paidTo}</div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <div className="text-[13.5px] font-extrabold text-slate-900">₹{Number(approval.amount).toLocaleString('en-IN')}</div>
                  <div className="inline-flex items-center gap-1 mt-1 text-[#b45309] text-[10px] font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                    Pending
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recent Bill Uploads Feed */}
      <div className="space-y-3 pt-3">
        <div className="flex justify-between items-center px-1">
          <h2 className="text-[15px] font-extrabold text-slate-900 m-0">Recent bill uploads</h2>
          <Link href="/mobile/reports" className="text-[12px] font-bold text-[#fc6e20] no-underline">View all</Link>
        </div>

        <div className="bg-[#f8fafc] space-y-2.5">
          {recentExpenses.length === 0 ? (
            <div className="p-4 bg-white rounded-[16px] border border-slate-100 shadow-sm text-center">
              <div className="text-[13px] font-medium text-slate-500">No recent bills</div>
            </div>
          ) : (
            recentExpenses.map(expense => (
              <div key={expense.id} className="p-3.5 bg-white rounded-[16px] border border-slate-100 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#f1f5f9] text-[#94a3b8] flex items-center justify-center flex-shrink-0 text-[8px] font-black tracking-widest uppercase overflow-hidden relative">
                    <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmZmYiLz48cGF0aCBkPSJNMCAwTDQgNFpNMCw0TDRMMCIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEiLz48L3N2Zz4=')]"></div>
                    {expense.category.substring(0, 5)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-bold text-slate-900 truncate">{expense.paidTo}</div>
                    <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">{expense.category} · {expense.createdAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <div className="text-[13.5px] font-extrabold text-slate-900">₹{Number(expense.amount).toLocaleString('en-IN')}</div>
                  <div className={`inline-flex items-center gap-1 mt-1 text-[10px] font-bold ${
                    expense.approvalStatus === 'APPROVED' ? 'text-emerald-600' :
                    expense.approvalStatus === 'REJECTED' ? 'text-rose-600' :
                    'text-[#b45309]'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      expense.approvalStatus === 'APPROVED' ? 'bg-emerald-500' :
                      expense.approvalStatus === 'REJECTED' ? 'bg-rose-500' :
                      'bg-[#f59e0b]'
                    }`} />
                    {expense.approvalStatus.charAt(0) + expense.approvalStatus.slice(1).toLowerCase()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

