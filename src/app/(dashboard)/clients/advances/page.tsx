import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { IndianRupee, PlusCircle, Building2, Calendar, FileText, TrendingUp } from 'lucide-react'

async function createAdvanceAction(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  const siteId = formData.get('siteId') as string
  const amount = parseFloat(formData.get('amount') as string)
  const purpose = (formData.get('purpose') as string)?.trim()
  const receivedAt = formData.get('receivedAt') as string

  if (!siteId || !amount || amount <= 0 || !purpose || !receivedAt) {
    throw new Error('All fields are required.')
  }

  const companyId = session.user.companyId

  const site = await prisma.site.findFirst({
    where: { id: siteId, companyId },
    select: { id: true, name: true, clientId: true },
  })
  if (!site) throw new Error('Site not found.')

  let clientId: string
  if (site.clientId) {
    clientId = site.clientId
  } else {
    const genericClient = await prisma.client.create({
      data: { companyId, name: `Client – ${site.name}`, phone: '' },
    })
    clientId = genericClient.id
    await prisma.site.update({ where: { id: site.id }, data: { clientId: genericClient.id } })
  }

  await prisma.payment.create({
    data: {
      companyId,
      clientId,
      siteId,
      amount,
      type: 'ADVANCE',
      mode: 'BANK_TRANSFER',
      notes: purpose,
      status: 'CONFIRMED',
      paidAt: new Date(receivedAt),
    },
  })

  revalidatePath('/clients/advances')
}

export default async function ClientAdvancesPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  const companyId = session.user.companyId

  const [advances, sites] = await Promise.all([
    prisma.payment.findMany({
      where: { companyId, type: 'ADVANCE' },
      include: {
        client: { select: { name: true } },
      },
      orderBy: { paidAt: 'desc' },
      take: 100,
    }),
    prisma.site.findMany({
      where: { companyId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, name: true, location: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const totalAdvances = advances.reduce((sum, a) => sum + Number(a.amount), 0)

  const now = new Date()
  const localDatetime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)

  return (
    <>
      {/* Page Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-slate-200 bg-white">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <IndianRupee size={20} className="text-[#fc6e20]" />
            Client Advances
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">Track advance payments received from clients</p>
        </div>
      </div>

      <div className="p-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6 items-start">

          {/* Left: Records table */}
          <div className="space-y-5">
            {/* Summary KPI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#fff7ed] flex items-center justify-center flex-shrink-0">
                  <TrendingUp size={22} className="text-[#fc6e20]" />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Advances</div>
                  <div className="text-2xl font-black text-slate-800 mt-0.5 tabular-nums">
                    ₹{totalAdvances.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <FileText size={22} className="text-blue-600" />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Records</div>
                  <div className="text-2xl font-black text-slate-800 mt-0.5 tabular-nums">{advances.length}</div>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <div className="text-sm font-extrabold text-slate-700">Advance Records</div>
                <div className="text-xs text-slate-400 font-medium mt-0.5">Showing latest {advances.length} entries</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/75 text-xs font-bold text-slate-400 uppercase tracking-wider">
                      <th className="px-6 py-3">Date / Time</th>
                      <th className="px-6 py-3">Client</th>
                      <th className="px-6 py-3">Amount</th>
                      <th className="px-6 py-3">Purpose</th>
                      <th className="px-6 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {advances.map(adv => (
                      <tr key={adv.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 text-xs font-medium text-slate-500 whitespace-nowrap">
                          {adv.paidAt
                            ? new Date(adv.paidAt).toLocaleString('en-IN', {
                                day: '2-digit', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })
                            : '—'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-semibold text-slate-800">{adv.client?.name ?? '—'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-extrabold text-emerald-700">
                            ₹{Number(adv.amount).toLocaleString('en-IN')}
                          </span>
                        </td>
                        <td className="px-6 py-4 max-w-[220px]">
                          <div className="text-xs text-slate-600 truncate">{adv.notes ?? '—'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            Confirmed
                          </span>
                        </td>
                      </tr>
                    ))}
                    {advances.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-14 text-center text-sm text-slate-400">
                          No client advances recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right: Add New Advance Form */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden sticky top-6">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-[#fff7ed] to-white">
              <div className="w-9 h-9 rounded-xl bg-[#fc6e20]/15 flex items-center justify-center flex-shrink-0">
                <PlusCircle size={18} className="text-[#fc6e20]" />
              </div>
              <div>
                <div className="text-sm font-extrabold text-slate-800">Record New Advance</div>
                <div className="text-xs text-slate-500 font-medium">Log a payment received from client</div>
              </div>
            </div>

            <form action={createAdvanceAction} className="p-6 space-y-4">
              {/* Site */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  <Building2 size={11} /> Project / Site
                </label>
                {sites.length === 0 ? (
                  <div className="text-xs text-slate-400 bg-slate-50 rounded-xl px-4 py-3 border border-slate-200">
                    No active sites. <Link href="/sites" className="text-[#fc6e20] underline">Add a site first.</Link>
                  </div>
                ) : (
                  <select
                    name="siteId"
                    required
                    className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/30 focus:border-[#fc6e20] transition-all"
                  >
                    {sites.map(s => (
                      <option key={s.id} value={s.id}>{s.name} — {s.location}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Amount */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  <IndianRupee size={11} /> Amount (₹) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  name="amount"
                  required
                  min={1}
                  step="0.01"
                  placeholder="e.g. 250000"
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/30 focus:border-[#fc6e20] transition-all"
                />
              </div>

              {/* Date & Time */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  <Calendar size={11} /> Date &amp; Time Received <span className="text-rose-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  name="receivedAt"
                  required
                  defaultValue={localDatetime}
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/30 focus:border-[#fc6e20] transition-all"
                />
              </div>

              {/* Purpose */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  <FileText size={11} /> Purpose / Notes <span className="text-rose-500">*</span>
                </label>
                <textarea
                  name="purpose"
                  required
                  rows={3}
                  placeholder="e.g. Advance for foundation work — Stage 1 mobilisation."
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/30 focus:border-[#fc6e20] transition-all resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-[#fc6e20] hover:bg-[#e85b0d] text-white text-sm font-bold rounded-xl transition-colors cursor-pointer shadow-sm mt-1"
              >
                Save Advance Record
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}
