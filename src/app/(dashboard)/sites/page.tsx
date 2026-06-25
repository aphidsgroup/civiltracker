import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'

export default async function SitesPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const sites = await prisma.site.findMany({
    where: { companyId, deletedAt: null },
    include: { _count: { select: { labour: true, expenses: true, dprs: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const statusColor: Record<string, string> = { ACTIVE: 'green', PLANNING: 'mut', COMPLETED: 'blue', ON_HOLD: 'amber', CANCELLED: 'red' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 3px', letterSpacing: '-0.02em' }}>Sites</h1>
          <p style={{ color: 'var(--mut)', fontSize: '13px', margin: 0, fontWeight: 500 }}>{sites.length} sites total</p>
        </div>
        <Link href="/sites/new" className="btn-primary" style={{ textDecoration: 'none' }}>+ New Site</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {sites.map(site => {
          const pct = Math.round(Number(site.progress))
          const spent = Number(site.spent)
          const budget = Number(site.budget)
          const overBudget = spent > budget
          return (
            <Link key={site.id} href={`/sites/${site.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="ct-card" style={{ padding: '20px', cursor: 'pointer', transition: 'box-shadow 0.15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '15px', marginBottom: '3px' }}>{site.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--mut)', fontWeight: 500 }}>📍 {site.location}</div>
                  </div>
                  <span className={`chip chip-${statusColor[site.status] ?? 'mut'}`}>{site.status.replace(/_/g, ' ')}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <div style={{ fontSize: '10.5px', color: 'var(--mut)', fontWeight: 700, marginBottom: '2px' }}>BUDGET</div>
                    <div style={{ fontSize: '15px', fontWeight: 800 }}>{formatCurrency(budget)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10.5px', color: overBudget ? 'var(--red)' : 'var(--mut)', fontWeight: 700, marginBottom: '2px' }}>SPENT</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: overBudget ? 'var(--red)' : 'inherit' }}>{formatCurrency(spent)}</div>
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11.5px', color: 'var(--mut)', fontWeight: 600 }}>Progress</span>
                    <span style={{ fontSize: '12px', fontWeight: 800 }}>{pct}%</span>
                  </div>
                  <div className="ct-progress">
                    <div className={`ct-progress-fill ${overBudget ? 'red' : pct < 30 ? 'amber' : ''}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <span style={{ fontSize: '11.5px', color: 'var(--mut)', fontWeight: 600 }}>👷 {site._count.labour}</span>
                  <span style={{ fontSize: '11.5px', color: 'var(--mut)', fontWeight: 600 }}>💳 {site._count.expenses} expenses</span>
                  {site.currentStage && <span style={{ fontSize: '11.5px', color: 'var(--p)', fontWeight: 700 }}>{site.currentStage}</span>}
                </div>
              </div>
            </Link>
          )
        })}

        {sites.length === 0 && (
          <div className="ct-card" style={{ padding: '40px', textAlign: 'center', gridColumn: '1/-1' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏗</div>
            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>No sites yet</div>
            <div style={{ color: 'var(--mut)', fontSize: '13px', marginBottom: '16px' }}>Create your first construction site to get started</div>
            <Link href="/sites/new" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-flex' }}>+ New Site</Link>
          </div>
        )}
      </div>
    </div>
  )
}
