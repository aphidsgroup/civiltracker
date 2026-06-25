import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'
import { hasPermission } from '@/lib/permissions'
import { Role } from '@prisma/client'

export const metadata = { title: 'Reports | Civil Tracker' }

export default async function ReportsPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  if (!hasPermission(session.user.role as Role, 'reports.finance') && !hasPermission(session.user.role as Role, 'reports.project')) {
    redirect('/dashboard')
  }
  const { companyId } = session.user

  const [sites, expenses, labour] = await Promise.all([
    prisma.site.findMany({ where: { companyId, deletedAt: null }, include: { _count: { select: { expenses: true, dprs: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.expense.groupBy({ by: ['category'], where: { companyId }, _sum: { amount: true }, _count: true }),
    prisma.labour.groupBy({ by: ['trade'], where: { companyId }, _count: true }),
  ])

  const totalBudget = sites.reduce((s, site) => s + Number(site.budget), 0)
  const totalSpent = sites.reduce((s, site) => s + Number(site.spent), 0)
  const totalExpenses = expenses.reduce((s, e) => s + Number(e._sum.amount ?? 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 3px', letterSpacing: '-0.02em' }}>Reports</h1>
        <p style={{ color: 'var(--mut)', fontSize: '13px', margin: 0 }}>Financial and operational overview</p>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        {[
          { label: 'Total Portfolio Budget', value: formatCurrency(totalBudget), color: 'var(--p)' },
          { label: 'Total Spent', value: formatCurrency(totalSpent), color: 'var(--green)' },
          { label: 'Budget Remaining', value: formatCurrency(totalBudget - totalSpent), color: totalBudget - totalSpent < 0 ? 'var(--red)' : 'var(--ink)' },
          { label: 'Total Expenses', value: formatCurrency(totalExpenses), color: 'var(--amber)' },
        ].map(s => (
          <div key={s.label} className="ct-card" style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: '10.5px', color: 'var(--mut)', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Expense by Category */}
        <div className="ct-card" style={{ padding: '18px 20px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 14px' }}>Expenses by Category</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {expenses.sort((a, b) => Number(b._sum.amount) - Number(a._sum.amount)).map(e => {
              const amt = Number(e._sum.amount ?? 0)
              const pct = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0
              return (
                <div key={e.category}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 600 }}>{e.category.replace(/_/g, ' ')}</span>
                    <span style={{ fontSize: '12.5px', fontWeight: 800 }}>{formatCurrency(amt)}</span>
                  </div>
                  <div className="ct-progress">
                    <div className="ct-progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Sites overview */}
        <div className="ct-card" style={{ padding: '18px 20px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 14px' }}>Site Overview</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {sites.map(site => {
              const spent = Number(site.spent)
              const budget = Number(site.budget)
              const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0
              return (
                <div key={site.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 700 }}>{site.name}</span>
                    <span style={{ fontSize: '12px', color: 'var(--mut)', fontWeight: 600 }}>{formatCurrency(spent)} / {formatCurrency(budget)}</span>
                  </div>
                  <div className="ct-progress">
                    <div className={`ct-progress-fill ${pct >= 90 ? 'red' : pct >= 70 ? 'amber' : ''}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Labour by Trade */}
      <div className="ct-card" style={{ padding: '18px 20px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 14px' }}>Labour by Trade</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {labour.map(l => (
            <div key={l.trade} className="ct-card" style={{ padding: '12px 16px', flex: '0 1 auto', minWidth: '120px' }}>
              <div style={{ fontSize: '10.5px', color: 'var(--mut)', fontWeight: 700, marginBottom: '4px' }}>{l.trade.replace(/_/g, ' ')}</div>
              <div style={{ fontSize: '20px', fontWeight: 800 }}>{l._count}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
