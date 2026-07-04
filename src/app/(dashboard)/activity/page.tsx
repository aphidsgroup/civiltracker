import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { FileText, Image as ImageIcon, Users, IndianRupee, Clock, CheckSquare } from 'lucide-react'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric', minute: 'numeric', hour12: true,
    timeZone: 'Asia/Kolkata'
  }).format(date)
}

function parseTime(timeStr: string | null | undefined, fallbackDate: Date, todayDate: Date) {
  if (!timeStr) return fallbackDate
  const [hours, mins] = timeStr.split(':').map(Number)
  if (isNaN(hours) || isNaN(mins)) return fallbackDate
  const d = new Date(todayDate)
  d.setHours(hours, mins, 0, 0)
  return d
}

type ActivityType = 'ATTENDANCE' | 'ATTENDANCE_CON' | 'EXPENSE' | 'DPR' | 'PHOTO' | 'CHECKLIST'

type Activity = {
  id: string
  type: ActivityType
  title: string
  desc: string
  time: Date
  siteName: string
}

function ActivityIcon({ type }: { type: ActivityType }) {
  const cls = 'w-[18px] h-[18px]'
  if (type === 'EXPENSE') return <IndianRupee className={cls} strokeWidth={2.5} />
  if (type === 'DPR') return <FileText className={cls} strokeWidth={2.5} />
  if (type === 'PHOTO') return <ImageIcon className={cls} strokeWidth={2.5} />
  if (type === 'CHECKLIST') return <CheckSquare className={cls} strokeWidth={2.5} />
  return <Users className={cls} strokeWidth={2.5} />
}

function activityColor(type: ActivityType) {
  if (type === 'ATTENDANCE') return 'bg-emerald-100 text-emerald-600'
  if (type === 'ATTENDANCE_CON') return 'bg-[#fff7ed] text-[#fc6e20]'
  if (type === 'EXPENSE') return 'bg-red-100 text-red-600'
  if (type === 'DPR') return 'bg-[#fff7ed] text-[#fc6e20]'
  if (type === 'PHOTO') return 'bg-[#fff7ed] text-[#fc6e20]'
  if (type === 'CHECKLIST') return 'bg-blue-100 text-blue-600'
  return 'bg-slate-100 text-slate-600'
}

