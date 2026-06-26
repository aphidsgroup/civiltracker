import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { FileText, Image as ImageIcon, Users, IndianRupee, Clock } from 'lucide-react'

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric', hour12: true }).format(date)
}

function parseTime(timeStr: string | null | undefined, fallbackDate: Date, todayDate: Date) {
  if (!timeStr) return fallbackDate
  const [hours, mins] = timeStr.split(':').map(Number)
  if (isNaN(hours) || isNaN(mins)) return fallbackDate
  const d = new Date(todayDate)
  d.setHours(hours, mins, 0, 0)
  return d
}

type ActivityType = 'ATTENDANCE' | 'ATTENDANCE_CON' | 'EXPENSE' | 'DPR' | 'PHOTO'

type Activity = {
  id: string
  type: ActivityType
  title: string
  desc: string
  time: Date
}

function ActivityIcon({ type }: { type: ActivityType }) {
  const cls = 'w-[18px] h-[18px]'
  if (type === 'EXPENSE') return <IndianRupee className={cls} strokeWidth={2.5} />
  if (type === 'DPR') return <FileText className={cls} strokeWidth={2.5} />
  if (type === 'PHOTO') return <ImageIcon className={cls} strokeWidth={2.5} />
  return <Users className={cls} strokeWidth={2.5} />
}

function activityColor(type: ActivityType) {
  if (type === 'ATTENDANCE') return 'bg-emerald-100 text-emerald-600'
  if (type === 'ATTENDANCE_CON') return 'bg-[#fff7ed] text-[#fc6e20]'
  if (type === 'EXPENSE') return 'bg-red-100 text-red-600'
  if (type === 'DPR') return 'bg-[#fff7ed] text-[#fc6e20]'
  if (type === 'PHOTO') return 'bg-[#fff7ed] text-[#fc6e20]'
  return 'bg-slate-100 text-slate-600'
}

export default async function MobileActivityPage() {
  const session = await auth()
  const companyId = session?.user?.companyId
  const userId = session?.user?.id

  const member = await prisma.companyMember.findFirst({ where: { userId, companyId } })
  const siteIds = member?.siteIds ?? []
  const activeSite = siteIds.length > 0
    ? await prisma.site.findFirst({ where: { id: { in: siteIds }, companyId } })
    : await prisma.site.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' } })

  const siteId = activeSite?.id
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const activities: Activity[] = []

  if (siteId) {
    const [expenses, dprs, attendance, contractorAttendances, photos] = await Promise.all([
      prisma.expense.findMany({ where: { siteId, createdAt: { gte: startOfToday } }, include: { createdBy: true } }),
      prisma.dailyProgressReport.findMany({ where: { siteId, createdAt: { gte: startOfToday } }, include: { createdBy: true } }),
      prisma.labourAttendance.findMany({ where: { siteId, date: startOfToday }, include: { labour: true } }),
      prisma.contractorAttendance.findMany({ where: { siteId, date: startOfToday }, include: { subcontractor: true } }),
      prisma.sitePhoto.findMany({ where: { siteId, createdAt: { gte: startOfToday } } }),
    ])

    attendance.forEach(a => {
      activities.push({
        id: `att-${a.id}`,
        type: 'ATTENDANCE',
        title: `${a.labour.name} marked ${a.status.toLowerCase()}`,
        desc: `Own Labour • ${a.labour.trade}`,
        time: parseTime(a.startTime, a.createdAt, startOfToday),
      })
    })

    contractorAttendances.forEach(c => {
      activities.push({
        id: `con-${c.id}`,
        type: 'ATTENDANCE_CON',
        title: `${c.subcontractor.name} logged ${c.labourCount} workers`,
        desc: `Contractor • ${c.contractorType || c.subcontractor.trade || 'Others'}`,
        time: parseTime(c.startTime ?? null, c.createdAt, startOfToday),
      })
    })

    expenses.forEach(e => {
      activities.push({
        id: `exp-${e.id}`,
        type: 'EXPENSE',
        title: `\u20b9${Number(e.amount).toLocaleString('en-IN')} expense added`,
        desc: `${e.category.replace(/_/g, ' ')} \u2022 By ${e.createdBy.name}`,
        time: e.createdAt,
      })
    })

    dprs.forEach(d => {
      activities.push({
        id: `dpr-${d.id}`,
        type: 'DPR',
        title: `Daily Progress Report submitted`,
        desc: `By ${d.createdBy.name}`,
        time: d.createdAt,
      })
    })

    photos.forEach(p => {
      activities.push({
        id: `photo-${p.id}`,
        type: 'PHOTO',
        title: `Site photo uploaded`,
        desc: p.caption ? `"${p.caption}"` : `Site photo uploaded`,
        time: p.createdAt,
      })
    })
  }

  activities.sort((a, b) => b.time.getTime() - a.time.getTime())

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 sm:p-6 pb-28 select-none">
      <div className="mb-6">
        <h1 className="text-[24px] font-extrabold text-[#0f172a] m-0 tracking-tight">
          Today&apos;s Activity
        </h1>
        <div className="text-[13px] font-semibold text-slate-500 mt-1">
          {activeSite?.name || 'No active site'}
        </div>
      </div>

      <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-5 min-h-[400px]">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-20 opacity-60">
            <Clock size={48} className="text-slate-300 mb-4" strokeWidth={1.5} />
            <h3 className="text-[15px] font-bold text-slate-700 m-0">No activities yet</h3>
            <p className="text-[12px] font-medium text-slate-500 mt-1 max-w-[200px]">
              Updates made today for this site will appear here.
            </p>
          </div>
        ) : (
          <div className="relative border-l-2 border-slate-100 ml-4 py-2">
            {activities.map((act) => (
              <div key={act.id} className="relative pl-6 pb-8 last:pb-0">
                <div className={`absolute -left-[17px] top-0.5 w-8 h-8 rounded-full flex items-center justify-center border-4 border-white ${activityColor(act.type)} shadow-sm`}>
                  <ActivityIcon type={act.type} />
                </div>
                <div>
                  <div className="flex items-start justify-between gap-2 mb-0.5">
                    <h3 className="text-[14.5px] font-bold text-[#0f172a] m-0 leading-snug">
                      {act.title}
                    </h3>
                    <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap mt-0.5">
                      {formatTime(act.time)}
                    </span>
                  </div>
                  <p className="text-[12.5px] font-medium text-slate-500 m-0 leading-relaxed">
                    {act.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
