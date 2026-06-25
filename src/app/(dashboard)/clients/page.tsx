import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function ClientsPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const clients = await prisma.client.findMany({
    where: { companyId },
    include: {
      _count: { select: { payments: true, invoices: true } },
    },
    orderBy: { name: 'asc' },
  })

  const totalContract = clients.reduce((s, c) => s + Number(c.contractValue), 0)
  const totalPaid = clients.reduce((s, c) => s + Number(c.amountPaid), 0)
  const totalDue = clients.reduce((s, c) => s + Number(c.amountDue), 0)

  return (
    <>
      <div className="topbar">
        <div className="title">Clients</div>
      </div>

      <div style={{ padding: '20px' }}>
        <div className="kpis" style={{ marginBottom: '20px' }}>
          <div className="kpi">
            <div className="klbl">Total Clients</div>
            <div className="knum">{clients.length}</div>
          </div>
          <div className="kpi">
            <div className="klbl">Contract Value</div>
            <div className="knum">₹{(totalContract / 100000).toFixed(2)}L</div>
          </div>
          <div className="kpi">
            <div className="klbl">Amount Paid</div>
            <div className="knum" style={{ color: 'var(--green)' }}>₹{(totalPaid / 100000).toFixed(2)}L</div>
          </div>
          <div className="kpi">
            <div className="klbl">Amount Due</div>
            <div className="knum" style={{ color: totalDue > 0 ? 'var(--red)' : 'var(--ink)' }}>₹{(totalDue / 100000).toFixed(2)}L</div>
          </div>
        </div>

        {clients.length === 0 ? (
          <div className="ct-card" style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>No clients yet</div>
            <div style={{ fontSize: 13, color: 'var(--mut)' }}>Clients are linked to sites. Add client details to track invoicing and payments.</div>
          </div>
        ) : (
          <div className="ct-card" style={{ overflowX: 'auto' }}>
            <table className="ct-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Contact</th>
                  <th>Contract Value</th>
                  <th>Paid</th>
                  <th>Due</th>
                  <th>Invoices</th>
                  <th>Payments</th>
                  <th>Portal</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,var(--p),#1d6fb5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                          {c.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                      </div>
                    </td>
                    <td>
                      {c.phone && <div style={{ fontSize: 13, fontWeight: 600 }}>{c.phone}</div>}
                      {c.email && <div style={{ fontSize: 12, color: 'var(--mut)' }}>{c.email}</div>}
                    </td>
                    <td style={{ fontWeight: 700, fontSize: 13 }}>₹{Number(c.contractValue).toLocaleString('en-IN')}</td>
                    <td style={{ fontWeight: 700, fontSize: 13, color: 'var(--green)' }}>₹{Number(c.amountPaid).toLocaleString('en-IN')}</td>
                    <td style={{ fontWeight: 700, fontSize: 13, color: Number(c.amountDue) > 0 ? 'var(--red)' : 'var(--ink)' }}>
                      ₹{Number(c.amountDue).toLocaleString('en-IN')}
                    </td>
                    <td style={{ fontSize: 13, fontWeight: 700 }}>{c._count.invoices}</td>
                    <td style={{ fontSize: 13, fontWeight: 700 }}>{c._count.payments}</td>
                    <td>
                      <span className={`chip ${c.portalAccess ? 'chip-green' : ''}`}
                        style={{ fontSize: 10, fontWeight: 700, ...(!c.portalAccess ? { background: '#eef2f6', color: 'var(--mut)' } : {}) }}>
                        {c.portalAccess ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
