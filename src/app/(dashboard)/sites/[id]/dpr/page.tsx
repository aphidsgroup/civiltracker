import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function SiteDprPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params

  const dprs = await prisma.dailyProgressReport.findMany({
    where: { siteId: id, companyId: session?.user?.companyId },
    include: { createdBy: true },
    orderBy: { date: 'desc' },
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-200">
        <h3 className="font-bold text-slate-800">Daily Progress Reports</h3>
      </div>
      <div className="divide-y divide-slate-100">
        {dprs.length === 0 && <div className="p-6 text-center text-slate-500">No DPRs found for this site.</div>}
        {dprs.map(dpr => (
          <div key={dpr.id} className="p-5">
            <div className="flex justify-between items-start mb-3">
              <div className="font-bold text-slate-900">{formatDate(dpr.date)}</div>
              <div className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded">
                By {dpr.createdBy.name}
              </div>
            </div>
            <div className="text-sm text-slate-700 whitespace-pre-wrap">{dpr.workDone}</div>
            
            {(dpr.labourCount || dpr.weather) && (
              <div className="mt-3 flex gap-2 flex-wrap">
                {dpr.labourCount !== null && <span className="text-[11px] font-bold text-slate-600 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">{dpr.labourCount} Workers</span>}
                {dpr.weather && <span className="text-[11px] font-bold text-slate-600 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">Weather: {dpr.weather}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
