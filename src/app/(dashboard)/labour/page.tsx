import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ResponsiveTable from '@/components/responsive/ResponsiveTable'
import MobileCardList from '@/components/responsive/MobileCardList'
import { formatCurrency } from '@/lib/utils'

export const metadata = { title: 'Labour | Civil Tracker' }

export default async function LabourPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const labour = await prisma.labour.findMany({
    where: { companyId },
    include: {
      site: { select: { name: true } },
      _count: { select: { attendance: true } },
    },
    orderBy: { name: 'asc' },
  })

  const active = labour.filter(l => l.isActive).length

  const tradeColors: Record<string, string> = {
    MASON: 'blue', HELPER: 'mut', CARPENTER: 'amber', BAR_BENDER: 'violet',
    ELECTRICIAN: 'amber', PLUMBER: 'blue', PAINTER: 'violet', SUPERVISOR: 'green',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 3px', letterSpacing: '-0.02em' }}>Labour</h1>
          <p style={{ color: 'var(--mut)', fontSize: '13px', margin: 0 }}>{active} active workers</p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
        {[
          { label: 'Total Workers', value: labour.length },
          { label: 'Active', value: active },
          { label: 'Inactive', value: labour.length - active },
        ].map(s => (
          <div key={s.label} className="ct-card" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: '10.5px', color: 'var(--mut)', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase' }}>{s.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 800 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="ct-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line)' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 800, margin: 0 }}>All Workers</h2>
        </div>
          <div style={{ overflowX: 'auto' }}>
            <ResponsiveTable
              desktopView={
                <table className="ct-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Trade</th>
                      <th>Site</th>
                      <th>Daily Wage</th>
                      <th>Phone</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labour.map(l => (
                      <tr key={l.id}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{l.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--mut)', fontWeight: 600 }}>{l._count.attendance} days logged</div>
                        </td>
                        <td><span className={`chip chip-${tradeColors[l.trade] ?? 'mut'}`} style={{ fontSize: '10px' }}>{l.trade.replace('_', ' ')}</span></td>
                        <td style={{ fontSize: '12px', color: 'var(--mut)', fontWeight: 600 }}>{l.site?.name || 'Unassigned'}</td>
                        <td style={{ fontWeight: 700 }}>{formatCurrency(Number(l.dailyWage))}</td>
                        <td style={{ fontSize: '12px', color: 'var(--mut)', fontWeight: 500 }}>{l.phone || '-'}</td>
                        <td>
                          <span className={`chip chip-${l.isActive ? 'green' : 'mut'}`}>
                            {l.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
              mobileView={
                <MobileCardList
                  items={labour.map(l => ({
                    id: l.id,
                    title: l.name,
                    subtitle: `${l.site?.name || 'Unassigned'} • ${l._count.attendance} days logged`,
                    meta: <div style={{ fontSize: '14px', fontWeight: 800, marginTop: '4px' }}>Wage: {formatCurrency(Number(l.dailyWage))}</div>,
                    statusNode: (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <span className={`chip chip-${l.isActive ? 'green' : 'mut'}`} style={{ fontSize: '9px' }}>{l.isActive ? 'Active' : 'Inactive'}</span>
                        <span className={`chip chip-${tradeColors[l.trade] ?? 'mut'}`} style={{ fontSize: '9px' }}>{l.trade.replace('_', ' ')}</span>
                      </div>
                    )
                  }))}
                />
              }
            />
          </div>
      </div>
    </div>
  )
}
