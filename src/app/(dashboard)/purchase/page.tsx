import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function PurchasePage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  const requests = await prisma.purchaseRequest.findMany({
    where: { companyId: session.user.companyId },
    include: { site: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const pending = requests.filter(r => r.status === 'PENDING').length
  const inProgress = requests.filter(r => r.status === 'PM_APPROVED' || r.status === 'PO_CREATED').length
  const delivered = requests.filter(r => r.status === 'DELIVERED').length

  const statusStyles: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-700',
    PM_APPROVED: 'bg-[#fff7ed] text-[#e85b0d]',
    PO_CREATED: 'bg-[#fff7ed] text-[#e85b0d]',
    DELIVERED: 'bg-green-100 text-green-700',
    CANCELLED: 'bg-red-100 text-red-600',
  }

  return (
    <>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
        <div className="text-base font-bold text-slate-800">Purchase Requests & Orders</div>
        <a href="/purchase/new" className="bg-[#fc6e20] text-white rounded-lg px-4 py-2 text-xs font-bold no-underline hover:bg-[#e85b0d] transition-colors">
          + Create PO
        </a>
      </div>

      <div className="p-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total', value: requests.length },
            { label: 'Pending', value: pending },
            { label: 'In Progress', value: inProgress },
            { label: 'Delivered', value: delivered },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{k.label}</div>
              <div className="text-lg font-bold text-slate-800">{k.value}</div>
            </div>
          ))}
        </div>

        {/* Table card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <div className="p-4 text-sm font-bold text-slate-800">All Purchase Requests</div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-t border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Site</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Qty</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Urgency</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-sm text-slate-800">{r.description}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{r.site?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{Number(r.quantity)} {r.unit ?? ''}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{r.urgency}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyles[r.status] ?? 'bg-amber-100 text-amber-700'}`}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">No purchase requests yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
