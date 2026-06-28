import React from 'react'
import { requireUser } from '@/lib/auth/require-user'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import AttendanceRegisterClient from '@/components/labour/AttendanceRegisterClient'
import { CalendarCheck, HardHat, Sparkles } from 'lucide-react'

export const metadata = {
  title: 'Labour Attendance Register | Civil Tracker',
  description: 'Mark daily labour attendance, overtime, and advance payments across project sites.',
}

export default async function LabourAttendancePage() {
  const user = await requireUser()
  if (!user.companyId) redirect('/login')

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [labourList, sites] = await Promise.all([
    prisma.labour.findMany({
      where: { companyId: user.companyId, isActive: true },
      include: {
        site: true,
        attendance: { where: { date: today }, take: 1 }
      },
      orderBy: { name: 'asc' }
    }),
    prisma.site.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      select: { id: true, name: true }
    })
  ])

  const formattedLabour = labourList.map(l => ({
    id: l.id,
    name: l.name,
    phone: l.phone,
    trade: l.trade,
    dailyWage: Number(l.dailyWage) || 650,
    siteId: l.siteId,
    site: l.site ? { id: l.site.id, name: l.site.name } : null,
    status: l.attendance[0]?.status || 'PRESENT',
    overtimeHours: Number(l.attendance[0]?.overtimeHours) || 0,
    advance: Number(l.attendance[0]?.advance) || 0
  }))


  const todayStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#fff7ed] dark:bg-blue-950/60 text-[#fc6e20] dark:text-blue-400 text-xs font-bold mb-2 border border-blue-200 dark:border-blue-800">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Daily Site Operations</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 m-0">
            Labour Attendance Register
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 m-0">
            Track daily muster rolls, worker trade deployments, advances, and site overtime.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-sm">
            <CalendarCheck className="w-4 h-4 text-[#fc6e20] dark:text-blue-400" />
            <span>{todayStr}</span>
          </div>
        </div>
      </div>

      {/* Main Interactive Table Component */}
      <AttendanceRegisterClient
        initialLabour={formattedLabour}
        sites={sites}
        dateString={todayStr}
      />
    </div>
  )
}
