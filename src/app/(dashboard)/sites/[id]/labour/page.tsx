import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { LabourTrade } from '@prisma/client'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Users, UserCheck, UserMinus, HardHat, Plus, AlertCircle } from 'lucide-react'
import { revalidatePath } from 'next/cache'
import { LabourCardList } from '@/app/(dashboard)/labour/LabourCardList'

export const metadata = { title: 'Site Labour | Civil Tracker' }
export const dynamic = 'force-dynamic'

export default async function SiteLabourPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user
  const { id: siteId } = await params

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
    const status = formData.get('status') as string
    await prisma.labour.updateMany({
      where: { id, companyId: session.user.companyId },
      data: { name, phone: phone || null, trade: trade as LabourTrade, dailyWage, overtimeRate, openingAdvance, siteId, isActive: status === 'active' }
    })
    revalidatePath(`/sites/${siteId}/labour`)
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
    revalidatePath(`/sites/${siteId}/labour`)
  }
  
  async function deactivateLabour(formData: FormData) {
    'use server'
    const session = await auth()
    if (!session?.user?.companyId) return
    const id = formData.get('id') as string
    await prisma.labour.update({
      where: { id, companyId: session.user.companyId },
      data: { isActive: false },
    })
    revalidatePath(`/sites/${siteId}/labour`)
  }

  const [labour, sites] = await Promise.all([
    prisma.labour.findMany({
      where: { companyId, siteId },
      include: {
        site: { select: { id: true, name: true } },
        attendance: { select: { status: true, advance: true, overtimeHours: true } }
      },
      orderBy: { name: 'asc' },
    }),
    prisma.site.findMany({
      where: { companyId },
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
    <div className="flex flex-col gap-6 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Site Labour Details</h2>
          <p className="text-sm text-slate-500 mt-1">{active} active workers on this site</p>
        </div>
        <Link href="/labour/new" className="inline-flex items-center gap-1.5 bg-[#fc6e20] hover:bg-[#e85b0d] text-white rounded-xl px-4 py-2 text-sm font-bold transition-colors shadow-sm">
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
                <div className={`text-xl font-black ${k.color}`}>{k.value}</div>
              </div>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${k.bg} ${k.color}`}>
                <Icon size={20} strokeWidth={2} />
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-6">
        <h3 className="font-bold text-slate-800 text-base mb-4">Labour Roster & Payments</h3>
        {workers.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <HardHat size={40} className="text-slate-300 mx-auto mb-3" />
            <div className="font-bold text-slate-700">No Labour Assigned</div>
            <div className="text-sm text-slate-500 mt-1 mb-4">You haven&apos;t assigned any workers to this site yet.</div>
            <Link href="/labour/new" className="inline-flex font-bold text-sm text-[#fc6e20] hover:text-[#e85b0d]">
              + Add a worker now
            </Link>
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
    </div>
  )
}
