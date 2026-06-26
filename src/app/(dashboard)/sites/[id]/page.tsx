import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency, formatDateTime, formatDate } from '@/lib/utils'
import { ChevronLeft } from 'lucide-react'

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { id } = await params

  const site = await prisma.site.findFirst({
    where: { id, companyId: session.user.companyId, deletedAt: null },
    include: {
      dprs: { orderBy: { date: 'desc' }, take: 1, include: { createdBy: true } },
    }
  })

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

  if (!site) redirect('/sites')

  const budget = Number(site.budget) || 0
  const spent = Number(site.spent) || 0
  const progress = site.progress || 0
  const latestDpr = site.dprs[0]

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2.5">
          <Link href="/sites" className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors">
            <ChevronLeft className="w-4 h-4" />
            Sites
          </Link>
          <div className="text-lg font-extrabold text-slate-900">{site.name}</div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            {site.status.replace('_', ' ')}
          </div>
        </div>
        <div className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer shadow-sm transition-colors">
          Share to client
        </div>
      </div>
      
      <div className="flex items-center gap-2 border-b border-slate-200 mb-6 overflow-x-auto">
        <div className="px-3 py-2 text-sm font-semibold text-blue-600 border-b-2 border-blue-600 whitespace-nowrap cursor-pointer">Overview</div>
        <div className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 border-b-2 border-transparent whitespace-nowrap cursor-pointer">DPR</div>
        <div className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 border-b-2 border-transparent whitespace-nowrap cursor-pointer">Expenses</div>
        <div className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 border-b-2 border-transparent whitespace-nowrap cursor-pointer">Bills</div>
        <div className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 border-b-2 border-transparent whitespace-nowrap cursor-pointer">Labour</div>
        <div className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 border-b-2 border-transparent whitespace-nowrap cursor-pointer">Materials</div>
        <div className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 border-b-2 border-transparent whitespace-nowrap cursor-pointer">Tasks</div>
        <div className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 border-b-2 border-transparent whitespace-nowrap cursor-pointer">BOQ</div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-slate-900 text-white rounded-xl shadow-sm">
          <div className="text-2xl font-bold">{progress}%</div>
          <div className="text-xs text-slate-400 mt-1">Overall progress • {site.currentStage || 'Planning'} stage</div>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-2xl font-bold text-slate-900">{formatCurrency(spent)}</div>
          <div className="text-xs text-slate-500 mt-1">Spent of {formatCurrency(budget)}</div>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-2xl font-bold text-slate-900">{totalOnsite}</div>
          <div className="text-xs text-slate-500 mt-1">Labour present today ({presentCount} Own + {contractorLabourCount} Cont.)</div>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-2xl font-bold text-amber-600">0</div>
          <div className="text-xs text-slate-500 mt-1">Pending approvals</div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <div className="font-bold text-slate-800 text-sm">Budget vs Actual by head</div>
            </div>
            <div className="p-5">
              <div className="py-8 text-center text-slate-500 text-xs">
                Detailed budget breakdown is not configured for this project.
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
                <div className="divide-y divide-slate-100 max-h-[350px] overflow-y-auto">
                  {/* Own Labour */}
                  {todayAttendance.length > 0 && (
                    <div className="px-5 py-2 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Internal Workforce ({presentCount})
                    </div>
                  )}
                  {todayAttendance.map((att) => (
                    <div key={att.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <div className="font-semibold text-sm text-slate-900">{att.labour.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{att.labour.trade}</div>
                      </div>
                      <div className="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase tracking-wide">
                        Present
                      </div>
                    </div>
                  ))}

                  {/* Contractors */}
                  {todayContractors.length > 0 && (
                    <div className="px-5 py-2 bg-blue-50 border-t border-slate-100 text-[10px] font-black uppercase tracking-wider text-blue-600">
                      Outside Contractors ({contractorLabourCount})
                    </div>
                  )}
                  {todayContractors.map((ca) => (
                    <div key={ca.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <div className="font-semibold text-sm text-slate-900">{ca.subcontractor.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-slate-500">{ca.contractorType}</span>
                          {Number(ca.dailyAdvance) > 0 && (
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                              Adv: {formatCurrency(Number(ca.dailyAdvance))}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="inline-flex items-center px-2 py-1 rounded text-[11px] font-black bg-blue-100 text-blue-700">
                        {ca.labourCount} Workers
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <div className="font-bold text-slate-800 text-sm">Site facts</div>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between py-2.5 border-b border-slate-100 text-xs">
                <span className="text-slate-500 font-medium">Client</span>
                <span className="text-slate-900 font-semibold text-right">{site.clientName || '-'}</span>
              </div>
              <div className="flex items-center justify-between py-2.5 border-b border-slate-100 text-xs">
                <span className="text-slate-500 font-medium">Contract</span>
                <span className="text-slate-900 font-semibold text-right">Item-rate • {formatCurrency(budget)}</span>
              </div>
              <div className="flex items-center justify-between py-2.5 border-b border-slate-100 text-xs">
                <span className="text-slate-500 font-medium">Start</span>
                <span className="text-slate-900 font-semibold text-right">{formatDate(site.startDate)}</span>
              </div>
              <div className="flex items-center justify-between py-2.5 border-b border-slate-100 text-xs">
                <span className="text-slate-500 font-medium">Handover</span>
                <span className="text-slate-900 font-semibold text-right">{formatDate(site.handoverDate)}</span>
              </div>
              <div className="flex items-center justify-between py-2.5 text-xs">
                <span className="text-slate-500 font-medium">Location</span>
                <span className="text-slate-900 font-semibold text-right">{site.location}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
