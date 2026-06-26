import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function SubscriptionsPage() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const plans = await prisma.subscriptionPlan.findMany({ orderBy: { price: 'asc' } })

  const companies = await prisma.company.findMany({
    select: {
      id: true, name: true, plan: true, status: true, createdAt: true,
      subscription: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { plan: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const active = companies.filter(c => c.status === 'ACTIVE').length
  const trial = companies.filter(c => c.status === 'TRIAL').length
  const suspended = companies.filter(c => c.status === 'SUSPENDED').length

  return (
    <>
      <div className="topbar"><div className="title">Subscription Plans</div></div>
      <div style={{ padding: '24px' }}>
        <div className="kpis" style={{ marginBottom: 24 }}>
          {[
            { label: 'Total Companies', value: companies.length },
            { label: 'Active', value: active },
            { label: 'Trial', value: trial },
            { label: 'Suspended', value: suspended },
          ].map(k => (
            <div key={k.label} className="kpi">
              <div className="klbl">{k.label}</div>
              <div className="knum">{k.value}</div>
            </div>
          ))}
        </div>

        {plans.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 16, marginBottom: 28 }}>
            {plans.map(p => (
              <div key={p.id} className="ct-card" style={{ padding: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>{p.name}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--p)', marginBottom: 12 }}>
                  ₹{Number(p.price).toLocaleString('en-IN')}<span style={{ fontSize: 13, fontWeight: 600, color: 'var(--mut)' }}>/mo</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--mut)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div>Max Sites: <strong>{p.maxSites}</strong></div>
                  <div>Max Users: <strong>{p.maxUsers}</strong></div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="ct-card" style={{ overflowX: 'auto' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Company Plans</div>
          <table className="ct-table">
            <thead>
              <tr><th>Company</th><th>Plan</th><th>Status</th><th>Subscription</th><th>Expires</th><th>Since</th></tr>
            </thead>
            <tbody>
              {companies.map(c => {
                const sub = c.subscription[0]
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</td>
                    <td><span className="chip chip-blue" style={{ fontSize: 11 }}>{c.plan}</span></td>
                    <td>
                      <span className={`chip ${c.status === 'ACTIVE' ? 'chip-green' : c.status === 'TRIAL' ? 'chip-amber' : 'chip-red'}`} style={{ fontSize: 11 }}>{c.status}</span>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--mut)' }}>{sub?.plan?.name ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--mut)' }}>{sub?.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--mut)' }}>{new Date(c.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