export default async function DashboardActivityPage({
  searchParams
}: {
  searchParams: Promise<{ type?: string, limit?: string }>
}) {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const companyId = session.user.companyId

  const { type, limit } = await searchParams
  const take = parseInt(limit || '50')

  const sites = await prisma.site.findMany({ 
    where: { companyId, deletedAt: null }, 
    select: { id: true, name: true } 
  })
  
  const siteIds = sites.map(s => s.id)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const activities: Activity[] = []

  const fetchExpenses = !type || type === 'EXPENSE'
  const fetchDpr = !type || type === 'DPR'
  const fetchAttendance = !type || type === 'ATTENDANCE'
  const fetchPhotos = !type || type === 'PHOTO'
  const fetchChecklist = !type || type === 'CHECKLIST'

  if (siteIds.length > 0) {
    const [expenses, dprs, attendance, contractorAttendances, photos, checklistLogs] = await Promise.all([
      fetchExpenses ? prisma.expense.findMany({ 
        where: { siteId: { in: siteIds } }, 
        orderBy: { createdAt: 'desc' },
        take,
        include: { createdBy: true, site: true } 
      }) : Promise.resolve([]),
      fetchDpr ? prisma.dailyProgressReport.findMany({ 
        where: { siteId: { in: siteIds } }, 
        orderBy: { createdAt: 'desc' },
        take,
        include: { createdBy: true, site: true } 
      }) : Promise.resolve([]),
      fetchAttendance ? prisma.labourAttendance.findMany({ 
        where: { labour: { siteId: { in: siteIds } } }, 
        orderBy: { date: 'desc' },
        take,
        include: { labour: { include: { site: true } } } 
      }) : Promise.resolve([]),
      fetchAttendance ? prisma.contractorAttendance.findMany({ 
        where: { siteId: { in: siteIds } }, 
        orderBy: { date: 'desc' },
        take,
        include: { subcontractor: true, site: true } 
      }) : Promise.resolve([]),
      fetchPhotos ? prisma.sitePhoto.findMany({ 
        where: { siteId: { in: siteIds } }, 
        orderBy: { createdAt: 'desc' },
        take,
        include: { site: true } 
      }) : Promise.resolve([]),
      fetchChecklist ? prisma.auditLog.findMany({
        where: { recordId: { in: siteIds }, module: 'CHECKLIST', action: 'TICK' },
        orderBy: { createdAt: 'desc' },
        take,
        include: { user: { select: { name: true } } }
      }) : Promise.resolve([]),
    ])

    attendance.forEach(a => {
      if (!a.labour.site) return
      activities.push({
        id: `att-${a.id}`,
        type: 'ATTENDANCE',
        title: `${a.labour.name} marked ${a.status.toLowerCase()}`,
        desc: `Own Labour \u2022 ${a.labour.trade}`,
        time: parseTime(a.startTime, a.createdAt, a.date),
        siteName: a.labour.site.name
      })
    })

    contractorAttendances.forEach(c => {
      activities.push({
        id: `con-${c.id}`,
        type: 'ATTENDANCE_CON',
        title: `${c.subcontractor.name} logged ${c.labourCount} workers`,
        desc: `Contractor \u2022 ${c.contractorType || c.subcontractor.trade || 'Others'}`,
        time: parseTime(c.startTime ?? null, c.createdAt, c.date),
        siteName: c.site.name
      })
    })

    expenses.forEach(e => {
      activities.push({
        id: `exp-${e.id}`,
        type: 'EXPENSE',
        title: `\u20b9${Number(e.amount).toLocaleString('en-IN')} expense added`,
        desc: `${e.category.replace(/_/g, ' ')} \u2022 By ${e.createdBy.name}`,
        time: e.createdAt,
        siteName: e.site.name
      })
    })

    dprs.forEach(d => {
      activities.push({
        id: `dpr-${d.id}`,
        type: 'DPR',
        title: `Daily Progress Report submitted`,
        desc: `By ${d.createdBy.name}`,
        time: d.createdAt,
        siteName: d.site.name
      })
    })

    photos.forEach(p => {
      activities.push({
        id: `photo-${p.id}`,
        type: 'PHOTO',
        title: `Site photo uploaded`,
        desc: p.caption ? `"${p.caption}"` : `Site photo uploaded`,
        time: p.createdAt,
        siteName: p.site.name
      })
    })

    checklistLogs.forEach(log => {
      const data = log.after as any
      activities.push({
        id: `chk-${log.id}`,
        type: 'CHECKLIST',
        title: `Task "${data?.taskName || 'Unknown'}" completed`,
        desc: `Checklist • By ${log.user.name}`,
        time: log.createdAt,
        siteName: sites.find(s => s.id === log.recordId)?.name || 'Unknown Site'
      })
    })
  }

  activities.sort((a, b) => b.time.getTime() - a.time.getTime())
  
  // Group by date
  const grouped = activities.reduce((acc, act) => {
    const d = act.time
    const dateStr = d.toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'Asia/Kolkata'
    })
    if (!acc[dateStr]) acc[dateStr] = []
    acc[dateStr].push(act)
    return acc
  }, {} as Record<string, Activity[]>)

  const filters = [
    { id: '', label: 'All' },
    { id: 'ATTENDANCE', label: 'Attendance' },
    { id: 'EXPENSE', label: 'Expenses' },
    { id: 'DPR', label: 'DPRs' },
    { id: 'PHOTO', label: 'Photos' },
    { id: 'CHECKLIST', label: 'Checklists' },
  ]

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-6 py-6">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">
            Activity Timeline
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time feed of all updates happening across your sites.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 min-h-[400px]">
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
          {filters.map(f => {
            const isActive = (type || '') === f.id
            return (
              <Link 
                key={f.id} 
                href={`?type=${f.id}&limit=${take}`}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                  isActive ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </Link>
            )
          })}
        </div>

        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-20 opacity-60">
            <Clock size={48} className="text-slate-300 mb-4" strokeWidth={1.5} />
            <h3 className="text-base font-bold text-slate-700 m-0">No activities found</h3>
            <p className="text-sm font-medium text-slate-500 mt-1 max-w-[250px]">
              Try changing the filter or load more activities.
            </p>
          </div>
        ) : (
          <div className="relative border-l-2 border-slate-100 ml-4 py-2">
            {Object.entries(grouped).map(([dateStr, acts]) => (
              <div key={dateStr} className="mb-8 last:mb-0">
                <div className="absolute -left-[27px] bg-white text-slate-500 font-bold text-[10px] uppercase tracking-wider py-1 px-3 border border-slate-200 rounded-full shadow-sm">
                  {dateStr}
                </div>
                <div className="pt-8">
                  {acts.map((act) => (
                    <div key={act.id} className="relative pl-8 pb-10 last:pb-0">
                      <div className={`absolute -left-[19px] top-0.5 w-9 h-9 rounded-full flex items-center justify-center border-4 border-white ${activityColor(act.type)} shadow-sm z-10`}>
                        <ActivityIcon type={act.type} />
                      </div>
                      <div>
                        <div className="flex items-start justify-between gap-4 mb-1">
                          <h3 className="text-base font-bold text-[#0f172a] m-0 leading-snug">
                            {act.title}
                          </h3>
                          <span className="text-xs font-bold text-slate-400 whitespace-nowrap mt-1">
                            {formatTime(act.time)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">
                            {act.siteName}
                          </span>
                          <p className="text-sm font-medium text-slate-500 m-0 leading-relaxed">
                            {act.desc}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activities.length >= take && (
          <div className="mt-8 text-center">
            <Link 
              href={`?type=${type || ''}&limit=${take + 50}`}
              className="inline-flex px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-colors"
            >
              Load Older Activities
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
