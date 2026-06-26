import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import { Plus, FileText, AlertTriangle, Users } from 'lucide-react'

export const metadata = { title: 'DPR | Civil Tracker' }

export default async function DprPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const dprs = await prisma.dailyProgressReport.findMany({
    where: { companyId },
    include: {
      site: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { date: 'desc' },
    take: 30,
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Daily Progress Reports</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{dprs.length} reports</p>
        </div>
        <Link href="/mobile/dpr" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#fc6e20] hover:bg-[#e85b0d] text-white font-semibold text-sm transition-colors shadow-sm">
          <Plus className="w-4 h-4" />
          Add DPR
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {dprs.map(dpr => (
          <div key={dpr.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
            <div className="flex justify-between items-start gap-3 mb-2.5">
              <div>
                <div className="font-extrabold text-base text-slate-900 dark:text-slate-100 mb-1">{dpr.site.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {formatDate(dpr.date)} · Submitted by {dpr.createdBy.name}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {dpr.labourCount !== null && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    {dpr.labourCount} workers
                  </span>
                )}
              </div>
            </div>
            {dpr.workDone && (
              <div className="text-sm text-slate-800 dark:text-slate-200 font-medium leading-relaxed bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 mt-2">
                {dpr.workDone}
              </div>
            )}
            {dpr.delayReason && (
              <div className="mt-2 text-xs text-red-600 dark:text-red-400 font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span>Delay: {dpr.delayReason}</span>
              </div>
            )}
          </div>
        ))}
        {dprs.length === 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center shadow-sm flex flex-col items-center justify-center">
            <div className="p-4 bg-[#fff7ed] dark:bg-blue-950/50 text-[#fc6e20] dark:text-blue-400 rounded-full mb-4">
              <FileText className="w-10 h-10" />
            </div>
            <h2 className="font-bold text-base text-slate-900 dark:text-slate-100 mb-1">No DPRs yet</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Add your first daily progress report from mobile</p>
          </div>
        )}
      </div>
    </div>
  )
}
