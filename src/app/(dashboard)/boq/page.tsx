import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function BOQPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const items = await prisma.bOQItem.findMany({
    where: { companyId },
    include: { site: { select: { name: true } } },
    orderBy: [{ siteId: 'asc' }, { category: 'asc' }],
  })

  const totalAgg = await prisma.bOQItem.aggregate({
    where: { companyId },
    _sum: { amount: true, totalWithGst: true },
  })
  const totalAmount = Number(totalAgg._sum.amount || 0)
  const totalWithGst = Number(totalAgg._sum.totalWithGst || 0)

  return (
    <>
      <div className="topbar">
        <div className="title">Bill of Quantities</div>
      </div>

      <div style={{ padding: '20px' }}>
        <div className="kpis" style={{ marginBottom: '20px' }}>
          <div className="kpi">
            <div className="klbl">BOQ Items</div>
            <div className="knum">{items.length}</div>
          </div>
          <div className="kpi">
            <div className="klbl">Base Amount</div>
            <div className="knum">₹{(totalAmount / 100000).toFixed(2)}L</div>
          </div>
          <div className="kpi">
            <div className="klbl">With GST</div>
            <div className="knum">₹{(totalWithGst / 100000).toFixed(2)}L</div>
          </div>
          <div className="kpi">
            <div className="klbl">GST Amount</div>
            <div className="knum" style={{ color: 'var(--amber)' }}>₹{((totalWithGst - totalAmount) / 100000).toFixed(2)}L</div>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="ct-card" style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>No BOQ items yet</div>
            <div style={{ fontSize: 13, color: 'var(--mut)' }}>Create BOQ items per site to track quantities, rates, and costs by category.</div>
          </div>
        ) : (
          <div className="ct-card" style={{ overflowX: 'auto' }}>
            <table className="ct-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Site</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Amount</th>
                  <th>GST%</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600, fontSize: 13, maxWidth: 200 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--mut)' }}>{item.site.name}</td>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{item.category}</td>
                    <td style={{ fontSize: 12, color: 'var(--mut)' }}>{item.unit}</td>
                    <td style={{ fontSize: 13, fontWeight: 700 }}>{Number(item.quantity).toFixed(2)}</td>
                    <td style={{ fontSize: 13, fontWeight: 700 }}>₹{Number(item.rate).toLocaleString('en-IN')}</td>
                    <td style={{ fontSize: 13, fontWeight: 700 }}>₹{Number(item.amount).toLocaleString('en-IN')}</td>
                    <td style={{ fontSize: 12, color: 'var(--mut)' }}>{item.gstPercent}%</td>
                    <td style={{ fontSize: 13, fontWeight: 800, color: 'var(--p)' }}>₹{Number(item.totalWithGst).toLocaleString('en-IN')}</td>
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
