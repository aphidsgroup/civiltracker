import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import Link from 'next/link'
import {
  Building2, ChevronDown, Bell, ArrowRight, Wallet,
  FileText, Camera, ListTodo, ClipboardList, CheckCircle2, Search, IndianRupee,
  Package, Clock, Wrench
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
  const session = await auth()
  const companyId = session?.user?.companyId
  const userId = session?.user?.id

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayEnd = new Date(today)
  todayEnd.setHours(23, 59, 59, 999)

  const member = await prisma.companyMember.findFirst({
    where: { userId, ...(companyId ? { companyId } : {}) },
    include: { company: true },
  })
  const effectiveCompany = member?.company || (companyId ? await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, logo: true, city: true }
  }) : null)
  const companyName = effectiveCompany?.name || session?.user?.companyName || 'Civil Tracker'
  const companyLogo = effectiveCompany?.logo || session?.user?.companyLogo || null
  const siteIds = member?.siteIds ?? []

  const resolvedParams = await searchParams
  const requestedSiteId = resolvedParams?.siteId

  // Fetch all sites user has access to
  const allSitesRecords = siteIds.length > 0
    ? await prisma.site.findMany({ where: { id: { in: siteIds }, companyId, deletedAt: null, status: 'ACTIVE' }, include: { company: true }, orderBy: { name: 'asc' } })
    : await prisma.site.findMany({ where: { companyId, deletedAt: null, status: 'ACTIVE' }, include: { company: true }, orderBy: { name: 'asc' } })

  const allSites = allSitesRecords.map(s => ({
    id: s.id,
    name: s.name,
    companyName: s.company.name,
    companyLogo: s.company.logo,
  }))

  const activeSiteRecord = requestedSiteId 
    ? allSitesRecords.find(s => s.id === requestedSiteId) || allSitesRecords[0]
    : allSitesRecords[0]

  const activeSite = activeSiteRecord ? {
    id: activeSiteRecord.id,
    name: activeSiteRecord.name,
    companyName: activeSiteRecord.company.name,
    companyLogo: activeSiteRecord.company.logo,
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
    todayDpr,
    myRecentRequests,
    pendingMaterialRequestsCount,
    pendingPettyCashRequestsCount,
    siteEquipmentCount,
    siteTools,
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

    siteId ? prisma.dailyProgressReport.findFirst({
      where: { siteId, date: { gte: today, lte: todayEnd } }
    }) : Promise.resolve(null),

    // Query requests submitted by this user or on this site
    prisma.approval.findMany({
      where: {
        companyId: companyId || undefined,
        deletedAt: null,
        ...(siteId ? { siteId } : {}),
        entityType: { in: ['MATERIAL_REQUEST', 'EXPENSE'] },
        ...(session?.user?.role === 'SUPER_ADMIN' || session?.user?.role === 'COMPANY_ADMIN'
          ? {}
          : { OR: [{ requestedById: userId }, ...(siteId ? [{ siteId }] : [])] }),
      },
      include: {
        site: { select: { name: true } },
        requestedBy: { select: { name: true } },
      },
      orderBy: { submittedAt: 'desc' },
      take: 6,
    }),

    // Count pending material requests
    prisma.approval.count({
      where: {
        companyId: companyId || undefined,
        deletedAt: null,
        ...(siteId ? { siteId } : {}),
        entityType: 'MATERIAL_REQUEST',
        currentStatus: { in: ['PENDING', 'SUBMITTED', 'PENDING_REVIEW'] },
      },
    }),

    // Count pending petty cash requests
    prisma.approval.count({
      where: {
        companyId: companyId || undefined,
        deletedAt: null,
        ...(siteId ? { siteId } : {}),
        entityType: 'EXPENSE',
        currentStatus: { in: ['PENDING', 'SUBMITTED', 'PENDING_REVIEW'] },
      },
    }),

    // Count tools and equipment on site
    siteId ? prisma.companyAsset.count({
      where: { siteId, deletedAt: null, isActive: true },
    }).catch(() => 0) : Promise.resolve(0),

    // Recent site tools
    siteId ? prisma.companyAsset.findMany({
      where: { siteId, deletedAt: null, isActive: true },
      take: 4,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, brand: true, quantity: true, unit: true, status: true, assignedTo: true }
    }).catch(() => []) : Promise.resolve([]),
  ])

  const todaySpend = Number(todayExpenseAgg._sum.amount ?? 0)
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

  const firstName = session?.user?.name?.split(' ')[0] ?? 'Engineer'
  const roleTitle = session?.user?.role?.replace(/_/g, ' ') ?? 'Site Engineer'


  return (
    <div className="space-y-6 p-4 sm:p-6 select-none bg-[#f8fafc] min-h-screen">
      {/* Top Sticky Appbar */}
      <div className="flex items-center justify-between sticky top-0 z-30 bg-[#f8fafc]/95 backdrop-blur-md py-2 -mx-4 px-4 sm:-mx-6 sm:px-6">
        <SiteSelectorClient
          activeSite={activeSite}
          allSites={allSites}
          companyName={companyName}
          companyLogo={companyLogo}
        />

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
          <p className="text-[12px] font-semibold text-slate-600 m-0 flex items-center gap-1.5 flex-wrap">
            <span className="text-[#fc6e20] font-extrabold">{companyName}</span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-700">{roleTitle}</span>
            {activeSite?.name && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-slate-500 font-medium">{activeSite.name}</span>
              </>
            )}
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
          {/* Request Materials */}
          <Link
            href={siteId ? `/mobile/request-material?siteId=${siteId}` : "/mobile/request-material"}
            className="p-4 rounded-[20px] bg-white border border-slate-100 shadow-sm active:scale-95 transition-all no-underline relative"
          >
            {pendingMaterialRequestsCount > 0 && (
              <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-sky-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-sm z-10">
                {pendingMaterialRequestsCount}
              </span>
            )}
            <div className="w-10 h-10 rounded-[12px] bg-[#e0f2fe] text-[#0284c7] flex items-center justify-center mb-3">
              <Package size={20} strokeWidth={2.2} />
            </div>
            <div className="text-[14px] font-extrabold text-slate-900 leading-tight mb-1">Request Materials</div>
            <div className="text-[11.5px] font-medium text-slate-500">
              {pendingMaterialRequestsCount > 0 ? `${pendingMaterialRequestsCount} pending approval` : 'Order site materials'}
            </div>
          </Link>

          {/* Request Petty Cash */}
          <Link
            href={siteId ? `/mobile/request-petty-cash?siteId=${siteId}` : "/mobile/request-petty-cash"}
            className="p-4 rounded-[20px] bg-white border border-slate-100 shadow-sm active:scale-95 transition-all no-underline relative"
          >
            {pendingPettyCashRequestsCount > 0 && (
              <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-sm z-10">
                {pendingPettyCashRequestsCount}
              </span>
            )}
            <div className="w-10 h-10 rounded-[12px] bg-[#fef3c7] text-[#d97706] flex items-center justify-center mb-3">
              <IndianRupee size={20} strokeWidth={2.2} />
            </div>
            <div className="text-[14px] font-extrabold text-slate-900 leading-tight mb-1">Request Petty Cash</div>
            <div className="text-[11.5px] font-medium text-slate-500">
              {pendingPettyCashRequestsCount > 0 ? `${pendingPettyCashRequestsCount} pending approval` : 'Site cash requisition'}
            </div>
          </Link>

          {/* Company Inventory / Tools & Equipment */}
          <Link
            href={siteId ? `/mobile/inventory?siteId=${siteId}` : "/mobile/inventory"}
            className="p-4 rounded-[20px] bg-white border border-slate-100 shadow-sm active:scale-95 transition-all no-underline relative"
          >
            {siteEquipmentCount > 0 && (
              <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-sm z-10">
                {siteEquipmentCount} on site
              </span>
            )}
            <div className="w-10 h-10 rounded-[12px] bg-[#ecfdf5] text-[#059669] flex items-center justify-center mb-3">
              <Wrench size={20} strokeWidth={2.2} />
            </div>
            <div className="text-[14px] font-extrabold text-slate-900 leading-tight mb-1">Tools & Equipment</div>
            <div className="text-[11.5px] font-medium text-slate-500">
              {siteEquipmentCount > 0 ? `${siteEquipmentCount} tools on this site` : 'Company tools & yard'}
            </div>
          </Link>

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

      {/* My Requests & Live Status Feed */}
      <div className="space-y-3 pt-3">
        <div className="flex justify-between items-center px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-extrabold text-slate-900 m-0">My Requests & Status</h2>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10.5px] font-bold">
              {myRecentRequests.length}
            </span>
          </div>
          <Link href="/mobile/approvals" className="text-[12px] font-bold text-[#fc6e20] no-underline">
            View all
          </Link>
        </div>

        <div className="bg-[#f8fafc] space-y-2.5">
          {myRecentRequests.length === 0 ? (
            <div className="p-5 bg-white rounded-[20px] border border-slate-100 shadow-sm text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Clock size={20} />
              </div>
              <div className="text-[13px] font-bold text-slate-700">No requests submitted yet</div>
              <p className="text-[11.5px] text-slate-400 m-0">
                Use the Quick Actions above to request materials or petty cash from Company Admin.
              </p>
            </div>
          ) : (
            myRecentRequests.map((req) => {
              const isMaterial = req.entityType === 'MATERIAL_REQUEST'
              const status = req.currentStatus

              const statusBadgeConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
                PENDING: { label: 'Pending Approval', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
                SUBMITTED: { label: 'Pending Approval', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
                PENDING_REVIEW: { label: 'Under Review', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
                APPROVED: { label: 'Approved', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
                PAID: { label: 'Disbursed / Paid', bg: 'bg-orange-50', text: 'text-[#e85b0d]', dot: 'bg-[#fc6e20]' },
                REJECTED: { label: 'Rejected', bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
                CLOSED: { label: 'Closed', bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' },
                CANCELLED: { label: 'Cancelled', bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' },
                DRAFT: { label: 'Draft', bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' },
              }
              const currentBadge = statusBadgeConfig[status] || { label: status, bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' }

              return (
                <Link
                  key={req.id}
                  href={`/mobile/approvals/${req.id}`}
                  className="p-3.5 bg-white rounded-[18px] border border-slate-100 shadow-sm flex flex-col gap-2 hover:border-slate-200 transition-all no-underline block text-inherit"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0 ${
                        isMaterial ? 'bg-[#e0f2fe] text-[#0284c7]' : 'bg-[#fef3c7] text-[#d97706]'
                      }`}>
                        {isMaterial ? <Package size={20} /> : <IndianRupee size={20} />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-extrabold text-slate-900 truncate">
                          {req.title}
                        </div>
                        <div className="text-[11px] text-slate-500 font-semibold truncate mt-0.5">
                          {req.site?.name || 'Site'} · {new Date(req.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      {req.amount && (
                        <div className="text-[13.5px] font-black text-slate-900 mb-1">
                          ₹{Number(req.amount).toLocaleString('en-IN')}
                        </div>
                      )}
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${currentBadge.bg} ${currentBadge.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${currentBadge.dot}`} />
                        {currentBadge.label}
                      </span>
                    </div>
                  </div>

                  {/* Rejection Note if Rejected */}
                  {req.rejectionReason && (
                    <div className="text-[11px] font-semibold text-rose-700 bg-rose-50/70 p-2 rounded-xl border border-rose-100 flex items-start gap-1.5">
                      <span className="font-bold">Admin note:</span>
                      <span className="truncate">{req.rejectionReason}</span>
                    </div>
                  )}
                </Link>
              )
            })
          )}
        </div>
      </div>

      {/* Site Tools & Equipment */}
      <div className="space-y-3 pt-3">
        <div className="flex justify-between items-center px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-extrabold text-slate-900 m-0">Tools & Equipment on Site</h2>
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10.5px] font-bold border border-emerald-200">
              {siteEquipmentCount} Active
            </span>
          </div>
          <Link href={siteId ? `/mobile/inventory?siteId=${siteId}` : "/mobile/inventory"} className="text-[12px] font-bold text-[#fc6e20] no-underline">
            Manage
          </Link>
        </div>

        {siteTools.length === 0 ? (
          <Link
            href={siteId ? `/mobile/inventory?siteId=${siteId}` : "/mobile/inventory"}
            className="p-4 bg-white rounded-[20px] border border-slate-100 shadow-sm flex items-center justify-between text-inherit no-underline"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[12px] bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                <Wrench size={20} />
              </div>
              <div>
                <div className="text-[13px] font-bold text-slate-800">No tools deployed here yet</div>
                <div className="text-[11px] text-slate-500 font-medium">Tap to deploy machinery from yard or add tool</div>
              </div>
            </div>
            <ArrowRight size={16} className="text-slate-400" />
          </Link>
        ) : (
          <div className="space-y-2">
            {siteTools.map((tool) => (
              <Link
                key={tool.id}
                href={siteId ? `/mobile/inventory?siteId=${siteId}` : "/mobile/inventory"}
                className="p-3.5 bg-white rounded-[16px] border border-slate-100 shadow-sm flex items-center justify-between no-underline text-inherit hover:border-slate-200 transition-all block"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-[10px] bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0">
                    <Wrench size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-extrabold text-slate-900 truncate">{tool.name}</div>
                    <div className="text-[11px] text-slate-500 font-semibold truncate mt-0.5">
                      {tool.quantity} {tool.unit} {tool.brand ? `· ${tool.brand}` : ''} {tool.assignedTo ? `· In-Charge: ${tool.assignedTo}` : ''}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 ml-2">
                  {tool.status === 'IN_USE' ? 'In Use' : tool.status.replace(/_/g, ' ')}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

