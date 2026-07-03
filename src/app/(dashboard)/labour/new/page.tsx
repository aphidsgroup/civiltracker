import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { LabourTrade } from '@prisma/client'

export const dynamic = 'force-dynamic'

async function createLabour(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')
  const { companyId } = session.user

  const name = formData.get('name') as string
  const phone = (formData.get('phone') as string) || undefined
  const trade = formData.get('trade') as LabourTrade
  const dailyWage = parseFloat(formData.get('dailyWage') as string)
  const overtimeRate = formData.get('overtimeRate') ? parseFloat(formData.get('overtimeRate') as string) : undefined
  const siteId = formData.get('siteId') as string

  if (!name || !trade || !siteId || isNaN(dailyWage)) throw new Error('Missing required fields')

  await prisma.labour.create({
    data: {
      companyId,
      siteId,
      name,
      phone,
      trade,
      dailyWage,
      overtimeRate,
      isActive: true,
    },
  })

  revalidatePath('/labour')
  redirect('/labour')
}

export default async function NewLabourPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const sites = await prisma.site.findMany({
    where: { companyId, deletedAt: null, status: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

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
          <h1 className="text-xl font-extrabold text-slate-800">Add Labour Worker</h1>
          <p className="text-xs text-slate-500 mt-0.5">Register a new worker to track attendance and wages</p>
        </div>
        <Link href="/labour" className="text-sm text-slate-500 hover:text-slate-900 font-medium transition-colors">← Back</Link>
      </div>

      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <form action={createLabour} className="space-y-5">
            {/* Name */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Full Name *</label>
              <input
                name="name" required placeholder="e.g. Ramesh Kumar"
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Phone Number</label>
              <input
                name="phone" type="tel" placeholder="e.g. 9876543210"
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
              />
            </div>

            {/* Trade */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Trade / Skill *</label>
              <select
                name="trade" required defaultValue="HELPER"
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
              >
                {trades.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Site */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Assigned Site *</label>
              <select
                name="siteId" required
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
              >
                <option value="">-- Select Site --</option>
                {sites.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {sites.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">No active sites found. <Link href="/sites/new" className="underline">Create a site first →</Link></p>
              )}
            </div>

            {/* Wages */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Daily Wage (₹) *</label>
                <input
                  name="dailyWage" type="number" required min="0" step="0.01" placeholder="e.g. 500"
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Overtime Rate (₹/hr)</label>
                <input
                  name="overtimeRate" type="number" min="0" step="0.01" placeholder="e.g. 75"
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] transition-all"
                />
              </div>
            </div>

            <div className="pt-4 flex items-center gap-3 border-t border-slate-100">
              <button
                type="submit"
                className="px-6 py-2.5 bg-[#fc6e20] hover:bg-[#e85b0d] text-white text-sm font-bold rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                Add Worker
              </button>
              <Link href="/labour" className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-colors">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
