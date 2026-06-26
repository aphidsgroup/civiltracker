import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'SUPER_ADMIN') redirect('/login')

  const { id } = await params

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      sites: { select: { id: true, name: true, status: true, location: true }, orderBy: { createdAt: 'desc' }, take: 20 },
      members: {
        include: { user: { select: { name: true, email: true, phone: true } } },
        orderBy: { joinedAt: 'desc' },
        take: 50,
      },
    },
  })

  if (!company) notFound()

  const activeMembers = company.members.filter(m => m.isActive).length

  const statusColor: Record<string, string> = {
    ACTIVE: 'chip-green', TRIAL: 'chip-blue', SUSPENDED: 'chip-amber', CANCELLED: 'chip-red',
  }
  const siteStatusColor: Record<string, string> = {
    ACTIVE: 'chip-green', PLANNING: 'chip-blue', ON_HOLD: 'chip-amber', COMPLETED: 'chip-green', CANCELLED: 'chip-red',
  }

  function getInitials(name: string) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <>
      <div className="topbar">
        <div className="title">{company.name}</div>
        <span className={`chip ${statusColor[company.status]}`} style={{ fontSize: 12, marginLeft: 12 }}>{company.status}</span>
      </div>
      <div style={{ padding: '24px' }}>
        <div className="kpis" style={{ marginBottom: 24 }}>
          {[
            { label: 'Sites', value: company.sites.length },
            { label: 'Active Members', value: activeMembers },
            { label: 'User Limit', value: company.userLimit ?? 5 },
            { label: 'Plan', value: company.plan ?? 'BASIC' },
          ].map(k => (
            <div key={k.label} className="kpi">
              <div className="klbl">{k.label}</div>
              <div className="knum" style={{ fontSize: 18 }}>{k.value}</div>
            </div>
          ))}
        </div>

        <div className="dgrid">
          <div className="colL">
            <div className="ct-card" style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Company Info</div>
              {[
                { label: 'Email', value: company.email ?? '—' },
                { label: 'Phone', value: company.phone ?? '—' },
                { label: 'GST', value: company.gst ?? '—' },
                { label: 'Address', value: company.address ?? '—' },
                { label: 'Slug', value: company.slug },
                { label: 'Created', value: new Date(company.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
              ].map(row => (
                <div key={row.label} className="minirow">
                  <span style={{ color: 'var(--mut)', fontSize: 12 }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{row.value}</span>
                </div>
              ))}
            </div>

            <div className="ct-card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Sites ({company.sites.length})</div>
              {company.sites.length === 0 && <p style={{ color: 'var(--mut)', fontSize: 13 }}>No sites yet.</p>}
              {company.sites.map(s => (
                <div key={s.id} className="minirow">
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                  <span className={`chip ${siteStatusColor[s.status]}`} style={{ fontSize: 11 }}>{s.status}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="colR">
            <div className="ct-card" style={{ overflowX: 'auto' }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Members ({company.members.length})</div>
              <table className="ct-table">
                <thead>
                  <tr><th>Member</th><th>Role</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {company.members.map(m => (
                    <tr key={m.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--p)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>{getInitials(m.user.name ?? m.user.email)}</div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 12 }}>{m.user.name ?? '—'}</div>
                            <div style={{ fontSize: 11, color: 'var(--mut)' }}>{m.user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className="chip chip-blue" style={{ fontSize: 10 }}>{m.role}</span></td>
                      <td><span className={`chip ${m.isActive ? 'chip-green' : 'chip-red'}`} style={{ fontSize: 10 }}>{m.isActive ? 'Active' : 'Inactive'}</span></td>
                    </tr>
                  ))}
                  {company.members.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', padding: 24, color: 'var(--mut)' }}>No members.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
