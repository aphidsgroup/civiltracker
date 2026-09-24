import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { EditSiteModal } from '@/components/client/EditSiteModal'
import { SiteTabsNav } from '@/components/client/SiteTabsNav'
import { exitDeniedPage, liveCompanySiteWhere, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'
import type { TenantPageGrant } from '@/lib/pages/tenant-page-access'

/**
 * Every way into a nested site section. The layout admits a role that may read any one
 * of them, so a section with its own permission (an accountant's site bills) is not
 * blocked by the site header. Pages render in parallel with this layout, so each nested
 * page still runs its own gate; this one only guards what the layout itself reads.
 */
const SITE_SECTION_GRANTS: TenantPageGrant[] = [
  { permission: 'sites.view', module: 'SITES' },
  { permission: 'expenses.view', module: 'EXPENSES' },
  { permission: 'bills.view', module: 'BILLS' },
  { permission: 'dpr.view', module: 'DPR' },
  { permission: 'labour.view', module: 'LABOUR' },
  { permission: 'materials.view', module: 'MATERIALS' },
  { permission: 'vendors.view', module: 'MATERIALS' },
]

const SITE_HEADER_SELECT = {
  id: true, name: true, status: true, location: true, address: true, projectType: true,
  clientName: true, clientPhone: true, areaSqft: true, startDate: true, targetEndDate: true, budget: true,
} as const

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const gate = await resolveTenantPageAccess({ grants: SITE_SECTION_GRANTS })
  if (gate.status === 'denied') exitDeniedPage(gate, `/sites/${id}`)
  const { companyId, can, moduleEnabled } = gate.access

  // Site metadata is read only under sites.view and the SITES module; any other admitted
  // role gets the bare existence check, so a foreign or dead id still leaves the page.
  const showHeader = can('sites.view') && moduleEnabled('SITES')
  const where = { id, ...liveCompanySiteWhere(companyId) }
  const header = showHeader ? await prisma.site.findFirst({ where, select: SITE_HEADER_SELECT }) : null
  const site = header ?? (showHeader ? null : await prisma.site.findFirst({ where, select: { id: true } }))
  const now = new Date()

  if (!site) redirect('/sites')

  return (
    <div className="flex flex-col flex-1 h-full max-w-7xl mx-auto w-full px-4 md:px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2.5">
          <Link href="/sites" className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors">
            <ChevronLeft className="w-4 h-4" />
            Sites
          </Link>
          {header && <>
          <div className="text-lg font-extrabold text-slate-900">{header.name}</div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            {header.status.replace('_', ' ')}
          </div>
          {header.targetEndDate && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              {(() => {
                const diff = Math.ceil((new Date(header.targetEndDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                return diff < 0 ? `Overdue by ${-diff} days` : `${diff} days left`
              })()}
            </div>
          )}
          </>}
        </div>
        <div className="flex items-center gap-2">
          {/* The edit form carries the budget and client contact, so only sites.update gets it. */}
          {header && can('sites.update') && <EditSiteModal site={{
            id: header.id,
            name: header.name,
            location: header.location,
            address: header.address,
            projectType: header.projectType,
            clientName: header.clientName,
            clientPhone: header.clientPhone,
            areaSqft: header.areaSqft ? Number(header.areaSqft) : null,
            startDate: header.startDate,
            targetEndDate: header.targetEndDate,
            budget: Number(header.budget),
            status: header.status
          }} />}
          <div className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer shadow-sm transition-colors">
            Share
          </div>
        </div>
      </div>
      
      <SiteTabsNav siteId={site.id} />
      
      {/* Sub-page content */}
      <div className="mt-2">
        {children}
      </div>
    </div>
  )
}
