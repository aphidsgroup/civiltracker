import { prisma } from '@/lib/prisma'
import { Users, FileText, CheckCircle2, AlertCircle, HardHat, Plus } from 'lucide-react'
import Link from 'next/link'
import { SubCardList } from './SubCardList'
import { deactivateSubcontractorAction, markSubcontractorPaidAction, updateSubcontractorAction } from '@/actions/subcontractors'
import { exitDeniedPage, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'

export const dynamic = 'force-dynamic'

function fmt(n: number) {
  if (n >= 100000) return '₹' + (n / 100000).toFixed(2) + 'L'
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'k'
  return '₹' + n.toLocaleString('en-IN')
}

export default async function SubcontractorsPage() {
  const gate = await resolveTenantPageAccess({ grants: [{ permission: 'vendors.view', module: 'MATERIALS' }] })
  if (gate.status === 'denied') exitDeniedPage(gate, '/subcontractors')
  const { companyId } = gate.access

  const subcontractors = await prisma.subcontractor.findMany({
    where: {
      companyId,
      isActive: true,
      OR: [{ siteId: null }, { site: { companyId, deletedAt: null } }]
    },
    include: { site: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })

  const subs = subcontractors.map(s => ({
    id: s.id,
    name: s.name,
    phone: s.phone,
    trade: s.trade,
    gst: s.gst,
    workOrderValue: Number(s.workOrderValue),
    raBilled: Number(s.raBilled),
    advance: Number(s.advance),
    retention: Number(s.retention),
    status: s.status,
    isActive: s.isActive,
    pending: Math.max(0, Number(s.raBilled) - Number(s.advance) - Number(s.retention)),
  }))

  const totals = subs.reduce((acc, s) => ({
    workOrder: acc.workOrder + s.workOrderValue,
    raBilled: acc.raBilled + s.raBilled,
    pending: acc.pending + s.pending,
  }), { workOrder: 0, raBilled: 0, pending: 0 })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Subcontractors</h1>
          <p className="text-sm text-slate-500 mt-1">{subs.length} active subcontractors</p>
        </div>
        <Link href="/subcontractors/new" className="inline-flex items-center gap-1.5 bg-[#fc6e20] text-white rounded-lg px-4 py-2 text-xs font-bold no-underline hover:bg-[#e85b0d] transition-colors shadow-sm">
          <Plus size={13} /> Add Subcontractor
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Subcontractors', value: subs.length, icon: Users, color: 'text-[#fc6e20]', bg: 'bg-orange-50' },
          { label: 'Total Work Orders', value: fmt(totals.workOrder), icon: FileText, color: 'text-slate-600', bg: 'bg-slate-100' },
          { label: 'RA Billed', value: fmt(totals.raBilled), icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total Pending', value: totals.pending > 0 ? fmt(totals.pending) : '✓ All Settled', icon: AlertCircle, color: totals.pending > 0 ? 'text-rose-600' : 'text-emerald-600', bg: totals.pending > 0 ? 'bg-rose-50' : 'bg-emerald-50' },
        ].map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{k.label}</div>
                <div className={`text-lg font-extrabold ${k.color}`}>{k.value}</div>
              </div>
              <div className={`p-2.5 rounded-lg ${k.bg} ${k.color}`}><Icon className="w-5 h-5" /></div>
            </div>
          )
        })}
      </div>

      {subs.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm flex flex-col items-center">
          <div className="p-4 bg-orange-50 text-[#fc6e20] rounded-full mb-4"><HardHat className="w-10 h-10" /></div>
          <h2 className="font-bold text-lg text-slate-900 mb-2">No subcontractors yet</h2>
          <p className="text-sm text-slate-500 max-w-md">Add subcontractors to track RA billing and pending payments.</p>
          <Link href="/subcontractors/new" className="mt-4 inline-block text-[#fc6e20] text-sm font-bold hover:underline">Add your first subcontractor →</Link>
        </div>
      ) : (
        <SubCardList
          subs={subs}
          updateAction={updateSubcontractorAction}
          markPaidAction={markSubcontractorPaidAction}
          deactivateAction={deactivateSubcontractorAction}
        />
      )}
    </div>
  )
}
