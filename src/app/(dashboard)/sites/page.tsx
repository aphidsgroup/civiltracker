import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'
import { MapPin, HardHat, CreditCard, Clock } from 'lucide-react'
import { SiteCardActions } from '@/components/client/SiteActions'

export const dynamic = 'force-dynamic'

export default async function SitesPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  // Lazy cleanup of soft-deleted sites older than 15 days
  const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
  try {
    await prisma.site.deleteMany({
      where: { companyId, deletedAt: { lt: fifteenDaysAgo } }
    })
  } catch (e) {
    console.error('Failed to cleanup old deleted sites', e)
  }

  const sites = await prisma.site.findMany({
    where: { 
      companyId, 
      OR: [
        { deletedAt: null },
        { deletedAt: { gte: fifteenDaysAgo } }
      ]
    },
    include: { _count: { select: { labour: true, expenses: true, dprs: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const statusChip: Record<string, string> = {
    ACTIVE:    'bg-green-100 text-green-700 border border-green-200',
    PLANNING:  'bg-gray-100 text-gray-500 border border-gray-200',
    COMPLETED: 'bg-[#fff7ed] text-[#e85b0d] border border-blue-200',
    ON_HOLD:   'bg-amber-100 text-amber-700 border border-amber-200',
    CANCELLED: 'bg-red-100 text-red-700 border border-red-200',
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight leading-tight">Sites</h1>
          <p className="text-sm text-gray-500 font-medium mt-0.5">{sites.length} sites total</p>
        </div>
        <Link
          href="/sites/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#fc6e20] text-white text-sm font-bold hover:bg-[#e85b0d] transition-colors no-underline shadow-sm"
        >
          + New Site
        </Link>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
        {sites.map(site => {
          const pct = Math.round(Number(site.progress))
          const spent = Number(site.spent)
          const budget = Number(site.budget)
          const overBudget = spent > budget
          const isDeleted = site.deletedAt !== null
          
          let daysRemaining = 0
          if (isDeleted) {
            const deleteTime = new Date(site.deletedAt!).getTime()
            const expiryTime = deleteTime + (15 * 24 * 60 * 60 * 1000)
            daysRemaining = Math.max(0, Math.ceil((expiryTime - Date.now()) / (1000 * 60 * 60 * 24)))
          }

          const CardWrapper = isDeleted ? 'div' : Link

          return (
            <CardWrapper 
              key={site.id} 
              {...(isDeleted ? {} : { href: `/sites/${site.id}` })}
              className={`no-underline text-inherit ${isDeleted ? 'opacity-80' : ''}`}
            >
              <div className={`bg-white rounded-xl border ${isDeleted ? 'border-red-200 shadow-none' : 'border-gray-100 shadow-sm hover:shadow-md'} p-5 transition-shadow h-full flex flex-col relative overflow-hidden`}>
                
                {isDeleted && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-red-500" />
                )}

                {/* Site name + actions */}
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-extrabold text-[15px] mb-0.5 pr-2">{site.name}</div>
                    <div className="flex items-center gap-1 text-xs text-gray-500 font-medium">
                      <MapPin className="w-3 h-3" />
                      {site.location}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isDeleted ? (
                      <span className="text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700 border border-red-200">
                        Deleted
                      </span>
                    ) : (
                      <span className={`text-[10.5px] font-bold px-2.5 py-1 rounded-full ${statusChip[site.status] ?? 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                        {site.status.replace(/_/g, ' ')}
                      </span>
                    )}
                    <div onClick={e => e.preventDefault()}>
                      <SiteCardActions siteId={site.id} isDeleted={isDeleted} />
                    </div>
                  </div>
                </div>

                {isDeleted ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-6 bg-red-50/50 rounded-lg border border-red-100 border-dashed mt-2 mb-2">
                    <Clock className="w-8 h-8 text-red-400 mb-2" />
                    <div className="text-sm font-bold text-red-900">Pending Deletion</div>
                    <div className="text-xs font-semibold text-red-600 mt-1">Permanently removed in {daysRemaining} days</div>
                  </div>
                ) : (
                  <>
                    {/* Budget / Spent */}
                    <div className="grid grid-cols-2 gap-3 mb-3.5 mt-auto">
                      <div>
                        <div className="text-[10.5px] text-gray-400 font-bold uppercase mb-0.5 tracking-wide">Budget</div>
                        <div className="text-[15px] font-extrabold">{formatCurrency(budget)}</div>
                      </div>
                      <div>
                        <div className={`text-[10.5px] font-bold uppercase mb-0.5 tracking-wide ${overBudget ? 'text-red-500' : 'text-gray-400'}`}>Spent</div>
                        <div className={`text-[15px] font-extrabold ${overBudget ? 'text-red-500' : ''}`}>{formatCurrency(spent)}</div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-3.5">
                      <div className="flex justify-between mb-1.5">
                        <span className="text-[11.5px] text-gray-500 font-semibold">Progress</span>
                        <span className="text-xs font-extrabold">{pct}%</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${overBudget ? 'bg-red-500' : pct < 30 ? 'bg-amber-400' : 'bg-[#fc6e20]'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Footer stats */}
                    <div className="flex gap-3 flex-wrap">
                      <span className="flex items-center gap-1 text-[11.5px] text-gray-500 font-semibold">
                        <HardHat className="w-3 h-3" /> {site._count.labour}
                      </span>
                      <span className="flex items-center gap-1 text-[11.5px] text-gray-500 font-semibold">
                        <CreditCard className="w-3 h-3" /> {site._count.expenses} expenses
                      </span>
                      {site.currentStage && (
                        <span className="text-[11.5px] text-[#fc6e20] font-bold">{site.currentStage}</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </CardWrapper>
          )
        })}

        {sites.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center col-span-full">
            <div className="text-4xl mb-3">🏗</div>
            <div className="font-bold text-[15px] mb-1.5">No sites yet</div>
            <div className="text-gray-500 text-sm mb-4">Create your first construction site to get started</div>
            <Link
              href="/sites/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#fc6e20] text-white text-sm font-bold hover:bg-[#e85b0d] transition-colors no-underline shadow-sm"
            >
              + New Site
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
