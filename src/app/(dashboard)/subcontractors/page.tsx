import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Users, FileText, CheckCircle2, AlertCircle, HardHat, Plus } from 'lucide-react'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { SubCardList } from './SubCardList'
import { logActivity } from '@/lib/audit'

export const dynamic = 'force-dynamic'

async function updateSubcontractor(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) return
  const id = formData.get('id') as string
  await prisma.subcontractor.updateMany({
    where: { id, companyId: session.user.companyId },
    data: {
      name: formData.get('name') as string,
      phone: (formData.get('phone') as string) || null,
      trade: (formData.get('trade') as string) || null,
      gst: (formData.get('gst') as string) || null,
      workOrderValue: parseFloat(formData.get('workOrderValue') as string) || 0,
      raBilled: parseFloat(formData.get('raBilled') as string) || 0,
      advance: parseFloat(formData.get('advance') as string) || 0,
      retention: parseFloat(formData.get('retention') as string) || 0,
      status: (formData.get('status') as string) || 'Active',
    }
  })
  revalidatePath('/subcontractors')
}

async function markSubPaid(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) return
  const id = formData.get('id') as string
  const amount = parseFloat(formData.get('amount') as string)
  if (isNaN(amount) || amount <= 0) return
  // Record payment by adding to advance so pending becomes 0
  const sub = await prisma.subcontractor.findFirst({ where: { id, companyId: session.user.companyId } })
  if (!sub) return
  await prisma.subcontractor.updateMany({
    where: { id, companyId: session.user.companyId },
    data: { advance: Number(sub.advance) + amount }
  })
  revalidatePath('/subcontractors')
}

async function deactivateSubcontractor(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) return
  const id = formData.get('id') as string
  const confirmed = formData.get('dangerConfirmed') === 'true'

  const sub = await prisma.subcontractor.findUnique({
    where: { id, companyId: session.user.companyId },
    select: { id: true, name: true, trade: true, status: true, isActive: true, raBilled: true, advance: true, retention: true },
  })
  if (!sub) throw new Error('Subcontractor not found.')
  if (!confirmed) {
    throw new Error('Deactivation must be explicitly confirmed.')
  }

  await prisma.subcontractor.update({ where: { id, companyId: session.user.companyId }, data: { isActive: false } })

  await logActivity({
    userId: session.user.id,
    companyId: session.user.companyId,
    action: 'UPDATE',
    module: 'SUBCONTRACTOR',
    recordId: sub.id,
    description: `${session.user.name ?? session.user.email} deactivated subcontractor "${sub.name}"`,
    before: { isActive: sub.isActive, trade: sub.trade, status: sub.status, raBilled: Number(sub.raBilled), advance: Number(sub.advance), retention: Number(sub.retention), name: sub.name },
    after: { isActive: false, trade: sub.trade, status: sub.status, raBilled: Number(sub.raBilled), advance: Number(sub.advance), retention: Number(sub.retention), name: sub.name },
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
    where: {
      companyId,
      isActive: true,
      OR: [{ siteId: null }, { site: { deletedAt: null } }]
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
          updateAction={updateSubcontractor}
          markPaidAction={markSubPaid}
          deactivateAction={deactivateSubcontractor}
        />
      )}
    </div>
  )
}
