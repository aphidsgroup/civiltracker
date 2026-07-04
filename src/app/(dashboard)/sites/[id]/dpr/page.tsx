import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import { Plus, FileText, AlertTriangle, Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function SiteDprPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user
  const { id: siteId } = await params

  const dprs = await prisma.dailyProgressReport.findMany({
    where: { companyId, siteId },
    include: {
      site: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { date: 'desc' },
    take: 30,
  })

  return (
    <div className="flex flex-col gap-6 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Site Daily Progress Reports</h2>
          <p className="text-sm text-slate-500 mt-1">{dprs.length} reports for this site</p>
        </div>
        <Link href={`/mobile/add/dpr?siteId=${siteId}`} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#fc6e20] hover:bg-[#e85b0d] text-white font-semibold text-sm transition-colors shadow-sm">
          <Plus className="w-4 h-4" />
          Add DPR
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {dprs.map(dpr => (
          <div key={dpr.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex justify-between items-start gap-3 mb-2.5">
              <div>
                <div className="text-xs text-slate-500 font-medium">
                  {formatDate(dpr.date)} · Submitted by {dpr.createdBy.name}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {dpr.labourCount !== null && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    {dpr.labourCount} workers
                  </span>
                )}
              </div>
            </div>
            {dpr.workDone && (
              <div className="text-sm text-slate-800 font-medium leading-relaxed bg-slate-50 rounded-lg p-3 mt-2 whitespace-pre-wrap">
                {dpr.workDone}
              </div>
            )}
            {dpr.delayReason && (
              <div className="mt-2 text-xs text-red-600 font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span>Delay: {dpr.delayReason}</span>
              </div>
            )}
          </div>
        ))}
        {dprs.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm flex flex-col items-center justify-center">
            <div className="p-4 bg-[#fff7ed] text-[#fc6e20] rounded-full mb-4">
              <FileText className="w-10 h-10" />
            </div>
            <h2 className="font-bold text-base text-slate-900 mb-1">No DPRs yet</h2>
            <p className="text-sm text-slate-500">Add your first daily progress report for this site.</p>
          </div>
        )}
      </div>
    </div>
  )
}
