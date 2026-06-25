import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatDate } from '@/lib/utils'

export const metadata = { title: 'Settings | Civil Tracker' }

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const [company, members] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.companyMember.findMany({
      where: { companyId },
      include: { user: { select: { id: true, name: true, email: true, isActive: true } } },
      orderBy: { joinedAt: 'desc' },
      take: 20,
    }),
  ])
  const users = members.map(m => ({ id: m.userId, name: m.user?.name ?? '', email: m.user?.email ?? '', role: m.role, isActive: m.user?.isActive ?? true, createdAt: m.joinedAt }))

  if (!company) redirect('/login')

  const roleColors: Record<string, string> = {
    COMPANY_ADMIN: 'blue', PROJECT_MANAGER: 'violet', ACCOUNTANT: 'amber',
    SITE_ENGINEER: 'green', SUPERVISOR: 'mut', CLIENT: 'red',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 3px', letterSpacing: '-0.02em' }}>Settings</h1>
        <p style={{ color: 'var(--mut)', fontSize: '13px', margin: 0 }}>Company and account settings</p>
      </div>

      {/* Company info */}
      <div className="ct-card" style={{ padding: '20px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 16px' }}>Company</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {[
            { label: 'Company Name', value: company.name },
            { label: 'Plan', value: company.plan ?? 'Standard' },
            { label: 'GST', value: company.gst ?? 'Not set' },
            { label: 'Phone', value: company.phone ?? 'Not set' },
            { label: 'City', value: company.city ?? 'Not set' },
            { label: 'Member Since', value: formatDate(company.createdAt) },
          ].map(f => (
            <div key={f.label}>
              <div style={{ fontSize: '10.5px', color: 'var(--mut)', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase' }}>{f.label}</div>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>{f.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Team */}
      <div className="ct-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line)' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 800, margin: 0 }}>Team Members</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="ct-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, #1d6fb5, #0c3c6a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                        {u.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0,2)}
                      </div>
                      <span style={{ fontWeight: 700 }}>{u.name}</span>
                    </div>
                  </td>
                  <td style={{ fontSize: '12.5px', color: 'var(--mut)', fontWeight: 500 }}>{u.email}</td>
                  <td><span className={`chip chip-${roleColors[u.role] ?? 'mut'}`}>{u.role.replace(/_/g, ' ')}</span></td>
                  <td style={{ fontSize: '12px', color: 'var(--mut)', fontWeight: 500 }}>{formatDate(u.createdAt)}</td>
                  <td><span className={`chip chip-${u.isActive ? 'green' : 'mut'}`}><span className="chip-dot" />{u.isActive ? 'Active' : 'Inactive'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
