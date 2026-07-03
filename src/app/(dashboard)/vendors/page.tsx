import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, Truck, AlertCircle, CheckCircle2, DollarSign } from 'lucide-react'
import { revalidatePath } from 'next/cache'
import RemoveButton from '@/components/ui/RemoveButton'

export const dynamic = 'force-dynamic'

async function deactivateVendor(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) return
  const id = formData.get('id') as string
  await prisma.vendor.update({ where: { id, companyId: session.user.companyId }, data: { isActive: false } })
  revalidatePath('/vendors')
}

async function markVendorPaid(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) return
  const id = formData.get('id') as string
  await prisma.vendor.updateMany({
    where: { id, companyId: session.user.companyId },
    data: { amountPayable: 0 }
  })
  revalidatePath('/vendors')
}

function fmt(n: number) {
  if (n >= 100000) return '₹' + (n / 100000).toFixed(2) + 'L'
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'k'
  return '₹' + n.toLocaleString('en-IN')
}

export default async function VendorsPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  const vendors = await prisma.vendor.findMany({
    where: { companyId: session.user.companyId, isActive: true },
    include: { _count: { select: { purchaseOrders: true } } },
    orderBy: { name: 'asc' },
  })

  const totalPayable = vendors.reduce((s, v) => s + Number(v.amountPayable), 0)
  const totalPurchase = vendors.reduce((s, v) => s + Number(v.totalPurchase), 0)
  const pendingCount = vendors.filter(v => Number(v.amountPayable) > 0).length

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
        <div className="text-base font-bold text-slate-800">Vendors</div>
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
            { label: 'Pending Payment', value: fmt(totalPayable), icon: AlertCircle, color: totalPayable > 0 ? 'text-orange-600' : 'text-slate-600', bg: totalPayable > 0 ? 'bg-orange-50' : 'bg-slate-100' },
            { label: 'Vendors w/ Balance', value: `${pendingCount} of ${vendors.length}`, icon: CheckCircle2, color: pendingCount > 0 ? 'text-rose-600' : 'text-emerald-600', bg: pendingCount > 0 ? 'bg-rose-50' : 'bg-emerald-50' },
          ].map(k => {
            const Icon = k.icon
            return (
              <div key={k.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{k.label}</div>
                  <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
                </div>
                <div className={`p-2.5 rounded-lg ${k.bg} ${k.color}`}><Icon size={18} /></div>
              </div>
            )
          })}
        </div>

        {/* Vendor rows */}
        {vendors.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Truck size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-500">No active vendors yet.</p>
            <Link href="/vendors/new" className="mt-3 inline-block text-[#fc6e20] text-sm font-bold hover:underline">Add your first vendor →</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {vendors.map(v => {
              const pending = Number(v.amountPayable)
              const isPending = pending > 0
              return (
                <div key={v.id} className={`bg-white rounded-xl border shadow-sm p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 ${isPending ? 'border-orange-200' : 'border-slate-200'}`}>
                  {/* Left: Info */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg flex-shrink-0 ${isPending ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}>
                      {v.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800 truncate">{v.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{v.category || 'General Vendor'} · {v.phone || v.email || 'No contact'}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{v._count.purchaseOrders} Purchase Orders</div>
                    </div>
                  </div>

                  {/* Middle: Financials */}
                  <div className="flex items-center gap-6 flex-shrink-0">
                    <div className="text-center">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Total Purchase</div>
                      <div className="text-sm font-bold text-slate-700 mt-0.5">{fmt(Number(v.totalPurchase))}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Pending Payment</div>
                      <div className={`text-base font-black mt-0.5 ${isPending ? 'text-orange-600' : 'text-emerald-600'}`}>
                        {isPending ? fmt(pending) : '✓ Settled'}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isPending && (
                      <form action={markVendorPaid}>
                        <input type="hidden" name="id" value={v.id} />
                        <button type="submit" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm">
                          <CheckCircle2 size={13} /> Mark Paid
                        </button>
                      </form>
                    )}
                    <Link href={`/vendors/${v.id}/edit`} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors">
                      Edit
                    </Link>
                    <form action={deactivateVendor}>
                      <input type="hidden" name="id" value={v.id} />
                      <RemoveButton name={v.name} message={`Remove "${v.name}" from active vendors? All data is kept.`} />
                    </form>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
