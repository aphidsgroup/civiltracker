import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import MobileAttendanceClient from '@/components/mobile/MobileAttendanceClient'
import { Users, Sparkles } from 'lucide-react'

export const metadata = {
  title: 'Field Labour Muster Roll | Civil Tracker Mobile',
  description: 'Mark worker daily attendance, log contractor headcount, and manage advance payments.',
}

export default async function MobileAttendancePage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [allLabour, sites, contractorAttendances] = await Promise.all([
    prisma.labour.findMany({
      where: { companyId, isActive: true },
      include: {
        attendance: { where: { date: today }, take: 1 },
        site: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.site.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.contractorAttendance.findMany({
      where: { companyId, date: today },
      include: { subcontractor: { select: { name: true, trade: true } } },
      orderBy: { createdAt: 'desc' }
    })
  ])

  const fallbackSites = sites.length > 0 ? sites : [
    { id: 'demo-site-1', name: 'Metro Heights Tower B' },
    { id: 'demo-site-2', name: 'Green Valley Villas' }
  ]

  // Separate into Today's Roster vs Other Company Workers
  const mapLabour = (l: any) => ({
    id: l.id,
    name: l.name,
    trade: l.trade,
    phone: l.phone,
    dailyRate: Number(l.dailyWage) || 650,
    siteId: l.siteId,
    siteName: l.site?.name || 'Assigned Site',
    status: l.attendance[0]?.status || 'PRESENT',
    advance: Number(l.attendance[0]?.advance) || 0,
    startTime: l.attendance[0]?.startTime || null
  })

  const todayRoster = allLabour.filter(l => l.attendance.length > 0).map(mapLabour)
  const otherWorkers = allLabour.filter(l => l.attendance.length === 0).map(mapLabour)

  const initialContractors = contractorAttendances.map(ca => ({
    id: ca.id,
    name: ca.subcontractor?.name || 'Unknown',
    trade: ca.contractorType || ca.subcontractor?.trade || 'Others',
    labourCount: ca.labourCount,
    advance: Number(ca.dailyAdvance) || 0,
    siteId: ca.siteId,
    startTime: ca.startTime || null
  }))

  return (
    <div className="p-4 sm:p-6 max-w-lg mx-auto space-y-6 select-none">
      {/* Header Banner */}
      <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 rounded-3xl text-white shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-400/30">
            <Users size={24} />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-300">
              <Sparkles size={11} />
              <span>FIELD ROSTER OCR</span>
            </div>
            <h1 className="text-xl font-black tracking-tight text-white m-0">Daily Roster</h1>
          </div>
        </div>

        <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 text-right">
          <div className="text-[10px] text-slate-300 font-bold uppercase">Date</div>
          <div className="text-xs font-black text-white whitespace-nowrap">
            {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </div>
        </div>
      </div>

      <MobileAttendanceClient 
        todayRoster={todayRoster} 
        otherWorkers={otherWorkers} 
        initialContractors={initialContractors}
        sites={fallbackSites} 
      />
    </div>
  )
}
