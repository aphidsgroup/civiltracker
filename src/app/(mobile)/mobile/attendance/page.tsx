import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import MobileAttendanceClient from '@/components/mobile/MobileAttendanceClient'
import { Users, Sparkles } from 'lucide-react'

export const metadata = {
  title: 'Field Labour Muster Roll | Civil Tracker Mobile',
  description: 'Mark worker daily attendance, log contractor headcount, and manage advance payments.',
}

export default async function MobileAttendancePage({ searchParams }: { searchParams: Promise<{ siteId?: string }> }) {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const { siteId } = await searchParams

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

  const mapLabour = (l: any) => ({
    id: l.id,
    name: l.name,
    trade: l.trade,
    phone: l.phone,
    dailyRate: Number(l.dailyWage) || 650,
    siteId: l.siteId,
    siteName: l.site?.name || 'Assigned Site',
    status: l.attendance[0]?.status || 'UNMARKED',
    advance: Number(l.attendance[0]?.advance) || 0,
    startTime: l.attendance[0]?.startTime || null
  })

  const mapped = allLabour.map(mapLabour)
  const todayRoster = mapped.filter(l => l.status !== 'UNMARKED')
  const otherWorkers = mapped.filter(l => l.status === 'UNMARKED')

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
    <div className="min-h-screen bg-[#f8fafc] pb-32 font-sans select-none text-[#1e293b]">
      {/* Header */}
      <div className="bg-[#0f172a] text-white pt-6 pb-8 px-5 rounded-b-[32px] shadow-lg mb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none" />
        <div className="flex items-center justify-between mb-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-amber-300 text-[11px] font-extrabold mb-2">
              <Sparkles size={12} /> Daily Muster Roll
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white m-0">Field Attendance</h1>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center text-white backdrop-blur-md">
            <Users size={24} />
          </div>
        </div>
      </div>

      <MobileAttendanceClient 
        todayRoster={todayRoster} 
        otherWorkers={otherWorkers} 
        initialContractors={initialContractors}
        sites={fallbackSites} 
        defaultSiteId={siteId}
      />
    </div>
  )
}
