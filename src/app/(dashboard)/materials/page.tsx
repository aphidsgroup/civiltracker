import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'
import ResponsiveTable from '@/components/responsive/ResponsiveTable'
import MobileCardList from '@/components/responsive/MobileCardList'

export const metadata = { title: 'Materials | Civil Tracker' }

export default async function MaterialsPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const materials = await prisma.material.findMany({
    where: { companyId, isActive: true },
    include: { site: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })

  const lowStock = materials.filter(m => Number(m.currentStock) <= Number(m.minStock)).length
  const totalValue = materials.reduce((s, m) => s + Number(m.currentStock) * Number(m.unitCost ?? 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 3px', letterSpacing: '-0.02em' }}>Materials</h1>
          <p style={{ color: 'var(--mut)', fontSize: '13px', margin: 0 }}>{materials.length} items · {lowStock > 0 ? `⚠️ ${lowStock} low stock` : 'All stocked'}</p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        {[
          { label: 'Total Items', value: String(materials.length), color: 'var(--p)' },
          { label: 'Inventory Value', value: formatCurrency(totalValue), color: 'var(--green)' },
          { label: 'Low Stock Alerts', value: String(lowStock), color: lowStock > 0 ? 'var(--amber)' : 'var(--mut)' },
        ].map(s => (
          <div key={s.label} className="ct-card" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: '10.5px', color: 'var(--mut)', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase' }}>{s.label}</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="ct-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line)' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 800, margin: 0 }}>All Materials</h2>
        </div>
          <div style={{ overflowX: 'auto' }}>
            <ResponsiveTable
              desktopView={
                <table className="ct-table">
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Site</th>
                      <th>Unit</th>
                      <th>Stock</th>
                      <th>Min Level</th>
                      <th>Unit Cost</th>
                      <th>Value</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materials.map(m => {
                      const stock = Number(m.currentStock)
                      const min = Number(m.minStock)
                      const val = stock * Number(m.unitCost ?? 0)
                      const isLow = stock <= min
                      return (
                        <tr key={m.id}>
                          <td><div style={{ fontWeight: 700 }}>{m.name}</div></td>
                          <td style={{ fontSize: '12px', color: 'var(--mut)', fontWeight: 600 }}>{m.site.name}</td>
                          <td><span className="chip chip-mut">{m.unit}</span></td>
                          <td style={{ fontWeight: 800, color: isLow ? 'var(--red)' : 'var(--ink)' }}>{stock}</td>
                          <td style={{ fontSize: '12.5px', color: 'var(--mut)' }}>{min}</td>
                          <td style={{ fontSize: '12.5px', color: 'var(--mut)', fontWeight: 600 }}>{m.unitCost ? formatCurrency(Number(m.unitCost)) : '-'}</td>
                          <td style={{ fontWeight: 700 }}>{formatCurrency(val)}</td>
                          <td>
                            <span className={`chip chip-${isLow ? 'red' : 'green'}`}>
                              <span className="chip-dot" />
                              {isLow ? 'Low Stock' : 'Good'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              }
              mobileView={
                <MobileCardList
                  items={materials.map(m => {
                    const stock = Number(m.currentStock)
                    const min = Number(m.minStock)
                    const val = stock * Number(m.unitCost ?? 0)
                    const isLow = stock <= min
                    return {
                      id: m.id,
                      title: m.name,
                      subtitle: m.site.name,
                      meta: (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 800 }}>{stock} {m.unit}</span>
                          <span style={{ fontSize: '13px', color: 'var(--mut)' }}>{formatCurrency(val)}</span>
                        </div>
                      ),
                      statusNode: (
                        <span className={`chip chip-${isLow ? 'red' : 'green'}`} style={{ fontSize: '10px' }}>
                          {isLow ? 'Low Stock' : 'Good'}
                        </span>
                      )
                    }
                  })}
                />
              }
            />
          </div>
      </div>
    </div>
  )
}
