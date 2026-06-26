import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function UsersSettingsPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  const members = await prisma.companyMember.findMany({
    where: { companyId: session.user.companyId },
    include: {
      user: { select: { id: true, name: true, email: true, role: true, lastLoginAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const company = await prisma.company.findUnique({
    where: { id: session.user.companyId },
    select: { name: true, userLimit: true },
  })

  const activeCount = members.filter(m => m.isActive).length
  const limit = company?.userLimit ?? 5

  return (
    <>
      <div className="topbar">
        <div className="title">Team Members</div>
      </div>

      <div style={{ padding: '24px' }}>
        <div className="kpis" style={{ marginBottom: '24px' }}>
          {[
            { label: 'Total Members', value: members.length },
            { label: 'Active', value: activeCount },
            { label: 'User Limit', value: limit },
            { label: 'Slots Used', value: `${activeCount}/${limit}` },
          ].map(k => (
            <div key={k.label} className="kpi">
              <div className="klbl">{k.label}</div>
              <div className="knum" style={{ fontSize: typeof k.value === 'string' ? 18 : undefined }}>{k.value}</div>
            </div>
          ))}
        </div>

        <div className="ct-card" style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Members</div>
            <a href="/settings/users/invite"
              style={{ background: 'var(--p)', color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              + Invite Member
            </a>
          </div>
          <table className="ct-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Last Login</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,var(--p),#1d6fb5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                        {(m.user.name ?? m.user.email ?? '?').substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{m.user.name ?? '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--mut)' }}>{m.user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`chip ${m.role === 'COMPANY_ADMIN' ? 'chip-blue' : ''}`} style={{ fontSize: 11 }}>
                      {m.role.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--mut)' }}>
                    {m.user.lastLoginAt
                      ? new Date(m.user.lastLoginAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                      : 'Never'}
                  </td>
                  <td>
                    <span className={`chip ${m.isActive ? 'chip-green' : 'chip-red'}`} style={{ fontSize: 11 }}>
                      {m.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 32, color: 'var(--mut)' }}>No members yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
