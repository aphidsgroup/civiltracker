import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'

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
                    {l.phone && <div style={{ fontSize: '11px', color: 'var(--mut)' }}>{l.phone}</div>}
                  </td>
                  <td><span className={`chip chip-${tradeColors[l.trade] ?? 'mut'}`}>{l.trade.replace(/_/g, ' ')}</span></td>
                  <td style={{ fontSize: '12.5px', color: 'var(--mut)', fontWeight: 600 }}>{l.site.name}</td>
                  <td style={{ fontWeight: 700 }}>₹{Number(l.dailyWage).toLocaleString('en-IN')}</td>
                  <td style={{ fontSize: '12.5px', color: 'var(--mut)' }}>{l.phone ?? '-'}</td>
                  <td>
                    <span className={`chip chip-${l.isActive ? 'green' : 'mut'}`}>
                      <span className="chip-dot" />
                      {l.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
