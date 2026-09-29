import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { assignedSiteWhere, exitDeniedPage, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'
import Link from 'next/link'
import { ChevronLeft, Info } from 'lucide-react'
import { ChecklistMobileClient } from './ChecklistMobileClient'

export const dynamic = 'force-dynamic'

export default async function MobileChecklistsPage({ searchParams }: { searchParams: Promise<{ siteId?: string }> }) {
  // Live principal and company only; the page ticks progress, so it needs the same grants
  // as `toggleTaskStatus` progress: `tasks.manage` or `dpr.create`, with TASKS enabled.
  const gate = await resolveTenantPageAccess({
    grants: [
      { permission: 'tasks.manage', module: 'TASKS' },
      { permission: 'dpr.create', module: 'TASKS' },
    ],
  })
  if (gate.status === 'denied') exitDeniedPage(gate, '/mobile/checklists')
  const { companyId } = gate.access

  const resolvedParams = await searchParams
  const siteId = resolvedParams?.siteId

  if (!siteId) redirect('/mobile/home')

  // A live site of exactly this company; a field role opens only its assigned sites.
  const site = await prisma.site.findFirst({
    where: { id: siteId, ...(await assignedSiteWhere(gate.access)) },
    select: { id: true, name: true },
  })

  if (!site) redirect('/mobile/home')

  const checklist = await prisma.projectChecklist.findFirst({
    where: { siteId: site.id, companyId },
    include: {
      stages: {
        orderBy: { order: 'asc' },
        include: {
          categories: {
            where: { isNeglected: false },
            orderBy: { order: 'asc' },
            include: {
              tasks: {
                where: { isNeglected: false, isClientDone: false },
                orderBy: { order: 'asc' }
              }
            }
          }
        }
      }
    }
  })

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/mobile/home" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
            <ChevronLeft size={20} strokeWidth={2.5} />
          </Link>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 leading-none">Site Checklist</h1>
            <p className="text-xs font-bold text-[#fc6e20] mt-1">{site.name}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 pb-24">
        {!checklist ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Info className="text-slate-400 w-8 h-8" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">No Checklist Found</h2>
            <p className="text-sm text-slate-500 mt-2 max-w-[250px] mx-auto">
              This site doesn&apos;t have an active checklist. A company admin must enable it first.
            </p>
          </div>
        ) : (
          <ChecklistMobileClient siteId={site.id} checklist={checklist} />
        )}
      </div>
    </div>
  )
}
