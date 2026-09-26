import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LabourTrade } from '@prisma/client'
import { updateLabourAction } from '@/actions/labour'
import { exitDeniedPage, liveCompanySiteWhere, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'

export const dynamic = 'force-dynamic'

export default async function EditLabourPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Same live permission and module `updateLabourAction` enforces.
  const gate = await resolveTenantPageAccess({ grants: [{ permission: 'labour.manage', module: 'LABOUR' }] })
  if (gate.status === 'denied') exitDeniedPage(gate, `/labour/${id}/edit`)
  const { companyId } = gate.access

  // Exactly this worker of this company on a live site; anything else reads nothing more.
  const labour = await prisma.labour.findFirst({
    where: { id, companyId, site: liveCompanySiteWhere(companyId) },
  })

  if (!labour) redirect('/labour')

  const sites = await prisma.site.findMany({
    where: { ...liveCompanySiteWhere(companyId), status: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  const attendances = await prisma.labourAttendance.findMany({
    where: { labourId: labour.id }
  })

  let totalAdvance = Number(labour.openingAdvance) || 0
  let totalEarned = 0
  
  attendances.forEach(a => {
    totalAdvance += Number(a.advance) || 0
    const wage = Number(labour.dailyWage) || 0
    if (a.status === 'PRESENT') totalEarned += wage
    if (a.status === 'HALF_DAY') totalEarned += (wage / 2)
    if (a.overtimeHours > 0) totalEarned += (wage / 8) * a.overtimeHours
  })

  const pendingSalary = Math.max(0, totalEarned - totalAdvance)

  const trades: { value: LabourTrade; label: string }[] = [
    { value: 'MASON', label: 'Mason' },
    { value: 'HELPER', label: 'Helper' },
    { value: 'CARPENTER', label: 'Carpenter' },
    { value: 'BAR_BENDER', label: 'Bar Bender' },
    { value: 'ELECTRICIAN', label: 'Electrician' },
    { value: 'PLUMBER', label: 'Plumber' },
    { value: 'PAINTER', label: 'Painter' },
    { value: 'TILE_WORKER', label: 'Tile Worker' },
    { value: 'WELDER', label: 'Welder' },
    { value: 'SUPERVISOR', label: 'Supervisor' },
  ]

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">Edit Labour Worker</h1>
          <p className="text-xs text-slate-500 mt-0.5">Update worker details</p>
        </div>
        <Link href="/labour" className="text-sm text-slate-500 hover:text-slate-900 font-medium transition-colors">← Back</Link>
      </div>

      <div className="p-6 max-w-2xl mx-auto space-y-6">
        {/* Financial Summary */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Total Earned</p>
            <p className="text-lg font-black text-slate-800">₹{totalEarned.toLocaleString('en-IN')}</p>
          </div>
          <div className="w-px h-10 bg-slate-200" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Total Advances</p>
            <p className="text-lg font-black text-[#fc6e20]">₹{totalAdvance.toLocaleString('en-IN')}</p>
          </div>
          <div className="w-px h-10 bg-slate-200" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Pending Salary</p>
            <p className={`text-lg font-black ${pendingSalary > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              ₹{pendingSalary.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <form action={updateLabourAction} className="space-y-5">
            <input type="hidden" name="id" value={labour.id} />
            
            {/* Name */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Full Name *</label>
              <input
                name="name" required defaultValue={labour.name} placeholder="e.g. Ramesh Kumar"
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Phone Number</label>
              <input
                name="phone" type="tel" defaultValue={labour.phone || ''} placeholder="e.g. 9876543210"
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
              />
            </div>

            {/* Trade */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Trade / Skill *</label>
              <select
                name="trade" required defaultValue={labour.trade}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all bg-white"
              >
                <option value="">Select trade...</option>
                {trades.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Daily Wage */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Daily Wage (₹) *</label>
                <input
                  name="dailyWage" type="number" step="0.01" required defaultValue={Number(labour.dailyWage)} placeholder="0.00"
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
                />
              </div>

              {/* Overtime Rate */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Overtime / Hr (₹)</label>
                <input
                  name="overtimeRate" type="number" step="0.01" defaultValue={Number(labour.overtimeRate) || ''} placeholder="0.00"
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
                />
              </div>

              {/* Opening Advance */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Upfront Advance Paid (₹)</label>
                <input
                  name="openingAdvance" type="number" step="0.01" defaultValue={Number(labour.openingAdvance) || ''} placeholder="0.00"
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
                />
              </div>
            </div>

            {/* Assign Site */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Assign to Site *</label>
              <select
                name="siteId" required defaultValue={labour.siteId}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all bg-white"
              >
                <option value="">Select site...</option>
                {sites.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            
            {/* Status */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Status</label>
              <select
                name="isActive" required defaultValue={labour.isActive ? 'true' : 'false'}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all bg-white"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                className="bg-[#fc6e20] hover:bg-[#e85b0d] text-white rounded-xl px-6 py-2.5 text-sm font-bold transition-colors shadow-sm"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
