import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { countValidApprovals } from '@/lib/approvals/valid-reads'
import { redirect } from 'next/navigation'
import { formatCurrency, formatDateTime } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function SiteOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { id } = await params

  const site = await prisma.site.findUnique({
    where: { id, companyId: session.user.companyId, deletedAt: null },
    include: {
      dprs: { orderBy: { date: 'desc' }, take: 1, include: { createdBy: true } },
    }
  })

  if (!site) redirect('/sites')

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const todayAttendance = await prisma.labourAttendance.findMany({
    where: {
      labour: { siteId: id },
      date: { gte: startOfToday },
      status: 'PRESENT'
    },
    include: { labour: true }
  })

  const todayContractors = await prisma.contractorAttendance.findMany({
    where: {
      siteId: id,
      date: { gte: startOfToday }
    },
    include: { subcontractor: true }
  })

  const presentCount = todayAttendance.length
  const contractorLabourCount = todayContractors.reduce((acc, c) => acc + c.labourCount, 0)
  const totalOnsite = presentCount + contractorLabourCount

  const checklist = await prisma.projectChecklist.findUnique({
    where: { siteId: id },
    include: { stages: { include: { categories: { include: { tasks: true } } } } }
  })

  let totalTasks = 0
  let completedTasks = 0
  if (checklist) {
    checklist.stages.forEach(s => s.categories.forEach(c => c.tasks.forEach(t => {
      totalTasks++
      if (t.status === 'COMPLETED') completedTasks++
    })))
  }
  const calculatedProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : (site.progress || 0)

  const approvedExpenses = await prisma.expense.aggregate({
    where: { siteId: id, approvalStatus: { in: ['APPROVED', 'PAID'] } },
    _sum: { amount: true }
  })
  const calculatedSpent = Number(approvedExpenses._sum.amount || 0)

  // Soft-deleted, malformed, orphaned and cross-tenant rows can never be actioned, so
  // they are not counted as waiting.
  const pendingApprovalsCount = await countValidApprovals({
    companyId: site.companyId,
    siteId: site.id,
    currentStatus: 'PENDING',
  })

  const budget = Number(site.budget) || 0
  const latestDpr = site.dprs[0]

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-slate-900 text-white rounded-xl shadow-sm">
          <div className="text-2xl font-bold">{calculatedProgress}%</div>
          <div className="text-xs text-slate-400 mt-1">Overall progress • {site.currentStage || 'Planning'} stage</div>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-2xl font-bold text-slate-900">{formatCurrency(calculatedSpent)}</div>
          <div className="text-xs text-slate-500 mt-1">Spent of {formatCurrency(budget)}</div>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-2xl font-bold text-slate-900">{totalOnsite}</div>
          <div className="text-xs text-slate-500 mt-1">Labour present today ({presentCount} Own + {contractorLabourCount} Cont.)</div>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-2xl font-bold text-amber-600">{pendingApprovalsCount}</div>
          <div className="text-xs text-slate-500 mt-1">Pending approvals</div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Project Details Card */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-800 text-sm">Project Details</h3>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6">
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</div>
                <div className="text-sm font-medium text-slate-900 mt-0.5">{site.clientName || 'N/A'}</div>
                {site.clientPhone && <div className="text-xs text-slate-600">{site.clientPhone}</div>}
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Project Type</div>
                <div className="text-sm font-medium text-slate-900 mt-0.5">{site.projectType || 'N/A'}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Timeline</div>
                <div className="text-sm font-medium text-slate-900 mt-0.5">
                  {site.startDate ? new Date(site.startDate).toLocaleDateString() : 'TBD'} - {site.targetEndDate ? new Date(site.targetEndDate).toLocaleDateString() : 'TBD'}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Area</div>
                <div className="text-sm font-medium text-slate-900 mt-0.5">{site.areaSqft ? `${site.areaSqft} sqft` : 'N/A'}</div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Location / Address</div>
                <div className="text-sm font-medium text-slate-900 mt-0.5">{site.location}</div>
                {site.address && <div className="text-xs text-slate-600 mt-0.5">{site.address}</div>}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="font-bold text-slate-800 text-sm">Today&apos;s site update</div>
              <div className="text-xs text-slate-500">
                {latestDpr ? `From DPR • ${formatDateTime(latestDpr.createdAt)}` : 'No recent updates'}
              </div>
            </div>
            <div className="p-5">
              <div className="text-sm leading-relaxed text-slate-700 font-medium">
                {latestDpr ? latestDpr.workDone : 'No DPRs submitted for this site yet.'}
              </div>
            </div>
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="font-bold text-slate-800 text-sm">Today Onsite / Working</div>
              <div className="text-xs font-bold text-slate-500">{totalOnsite} Total</div>
            </div>
            <div className="p-0">
              {todayAttendance.length === 0 && todayContractors.length === 0 ? (
                <div className="py-6 text-center text-slate-500 text-xs">
                  No labour marked present today.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {todayAttendance.map(a => (
                    <div key={a.id} className="flex justify-between items-center p-4">
                      <div>
                        <div className="font-bold text-slate-800 text-sm">{a.labour.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{a.labour.trade}</div>
                      </div>
                      <div className="px-2 py-1 bg-emerald-50 text-emerald-700 font-semibold text-[10px] uppercase rounded border border-emerald-100">
                        Present
                      </div>
                    </div>
                  ))}
                  {todayContractors.map(c => (
                    <div key={c.id} className="flex justify-between items-center p-4 bg-slate-50/50">
                      <div>
                        <div className="font-bold text-slate-800 text-sm">{c.subcontractor.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">Subcontractor team</div>
                      </div>
                      <div className="font-bold text-slate-700 text-sm">
                        {c.labourCount} Workers
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
