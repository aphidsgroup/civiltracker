import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function CompanyDetailsPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/login')

  const company = await prisma.company.findUnique({
    where: { id: params.id },
    include: {
      sites: { orderBy: { createdAt: 'desc' } },
      members: {
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
      },
      subscriptionPlan: true,
    },
  })

  if (!company) redirect('/super-admin/companies')

  const activeMembers = company.members.filter(m => m.isActive)

  return (
    <>
      <div className="topbar">
        <div className="title">{company.name}</div>
      </div>

      <div style={{ padding: '24px' }}>
        {/* KPIs */}
        <div className="kpis" style={{ marginBottom: '24px' }}>
          {[
            { label: 'Sites', value: company.sites.length },
            { label: 'Active Members', value: activeMembers.length },
            { label: 'Plan', value: company.plan },
            { label: 'Status', value: company.isActive ? 'Active' : 'Inactive' },
          ].map(k => (
            <div key={k.label} className="kpi">
              <div className="klbl">{k.label}</div>
              <div className="knum" style={{ fontSize: typeof k.value === 'number' ? undefined : 14 }}>{k.value}</div>
            </div>
          ))}
        </div>

        <div className="dgrid">
          {/* Company Info */}
          <div className="colL">
            <div className="ct-card" style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--mut)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Company Info</div>
              {[
                { label: 'Name', value: company.name },
                { label: 'Slug', value: company.slug ?? '—' },
                { label: 'Email', value: company.email ?? '—' },
                { label: 'Phone', value: company.phone ?? '—' },
                { label: 'GST', value: company.gst ?? '—' },
                { label: 'City', value: [company.city, company.state].filter(Boolean).join(', ') || '—' },
                { label: 'Created', value: new Date(company.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
              ].map(r => (
                <div key={r.label} className="minirow">
                  <span style={{ fontSize: 12, color: 'var(--mut)', fontWeight: 600 }}>{r.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{r.value}</span>
                </div>
              ))}
            </div>

            {/* Sites */}
            <div className="ct-card">
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--mut)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sites ({company.sites.length})</div>
              {company.sites.length === 0 && <div style={{ color: 'var(--mut)', fontSize: 13 }}>No sites yet.</div>}
              {company.sites.map(s => (
                <div key={s.id} className="minirow" style={{ padding: '10px 0' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--mut)' }}>{s.address ?? '—'}</div>
                  </div>
                  <span className={`chip ${s.isActive ? 'chip-green' : ''}`} style={{ fontSize: 11 }}>
                    {s.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Members */}
          <div className="colR">
            <div className="ct-card">
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--mut)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Members ({company.members.length})</div>
              <table className="ct-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {company.members.map(m => (
                    <tr key={m.id}>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{m.user.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--mut)' }}>{m.user.email}</div>
                      </td>
                      <td>
                        <span className={`chip ${m.role === 'COMPANY_ADMIN' ? 'chip-blue' : ''}`} style={{ fontSize: 11 }}>
                          {m.role.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <span className={`chip ${m.isActive ? 'chip-green' : 'chip-red'}`} style={{ fontSize: 11 }}>
                          {m.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {company.members.length === 0 && (
                    <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--mut)' }}>No members.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
