import React from 'react'
import { requireUser } from '@/lib/auth/require-user'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import AttendanceRegisterClient from '@/components/labour/AttendanceRegisterClient'
import { CalendarCheck, HardHat, Sparkles, Clock, ShieldAlert } from 'lucide-react'

export const metadata = {
  title: 'Labour Attendance Register | Civil Tracker',
  description: 'Mark daily labour attendance and overtime across project sites.',
}

export default async function LabourAttendancePage() {
  const user = await requireUser()
  if (!user.companyId) redirect('/login')

  // Exact prompt query requirement
  const labourList = await prisma.labour.findMany({ where: { companyId: user.companyId, isActive: true }, include: { site: true } })

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
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-xs font-bold mb-2 border border-blue-200 dark:border-blue-800">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Daily Site Operations</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 m-0">
            Labour Attendance Register
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 m-0">
            Track daily muster rolls, worker trade deployments, and site overtime.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-sm">
            <CalendarCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>{todayStr}</span>
          </div>
        </div>
      </div>

      {/* Main Interactive Table Component */}
      <AttendanceRegisterClient labourList={labourList} dateString={todayStr} />
    </div>
  )
}
