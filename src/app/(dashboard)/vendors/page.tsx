import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function VendorsPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  const vendors = await prisma.vendor.findMany({
    where: { companyId: session.user.companyId, isActive: true },
    include: {
      _count: { select: { purchaseOrders: true } },
    },
    orderBy: { name: 'asc' },
  })

  const totalPurchase = vendors.reduce((s, v) => s + Number(v.totalPurchase), 0)
  const totalPayable = vendors.reduce((s, v) => s + Number(v.amountPayable), 0)

  return (
    <>
      <div className="topbar"><div className="title">Vendors</div></div>
      <div style={{ padding: '24px' }}>
        <div className="kpis" style={{ marginBottom: 24 }}>
          {[
            { label: 'Total Vendors', value: vendors.length },
            { label: 'Total Purchase', value: '₹' + (totalPurchase / 100000).toFixed(1) + 'L' },
            { label: 'Payable', value: '₹' + (totalPayable / 100000).toFixed(1) + 'L' },
          ].map(k => (
            <div key={k.label} className="kpi">
              <div className="klbl">{k.label}</div>
              <div className="knum" style={{ fontSize: 18 }}>{k.value}</div>
            </div>
          ))}
        </div>
        <div className="ct-card" style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>All Vendors</div>
            <a href="/vendors/new" style={{ background: 'var(--p)', color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>+ Add Vendor</a>
          </div>
          <table className="ct-table">
            <thead>
              <tr><th>Vendor</th><th>Category</th><th>POs</th><th>Total Purchase</th><th>Payable</th><th>Status</th></tr>
            </thead>
            <tbody>
              {vendors.map(v => (
                <tr key={v.id}>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{v.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--mut)' }}>{v.phone ?? v.email ?? '—'}</div>
                  </td>
                  <td style={{ fontSize: 13 }}>{v.category ?? '—'}</td>
                  <td style={{ fontSize: 13 }}>{v._count.purchaseOrders}</td>
                  <td style={{ fontSize: 13, fontWeight: 600 }}>₹{Number(v.totalPurchase).toLocaleString('en-IN')}</td>
                  <td style={{ fontSize: 13, fontWeight: 600, color: Number(v.amountPayable) > 0 ? '#e07a1f' : 'inherit' }}>₹{Number(v.amountPayable).toLocaleString('en-IN')}</td>
                  <td><span className={`chip ${v.isActive ? 'chip-green' : 'chip-red'}`} style={{ fontSize: 11 }}>{v.isActive ? 'Active' : 'Inactive'}</span></td>
                </tr>
              ))}
              {vendors.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--mut)' }}>No vendors yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
