import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function VendorsPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const vendors = await prisma.vendor.findMany({
    where: { companyId },
    include: { _count: { select: { materials: true, purchaseOrders: true } } },
    orderBy: { name: 'asc' },
  })

  return (
    <>
      <div className="topbar">
        <div className="title">Vendors</div>
        <div className="tbtns">
          <div className="knum" style={{ fontSize: 20 }}>{vendors.length}</div>
          <div className="ksub" style={{ fontSize: 12, color: 'var(--mut)', marginLeft: 4 }}>vendors</div>
        </div>
      </div>

      <div style={{ padding: '20px' }}>
        {vendors.length === 0 ? (
          <div className="ct-card" style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏪</div>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>No vendors yet</div>
            <div style={{ fontSize: 13, color: 'var(--mut)' }}>Add vendors to link them with materials and purchase orders.</div>
          </div>
        ) : (
          <div className="ct-card" style={{ overflowX: 'auto' }}>
            <table className="ct-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>GST</th>
                  <th>Contact</th>
                  <th>Materials</th>
                  <th>Orders</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map(v => (
                  <tr key={v.id}>
                    <td>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{v.name}</div>
                      {v.address && <div style={{ fontSize: 12, color: 'var(--mut)' }}>{v.address}</div>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--mut)', fontFamily: 'monospace' }}>{v.gst ?? '—'}</td>
                    <td>
                      {v.phone && <div style={{ fontSize: 13, fontWeight: 600 }}>{v.phone}</div>}
                      {v.email && <div style={{ fontSize: 12, color: 'var(--mut)' }}>{v.email}</div>}
                    </td>
                    <td style={{ fontWeight: 700, fontSize: 14 }}>{v._count.materials}</td>
                    <td style={{ fontWeight: 700, fontSize: 14 }}>{v._count.purchaseOrders}</td>
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
