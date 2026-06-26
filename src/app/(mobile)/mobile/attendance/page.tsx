import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import MobileAttendanceClient from '@/components/mobile/MobileAttendanceClient'
import { Users, Calendar, Sparkles } from 'lucide-react'

export const metadata = {
  title: 'Field Labour Muster Roll | Civil Tracker Mobile',
  description: 'Mark worker daily attendance, modify salary, and manage advance payments.',
}

export default async function MobileAttendancePage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [labour, sites] = await Promise.all([
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
    })
  ])

  const initialLabour = labour.map(l => ({
    id: l.id,
    name: l.name,
    trade: l.trade,
    phone: l.phone,
    dailyRate: Number(l.dailyWage) || 650,
    siteId: l.siteId,
    siteName: l.site?.name || 'Assigned Site',
    status: l.attendance[0]?.status || 'PRESENT',
    advance: Number(l.attendance[0]?.advance) || 0
  }))

  const fallbackSites = sites.length > 0 ? sites : [
    { id: 'demo-site-1', name: 'Metro Heights Tower B' },
    { id: 'demo-site-2', name: 'Green Valley Villas' }
  ]

  const displayLabour = initialLabour.length > 0 ? initialLabour : [
    { id: 'demo-l-1', name: 'Murugan M', trade: 'MASON', phone: null, dailyRate: 950, siteId: fallbackSites[0].id, siteName: fallbackSites[0].name, status: 'PRESENT', advance: 500 },
    { id: 'demo-l-2', name: 'Suresh Kumar', trade: 'HELPER', phone: null, dailyRate: 650, siteId: fallbackSites[0].id, siteName: fallbackSites[0].name, status: 'PRESENT', advance: 0 },
    { id: 'demo-l-3', name: 'Ganesh Carpenter', trade: 'CARPENTER', phone: null, dailyRate: 850, siteId: fallbackSites[0].id, siteName: fallbackSites[0].name, status: 'HALF_DAY', advance: 300 },
    { id: 'demo-l-4', name: 'Rajesh Glass Fitter', trade: 'HELPER', phone: 'CUSTOM_TRADE:Glass Fitter', dailyRate: 800, siteId: fallbackSites[0].id, siteName: fallbackSites[0].name, status: 'ABSENT', advance: 0 },
  ]

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
            <h1 className="text-xl font-black tracking-tight text-white m-0">Labour Muster Roll</h1>
          </div>
        </div>

        <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 text-right">
          <div className="text-[10px] text-slate-300 font-bold uppercase">Date</div>
          <div className="text-xs font-black text-white whitespace-nowrap">
            {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </div>
        </div>
      </div>

      <MobileAttendanceClient initialLabour={displayLabour} sites={fallbackSites} />
    </div>
  )
}
