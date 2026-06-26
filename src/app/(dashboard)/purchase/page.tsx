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

  const statusChip: Record<string, string> = {
    PENDING: 'chip-amber',
    PM_APPROVED: 'chip-blue',
    PO_CREATED: 'chip-blue',
    DELIVERED: 'chip-green',
    CANCELLED: 'chip-red',
  }

  return (
    <>
      <div className="topbar"><div className="title">Purchase Requests</div></div>
      <div style={{ padding: '24px' }}>
        <div className="kpis" style={{ marginBottom: 24 }}>
          {[
            { label: 'Total', value: requests.length },
            { label: 'Pending', value: pending },
            { label: 'In Progress', value: inProgress },
            { label: 'Delivered', value: delivered },
          ].map(k => (
            <div key={k.label} className="kpi">
              <div className="klbl">{k.label}</div>
              <div className="knum" style={{ fontSize: 18 }}>{k.value}</div>
            </div>
          ))}
        </div>
        <div className="ct-card" style={{ overflowX: 'auto' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>All Purchase Requests</div>
          <table className="ct-table">
            <thead>
              <tr><th>Description</th><th>Site</th><th>Qty</th><th>Urgency</th><th>Status</th></tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600, fontSize: 13 }}>{r.description}</td>
                  <td style={{ fontSize: 12, color: 'var(--mut)' }}>{r.site?.name ?? '—'}</td>
                  <td style={{ fontSize: 13 }}>{Number(r.quantity)} {r.unit ?? ''}</td>
                  <td style={{ fontSize: 12 }}>{r.urgency}</td>
                  <td><span className={`chip ${statusChip[r.status] ?? 'chip-amber'}`} style={{ fontSize: 11 }}>{r.status.replace('_', ' ')}</span></td>
                </tr>
              ))}
              {requests.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--mut)' }}>No purchase requests yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
