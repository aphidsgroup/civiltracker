import { createDpr } from '@/actions/dpr'
import { prisma } from '@/lib/prisma'
import { assignedSiteWhere, exitDeniedPage, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'
import { redirect } from 'next/navigation'
import { ClipboardList } from 'lucide-react'
import DprFormClient from './DprFormClient'

export default async function MobileDprPage({ searchParams }: { searchParams: Promise<{ siteId?: string }> }) {
  // Live principal, `dpr.create` and the DPR module, never the JWT claims, before any read.
  const gate = await resolveTenantPageAccess({ grants: [{ permission: 'dpr.create', module: 'DPR' }] })
  if (gate.status === 'denied') exitDeniedPage(gate, '/mobile/dpr')

  // The same policy `createDpr` enforces: ACTIVE live sites of the live company, and for a
  // field role only the sites it is assigned to — none when it has no assignment.
  const siteWhere = await assignedSiteWhere(gate.access)

  const { siteId } = await searchParams

  const sites = await prisma.site.findMany({
    where: { ...siteWhere, status: 'ACTIVE' },
    select: { id: true, name: true }
  })
  const defaultSiteId = sites.some((site) => site.id === siteId) ? siteId : undefined

  async function submitDpr(formData: FormData) {
    'use server'
    await createDpr(formData)
    redirect('/mobile/home')
  }

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto bg-gray-50 min-h-screen">
      <div className="flex items-center gap-2.5 mb-5 pt-2">
        <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
          <ClipboardList className="w-5 h-5" />
        </div>
        <h1 className="text-lg font-bold text-gray-900">Submit Daily Progress</h1>
      </div>

      <DprFormClient sites={sites} defaultSiteId={defaultSiteId} submitAction={submitDpr} />
    </div>
  )
}
