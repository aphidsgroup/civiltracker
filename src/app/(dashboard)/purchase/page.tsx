import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

const STATUS_COLOR: Record<string, string> = {
  DRAFT: '', SUBMITTED: 'chip-amber', APPROVED: 'chip-blue', ORDERED: 'chip-blue',
  RECEIVED: 'chip-green', CANCELLED: 'chip-red',
}

export default async function PurchasePage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const orders = await prisma.purchaseOrder.findMany({
    where: { companyId },
    include: { vendor: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const requests = await prisma.purchaseRequest.findMany({
    where: { companyId },
    include: { site: { select: { name: true } }, material: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  const totalAgg = await prisma.purchaseOrder.aggregate({ where: { companyId }, _sum: { totalAmount: true } })
  const pendingRequests = await prisma.purchaseRequest.count({ where: { companyId, status: 'PENDING' } })

  return (
    <>
      <div className="topbar">
        <div className="title">Purchase</div>
      </div>

      <div style={{ padding: '20px' }}>
        <div className="kpis" style={{ marginBottom: '20px' }}>
          <div className="kpi">
            <div className="klbl">Purchase Orders</div>
            <div className="knum">{orders.length}</div>
          </div>
          <div className="kpi">
            <div className="klbl">Total Value</div>
            <div className="knum">₹{(Number(totalAgg._sum.totalAmount || 0) / 100000).toFixed(2)}L</div>
          </div>
          <div className="kpi">
            <div className="klbl">Pending Requests</div>
            <div className="knum">{pendingRequests}</div>
            <div className="ksub warn"><span>●</span>Awaiting approval</div>
          </div>
        </div>

        <div className="dgrid">
          <div className="colL">
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: 'var(--mut)' }}>PURCHASE ORDERS</div>
            <div className="ct-card" style={{ overflowX: 'auto' }}>
              {orders.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--mut)', fontSize: 13 }}>No purchase orders yet.</div>
              ) : (
                <table className="ct-table">
                  <thead>
                    <tr><th>PO Number</th><th>Vendor</th><th>Amount</th><th>Status</th><th>Date</th></tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id}>
                        <td style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace' }}>{o.poNumber}</td>
                        <td style={{ fontSize: 13, color: 'var(--mut)' }}>{o.vendor?.name ?? '—'}</td>
                        <td style={{ fontWeight: 700, fontSize: 14 }}>₹{Number(o.totalAmount).toLocaleString('en-IN')}</td>
                        <td>
                          <span className={`chip ${STATUS_COLOR[o.status] ?? ''}`}
                            style={{ fontSize: 10, fontWeight: 700, ...(!STATUS_COLOR[o.status] ? { background: '#eef2f6', color: 'var(--mut)' } : {}) }}>
                            {o.status}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--mut)' }}>
                          {new Date(o.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          <div className="colR">
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: 'var(--mut)' }}>MATERIAL REQUESTS</div>
            <div className="ct-card">
              {requests.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--mut)', fontSize: 13 }}>No requests.</div>
              ) : (
                <div>
                  {requests.map((r, i) => (
                    <div key={r.id} style={{ padding: '12px 16px', borderBottom: i < requests.length - 1 ? '1px solid var(--line)' : 'none' }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{r.material?.name ?? r.description ?? '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 2 }}>{r.site?.name} · Qty: {Number(r.quantity)}</div>
                      <div style={{ marginTop: 6 }}>
                        <span className={`chip ${r.status === 'APPROVED' ? 'chip-green' : r.status === 'REJECTED' ? 'chip-red' : 'chip-amber'}`} style={{ fontSize: 10 }}>
                          <span className="chip-dot"></span>{r.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
