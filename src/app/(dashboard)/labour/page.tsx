import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Users, UserCheck, UserMinus, HardHat, Plus, AlertCircle } from 'lucide-react'
import { revalidatePath } from 'next/cache'
import { LabourCardList } from './LabourCardList'
import { logActivity } from '@/lib/audit'
import { LabourTrade } from '@prisma/client'

export const metadata = { title: 'Labour | Civil Tracker' }
export const dynamic = 'force-dynamic'

async function updateLabour(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) return
  const id = formData.get('id') as string
  const name = formData.get('name') as string
  const phone = formData.get('phone') as string
  const trade = formData.get('trade') as string
  const dailyWage = parseFloat(formData.get('dailyWage') as string) || 0
  const overtimeRate = parseFloat(formData.get('overtimeRate') as string) || 0
  const openingAdvance = parseFloat(formData.get('openingAdvance') as string) || 0
  const siteId = formData.get('siteId') as string
  const status = formData.get('status') as string
  await prisma.labour.updateMany({
    where: { id, companyId: session.user.companyId },
    data: { name, phone: phone || null, trade: trade as LabourTrade, dailyWage, overtimeRate, openingAdvance, siteId, isActive: status === 'active' }
  })
  revalidatePath('/labour')
}

async function markLabourPaid(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) return
  const id = formData.get('id') as string
  const amount = parseFloat(formData.get('amount') as string)
  if (isNaN(amount) || amount <= 0) return
  const latest = await prisma.labourAttendance.findFirst({
    where: { labourId: id },
    orderBy: { date: 'desc' },
  })
  if (latest) {
    await prisma.labourAttendance.update({
      where: { id: latest.id },
      data: { advance: Number(latest.advance) + amount }
    })
  } else {
    await prisma.labour.updateMany({
      where: { id, companyId: session.user.companyId },
      data: { openingAdvance: amount }
    })
  }
  revalidatePath('/labour')
}

async function deactivateLabour(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) return
  const id = formData.get('id') as string
  const confirmed = formData.get('dangerConfirmed') === 'true'

  const worker = await prisma.labour.findUnique({
    where: { id, companyId: session.user.companyId },
    select: { id: true, name: true, trade: true, siteId: true, isActive: true },
  })
  if (!worker) throw new Error('Worker not found.')
  if (!confirmed) {
    throw new Error('Deactivation must be explicitly confirmed.')
  }

  await prisma.labour.update({
    where: { id, companyId: session.user.companyId },
    data: { isActive: false },
  })

  await logActivity({
    userId: session.user.id,
    companyId: session.user.companyId,
    action: 'UPDATE',
    module: 'LABOUR',
    recordId: worker.id,
    description: `${session.user.name ?? session.user.email} deactivated worker "${worker.name}"`,
    before: { isActive: worker.isActive, trade: worker.trade, siteId: worker.siteId, name: worker.name },
    after: { isActive: false, trade: worker.trade, siteId: worker.siteId, name: worker.name },
  })

  revalidatePath('/labour')
}

export default async function LabourPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const [labour, sites] = await Promise.all([
    prisma.labour.findMany({
      where: { companyId },
      include: {
        site: { select: { id: true, name: true } },
        attendance: { select: { status: true, advance: true, overtimeHours: true } }
      },
      orderBy: { name: 'asc' },
    }),
    prisma.site.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    })
  ])

  // Compute per-worker financials
  const workers = labour.map(l => {
    let presentDays = 0
    let totalAdvances = Number(l.openingAdvance) || 0
    l.attendance.forEach(a => {
      if (a.status === 'PRESENT') presentDays += 1
      if (a.status === 'HALF_DAY') presentDays += 0.5
      totalAdvances += Number(a.advance) || 0
    })
    const earned = presentDays * Number(l.dailyWage)
    const pendingBalance = Math.max(0, earned - totalAdvances)
    return {
      id: l.id,
      name: l.name,
      phone: l.phone,
      trade: l.trade,
      dailyWage: Number(l.dailyWage),
      overtimeRate: Number(l.overtimeRate) || 0,
      isActive: l.isActive,
      openingAdvance: Number(l.openingAdvance) || 0,
      site: { name: l.site.name },
      siteId: l.siteId,
      pendingBalance,
      presentDays,
      totalAdvances,
      earned,
    }
  })

  const active = workers.filter(w => w.isActive).length
  const inactive = workers.length - active
  const totalPending = workers.reduce((s, w) => s + w.pendingBalance, 0)
  const pendingCount = workers.filter(w => w.pendingBalance > 0).length

  const fmt = (n: number) => n >= 100000 ? '₹' + (n / 100000).toFixed(1) + 'L' : '₹' + n.toLocaleString('en-IN')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Labour</h1>
          <p className="text-sm text-slate-500 mt-1">{active} active workers</p>
        </div>
        <Link href="/labour/new" className="inline-flex items-center gap-1.5 bg-[#fc6e20] hover:bg-[#e85b0d] text-white rounded-xl px-4 py-2.5 text-sm font-bold transition-colors shadow-sm">
          <Plus size={15} /> Add Worker
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Workers', value: labour.length, icon: Users, color: 'text-[#fc6e20]', bg: 'bg-orange-50' },
          { label: 'Active', value: active, icon: UserCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Inactive', value: inactive, icon: UserMinus, color: 'text-slate-500', bg: 'bg-slate-100' },
          { label: 'Pending Salaries', value: pendingCount > 0 ? `${fmt(totalPending)} (${pendingCount})` : '✓ All Paid', icon: AlertCircle, color: pendingCount > 0 ? 'text-orange-600' : 'text-emerald-600', bg: pendingCount > 0 ? 'bg-orange-50' : 'bg-emerald-50' },
        ].map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">{k.label}</div>
                <div className={`text-lg font-extrabold ${k.color}`}>{k.value}</div>
              </div>
              <div className={`p-2.5 rounded-lg ${k.bg} ${k.color}`}><Icon className="w-5 h-5" /></div>
            </div>
          )
        })}
      </div>

      {/* Other nav links */}
      <div className="flex gap-2 flex-wrap">
        {[
          { href: '/labour/attendance', label: 'Mark Attendance' },
          { href: '/labour/salary', label: 'Salary Runs' },
        ].map(l => (
          <Link key={l.href} href={l.href} className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm">
            {l.label}
          </Link>
        ))}
      </div>

      {/* Cards */}
      {workers.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm flex flex-col items-center">
          <div className="p-4 bg-orange-50 text-[#fc6e20] rounded-full mb-4"><HardHat className="w-10 h-10" /></div>
          <h2 className="font-bold text-lg text-slate-900 mb-2">No workers yet</h2>
          <Link href="/labour/new" className="mt-2 text-[#fc6e20] text-sm font-bold hover:underline">Add your first worker →</Link>
        </div>
      ) : (
        <LabourCardList
          workers={workers}
          sites={sites}
          updateAction={updateLabour}
          markPaidAction={markLabourPaid}
          deactivateAction={deactivateLabour}
        />
      )}
    </div>
  )
}
