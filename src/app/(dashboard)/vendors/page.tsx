import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Plus, Truck, AlertCircle, CheckCircle2, DollarSign } from 'lucide-react'
import { VendorCardList } from './VendorCardList'
import { deactivateVendorAction, markVendorPaidAction, updateVendorAction } from '@/actions/vendors'
import { exitDeniedPage, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'

export const dynamic = 'force-dynamic'

function fmt(n: number) {
  if (n >= 100000) return '₹' + (n / 100000).toFixed(2) + 'L'
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'k'
  return '₹' + n.toLocaleString('en-IN')
}

export default async function VendorsPage() {
  const gate = await resolveTenantPageAccess({ grants: [{ permission: 'vendors.view', module: 'MATERIALS' }] })
  if (gate.status === 'denied') exitDeniedPage(gate, '/vendors')
  const { companyId } = gate.access

  const vendors = await prisma.vendor.findMany({
    where: {
      companyId,
      isActive: true,
      OR: [{ siteId: null }, { site: { companyId, deletedAt: null } }]
    },
    include: { site: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })

  const totalPayable = vendors.reduce((s, v) => s + Number(v.amountPayable), 0)
  const totalPurchase = vendors.reduce((s, v) => s + Number(v.totalPurchase), 0)
  const pendingCount = vendors.filter(v => Number(v.amountPayable) > 0).length

  const rows = vendors.map(v => ({
    id: v.id,
    name: v.name,
    phone: v.phone,
    email: v.email,
    gst: v.gst,
    category: v.category,
    address: v.address,
    paymentTerms: v.paymentTerms,
    rating: v.rating ? Number(v.rating) : null,
    totalPurchase: Number(v.totalPurchase),
    amountPayable: Number(v.amountPayable),
    isActive: v.isActive,
  }))

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
        <div>
          <div className="text-base font-bold text-slate-800">Vendors</div>
          <div className="text-xs text-slate-400">{vendors.length} active vendors</div>
        </div>
        <Link href="/vendors/new" className="inline-flex items-center gap-1.5 bg-[#fc6e20] text-white rounded-lg px-4 py-2 text-xs font-bold no-underline hover:bg-[#e85b0d] transition-colors shadow-sm">
          <Plus size={13} /> Add Vendor
        </Link>
      </div>

      <div className="p-6 space-y-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Vendors', value: vendors.length, icon: Truck, color: 'text-sky-600', bg: 'bg-sky-50' },
            { label: 'Total Purchase', value: fmt(totalPurchase), icon: DollarSign, color: 'text-slate-600', bg: 'bg-slate-100' },
            { label: 'Total Pending', value: fmt(totalPayable), icon: AlertCircle, color: totalPayable > 0 ? 'text-orange-600' : 'text-slate-500', bg: totalPayable > 0 ? 'bg-orange-50' : 'bg-slate-100' },
            { label: 'With Balance', value: `${pendingCount} of ${vendors.length}`, icon: CheckCircle2, color: pendingCount > 0 ? 'text-rose-600' : 'text-emerald-600', bg: pendingCount > 0 ? 'bg-rose-50' : 'bg-emerald-50' },
          ].map(k => {
            const Icon = k.icon
            return (
              <div key={k.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{k.label}</div>
                  <div className={`text-lg font-bold ${k.color}`}>{k.value}</div>
                </div>
                <div className={`p-2.5 rounded-lg ${k.bg} ${k.color}`}><Icon size={18} /></div>
              </div>
            )
          })}
        </div>

        {rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Truck size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-500">No active vendors yet.</p>
            <Link href="/vendors/new" className="mt-3 inline-block text-[#fc6e20] text-sm font-bold hover:underline">Add your first vendor →</Link>
          </div>
        ) : (
          <VendorCardList
            vendors={rows}
            updateAction={updateVendorAction}
            markPaidAction={markVendorPaidAction}
            deactivateAction={deactivateVendorAction}
          />
        )}
      </div>
    </>
  )
}
