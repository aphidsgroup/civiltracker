import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function SubcontractorsPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const subcontractors = await prisma.subcontractor.findMany({
    where: { companyId },
    orderBy: { name: 'asc' },
  })

  const totalWorkAgg = await prisma.subcontractor.aggregate({
    where: { companyId },
    _sum: { workOrderValue: true, raBilled: true },
  })
  const totalWork = Number(totalWorkAgg._sum.workOrderValue || 0)
  const totalBilled = Number(totalWorkAgg._sum.raBilled || 0)
  const outstanding = totalWork - totalBilled

  return (
    <>
      <div className="topbar">
        <div className="title">Subcontractors</div>
      </div>

      <div style={{ padding: '20px' }}>
        <div className="kpis" style={{ marginBottom: '20px' }}>
          <div className="kpi">
            <div className="klbl">Subcontractors</div>
            <div className="knum">{subcontractors.length}</div>
          </div>
          <div className="kpi">
            <div className="klbl">Total Work Orders</div>
            <div className="knum">₹{(totalWork / 100000).toFixed(2)}L</div>
          </div>
          <div className="kpi">
            <div className="klbl">RA Billed</div>
            <div className="knum" style={{ color: 'var(--green)' }}>₹{(totalBilled / 100000).toFixed(2)}L</div>
          </div>
          <div className="kpi">
            <div className="klbl">Outstanding</div>
            <div className="knum" style={{ color: outstanding > 0 ? 'var(--amber)' : 'var(--ink)' }}>₹{(outstanding / 100000).toFixed(2)}L</div>
          </div>
        </div>

        {subcontractors.length === 0 ? (
          <div className="ct-card" style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👷</div>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>No subcontractors yet</div>
            <div style={{ fontSize: 13, color: 'var(--mut)' }}>Add subcontractors to track trade work, RA billing, and outstanding amounts.</div>
          </div>
        ) : (
          <div className="ct-card" style={{ overflowX: 'auto' }}>
            <table className="ct-table">
              <thead>
                <tr>
                  <th>Subcontractor</th>
                  <th>Trade</th>
                  <th>GST</th>
                  <th>Phone</th>
                  <th>Work Order</th>
                  <th>RA Billed</th>
                  <th>Retention</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {subcontractors.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#5b47b8,#7b67d8)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                          {s.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                      </div>
                    </td>
                    <td style={{ fontSize: 13, fontWeight: 600 }}>{s.trade ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--mut)', fontFamily: 'monospace' }}>{s.gst ?? '—'}</td>
                    <td style={{ fontSize: 13 }}>{s.phone ?? '—'}</td>
                    <td style={{ fontWeight: 700, fontSize: 13 }}>₹{Number(s.workOrderValue).toLocaleString('en-IN')}</td>
                    <td style={{ fontWeight: 700, fontSize: 13, color: 'var(--green)' }}>₹{Number(s.raBilled).toLocaleString('en-IN')}</td>
                    <td style={{ fontWeight: 700, fontSize: 13, color: 'var(--amber)' }}>₹{Number(s.retention).toLocaleString('en-IN')}</td>
                    <td>
                      <span className={`chip ${s.isActive ? 'chip-green' : 'chip-red'}`} style={{ fontSize: 11 }}>
                        <span className="chip-dot"></span>{s.status}
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
