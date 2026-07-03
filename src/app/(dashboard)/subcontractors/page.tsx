import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Users, FileText, CheckCircle2, AlertCircle, HardHat, Plus } from 'lucide-react'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import RemoveButton from '@/components/ui/RemoveButton'

export const dynamic = 'force-dynamic'

async function deactivateSubcontractor(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) return
  const id = formData.get('id') as string
  await prisma.subcontractor.update({ where: { id, companyId: session.user.companyId }, data: { isActive: false } })
  revalidatePath('/subcontractors')
}

async function markSubPaid(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) return
  const id = formData.get('id') as string
  // Reset by updating advance to match raBilled (so pending = 0)
  const sub = await prisma.subcontractor.findFirst({ where: { id, companyId: session.user.companyId } })
  if (!sub) return
  const pending = Math.max(0, Number(sub.raBilled) - Number(sub.advance) - Number(sub.retention))
  await prisma.subcontractor.updateMany({
    where: { id, companyId: session.user.companyId },
    data: { advance: Number(sub.advance) + pending } // mark the pending as now paid via advance
  })
  revalidatePath('/subcontractors')
}

function fmt(n: number) {
  if (n >= 100000) return '₹' + (n / 100000).toFixed(2) + 'L'
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'k'
  return '₹' + n.toLocaleString('en-IN')
}

export default async function SubcontractorsPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const subcontractors = await prisma.subcontractor.findMany({
    where: { companyId, isActive: true },
    orderBy: { name: 'asc' },
  })

  const totals = subcontractors.reduce((acc, s) => {
    const pending = Math.max(0, Number(s.raBilled) - Number(s.advance) - Number(s.retention))
    return {
      workOrder: acc.workOrder + Number(s.workOrderValue),
      raBilled: acc.raBilled + Number(s.raBilled),
      pending: acc.pending + pending,
    }
  }, { workOrder: 0, raBilled: 0, pending: 0 })

  const pendingCount = subcontractors.filter(s => Math.max(0, Number(s.raBilled) - Number(s.advance) - Number(s.retention)) > 0).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Subcontractors</h1>
        <Link href="/subcontractors/new" className="inline-flex items-center gap-1.5 bg-[#fc6e20] text-white rounded-lg px-4 py-2 text-xs font-bold no-underline hover:bg-[#e85b0d] transition-colors shadow-sm">
          <Plus size={13} /> Add Subcontractor
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Subcontractors', value: subcontractors.length, icon: Users, color: 'text-[#fc6e20]', bg: 'bg-orange-50' },
          { label: 'Total Work Orders', value: fmt(totals.workOrder), icon: FileText, color: 'text-slate-600', bg: 'bg-slate-100' },
          { label: 'RA Billed', value: fmt(totals.raBilled), icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Pending Payment', value: fmt(totals.pending), icon: AlertCircle, color: totals.pending > 0 ? 'text-rose-600' : 'text-slate-600', bg: totals.pending > 0 ? 'bg-rose-50' : 'bg-slate-100' },
        ].map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{k.label}</div>
                <div className={`text-xl font-extrabold ${k.color}`}>{k.value}</div>
              </div>
              <div className={`p-2.5 rounded-lg ${k.bg} ${k.color}`}><Icon className="w-5 h-5" /></div>
            </div>
          )
        })}
      </div>

      {subcontractors.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm flex flex-col items-center justify-center">
          <div className="p-4 bg-orange-50 text-[#fc6e20] rounded-full mb-4">
            <HardHat className="w-10 h-10" />
          </div>
          <h2 className="font-bold text-lg text-slate-900 mb-2">No subcontractors yet</h2>
          <p className="text-sm text-slate-500 max-w-md">Add subcontractors to track trade work, RA billing, and outstanding payments.</p>
          <Link href="/subcontractors/new" className="mt-4 inline-block text-[#fc6e20] text-sm font-bold hover:underline">Add your first subcontractor →</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {subcontractors.map(s => {
            const raBilled = Number(s.raBilled)
            const advance = Number(s.advance)
            const retention = Number(s.retention)
            const workOrder = Number(s.workOrderValue)
            const pending = Math.max(0, raBilled - advance - retention)
            const isPending = pending > 0
            const completion = workOrder > 0 ? Math.min(100, Math.round((raBilled / workOrder) * 100)) : 0

            return (
              <div key={s.id} className={`bg-white rounded-xl border shadow-sm p-5 ${isPending ? 'border-rose-200' : 'border-slate-200'}`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: Identity */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg flex-shrink-0 ${isPending ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800">{s.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{s.trade || 'General Trade'} · {s.phone || 'No phone'}</div>
                      {/* Progress bar */}
                      <div className="mt-2 flex items-center gap-2">
                        <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${completion}%` }} />
                        </div>
                        <span className="text-xs text-slate-400 font-semibold">{completion}% billed</span>
                      </div>
                    </div>
                  </div>

                  {/* Middle: Financials */}
                  <div className="grid grid-cols-4 gap-4 flex-shrink-0 text-center">
                    {[
                      { label: 'Work Order', val: fmt(workOrder), cls: 'text-slate-700' },
                      { label: 'RA Billed', val: fmt(raBilled), cls: 'text-slate-700' },
                      { label: 'Advance Paid', val: fmt(advance), cls: 'text-slate-700' },
                      { label: 'Pending', val: isPending ? fmt(pending) : '✓ Settled', cls: isPending ? 'text-rose-600 font-black' : 'text-emerald-600 font-black' },
                    ].map(f => (
                      <div key={f.label}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{f.label}</div>
                        <div className={`text-sm font-bold mt-0.5 ${f.cls}`}>{f.val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isPending && (
                      <form action={markSubPaid}>
                        <input type="hidden" name="id" value={s.id} />
                        <button type="submit" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm">
                          <CheckCircle2 size={13} /> Mark Paid
                        </button>
                      </form>
                    )}
                    <Link href={`/subcontractors/${s.id}/edit`} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors">
                      Edit
                    </Link>
                    <form action={deactivateSubcontractor}>
                      <input type="hidden" name="id" value={s.id} />
                      <RemoveButton name={s.name} message={`Remove "${s.name}"? All data is kept.`} />
                    </form>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
