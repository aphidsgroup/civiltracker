import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatINR } from '@/lib/reports/money'
import { formatDate } from '@/lib/utils'

export default async function PurchasePage({
  searchParams
}: {
  searchParams: Promise<{ siteId?: string }>
}) {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const companyId = session.user.companyId

  const { siteId } = await searchParams

  let filteredSiteId: string | undefined
  if (siteId) {
    const site = await prisma.site.findFirst({
      where: { id: siteId, companyId, deletedAt: null },
      select: { id: true }
    })
    if (!site) redirect('/purchase')
    filteredSiteId = site.id
  }

  const [requests, purchaseOrders, sites] = await Promise.all([
    prisma.purchaseRequest.findMany({
      where: { companyId },
      include: { site: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId, ...(filteredSiteId ? { siteId: filteredSiteId } : {}) },
      include: {
        site: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.site.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    })
  ])

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

  const poStatusStyles: Record<string, string> = {
    DRAFT: 'bg-slate-100 text-slate-600',
    APPROVED: 'bg-[#fff7ed] text-[#e85b0d]',
    SENT: 'bg-blue-100 text-blue-700',
    RECEIVED: 'bg-green-100 text-green-700',
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
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto mb-6">
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

        {/* Purchase Orders table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-sm font-bold text-slate-800">Purchase Orders</div>
            <form method="GET" className="flex items-center gap-2">
              <select name="siteId" defaultValue={filteredSiteId ?? ''} className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700">
                <option value="">All Sites</option>
                {sites.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button type="submit" className="px-3 py-1.5 text-xs font-semibold bg-[#fc6e20] hover:bg-[#e85b0d] text-white rounded-lg transition-colors">
                Filter
              </button>
            </form>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-t border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">PO Number</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Site</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Vendor</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Created</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map(po => (
                <tr key={po.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-sm text-slate-800">{po.poNumber}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{po.site?.name ?? 'Unassigned'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{po.vendor?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-800">{formatINR(po.totalAmount)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${poStatusStyles[po.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {po.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{formatDate(po.createdAt)}</td>
                </tr>
              ))}
              {purchaseOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">No purchase orders yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
