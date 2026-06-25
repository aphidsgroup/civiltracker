import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const [sites, expenses, pendingApprovals, totalLabour] = await Promise.all([
    prisma.site.findMany({ where: { companyId, deletedAt: null }, select: { id: true, name: true, location: true, budget: true, spent: true, progress: true, status: true, currentStage: true }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.expense.aggregate({ where: { companyId }, _sum: { amount: true } }),
    prisma.approval.count({ where: { companyId, status: 'PENDING' } }),
    prisma.labour.count({ where: { companyId, isActive: true } }),
  ])

  const totalBudget = sites.reduce((s, site) => s + Number(site.budget), 0)
  const totalSpent = sites.reduce((s, site) => s + Number(site.spent), 0)
  const activeSites = sites.filter(s => s.status === 'ACTIVE').length
  const totalExpenses = Number(expenses._sum.amount ?? 0)

  const kpis = [
    { label: 'Active Sites', value: String(activeSites), sub: `${sites.length} total`, color: 'var(--p)', icon: '🏗' },
    { label: 'Total Budget', value: formatCurrency(totalBudget), sub: `${formatCurrency(totalSpent)} spent`, color: '#138a4e', icon: '📊' },
    { label: 'Total Expenses', value: formatCurrency(totalExpenses), sub: 'All time', color: '#e08a0b', icon: '💳' },
    { label: 'Active Labour', value: String(totalLabour), sub: `${pendingApprovals} bills pending`, color: '#5b47b8', icon: '👷' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 3px', letterSpacing: '-0.02em' }}>Dashboard</h1>
          <p style={{ color: 'var(--mut)', fontSize: '13px', margin: 0, fontWeight: 500 }}>Welcome back, {session.user.name?.split(' ')[0]} 👋</p>
        </div>
        <Link href="/sites/new" className="btn-primary" style={{ textDecoration: 'none' }}>+ New Site</Link>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        {kpis.map(kpi => (
          <div key={kpi.label} className="ct-card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{kpi.label}</span>
              <span style={{ fontSize: '20px' }}>{kpi.icon}</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: kpi.color, letterSpacing: '-0.02em', marginBottom: '4px' }}>{kpi.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--mut)', fontWeight: 500 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Sites Table */}
      <div className="ct-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>All Sites</h2>
          <Link href="/sites" style={{ fontSize: '12.5px', color: 'var(--p)', fontWeight: 700, textDecoration: 'none' }}>View all →</Link>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="ct-table">
            <thead>
              <tr>
                <th>Site</th>
                <th>Budget</th>
                <th>Spent</th>
                <th>Progress</th>
                <th>Stage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sites.map(site => {
                const pct = Math.round(Number(site.progress))
                const statusColor: Record<string, string> = { ACTIVE: 'green', PLANNING: 'mut', COMPLETED: 'blue', ON_HOLD: 'amber', CANCELLED: 'red' }
                return (
                  <tr key={site.id}>
                    <td>
                      <Link href={`/sites/${site.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                        <div style={{ fontWeight: 700 }}>{site.name}</div>
                        <div style={{ fontSize: '11.5px', color: 'var(--mut)', fontWeight: 500 }}>{site.location}</div>
                      </Link>
                    </td>
                    <td style={{ fontWeight: 700 }}>{formatCurrency(Number(site.budget))}</td>
                    <td style={{ fontWeight: 700 }}>{formatCurrency(Number(site.spent))}</td>
                    <td style={{ minWidth: '120px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="ct-progress" style={{ flex: 1 }}>
                          <div className={`ct-progress-fill ${pct >= 80 ? '' : pct >= 50 ? '' : 'amber'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--mut)', width: '32px', textAlign: 'right' }}>{pct}%</span>
                      </div>
                    </td>
                    <td><span style={{ fontSize: '12px', fontWeight: 600 }}>{site.currentStage ?? '-'}</span></td>
                    <td><span className={`chip chip-${statusColor[site.status] ?? 'mut'}`}><span className="chip-dot" />{site.status.replace(/_/g, ' ')}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Expenses */}
      <div className="ct-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 800, margin: 0 }}>Quick Links</h2>
        </div>
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
          {[
            { href: '/bills', label: '🧾 Approve Bills', count: pendingApprovals },
            { href: '/labour', label: '👷 Labour', count: totalLabour },
            { href: '/materials', label: '🧱 Materials', count: null },
            { href: '/dpr', label: '📝 DPR', count: null },
            { href: '/reports', label: '📊 Reports', count: null },
            { href: '/documents', label: '📁 Documents', count: null },
          ].map(link => (
            <Link
              key={link.href}
              href={link.href}
              style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '14px', borderRadius: '14px', background: '#f5f8fc', border: '1px solid var(--line)', textDecoration: 'none', color: 'inherit', transition: 'all 0.15s' }}
            >
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{link.label}</span>
              {link.count !== null && link.count > 0 && <span className="chip chip-amber">{link.count} pending</span>}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
