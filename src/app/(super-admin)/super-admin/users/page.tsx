import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function UsersPage() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const members = await prisma.companyMember.findMany({
    where: { isActive: true },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, role: true, lastLoginAt: true, createdAt: true } },
      company: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const totalUsers = await prisma.user.count()
  const activeMembers = await prisma.companyMember.count({ where: { isActive: true } })
  const superAdmins = await prisma.user.count({ where: { role: 'SUPER_ADMIN' } })
  const companyAdmins = await prisma.companyMember.count({ where: { role: 'COMPANY_ADMIN', isActive: true } })

  return (
    <>
      <div className="topbar">
        <div className="title">All Users</div>
      </div>

      <div style={{ padding: '24px' }}>
        <div className="kpis" style={{ marginBottom: '24px' }}>
          {[
            { label: 'Total Users', value: totalUsers },
            { label: 'Active Members', value: activeMembers },
            { label: 'Super Admins', value: superAdmins },
            { label: 'Company Admins', value: companyAdmins },
          ].map(k => (
            <div key={k.label} className="kpi">
              <div className="klbl">{k.label}</div>
              <div className="knum">{k.value}</div>
            </div>
          ))}
        </div>

        <div className="ct-card" style={{ overflowX: 'auto' }}>
          <table className="ct-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Company</th>
                <th>Role</th>
                <th>Last Login</th>
                <th>Joined</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,var(--p),#1d6fb5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                        {m.user.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{m.user.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--mut)' }}>{m.user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: 13, fontWeight: 600 }}>{m.company.name}</td>
                  <td>
                    <span className={`chip ${m.role === 'COMPANY_ADMIN' ? 'chip-blue' : ''}`}
                      style={{ fontSize: 11, fontWeight: 700, ...(m.role !== 'COMPANY_ADMIN' ? { background: '#eef2f6', color: 'var(--mut)' } : {}) }}>
                      {m.role.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--mut)' }}>
                    {m.user.lastLoginAt
                      ? new Date(m.user.lastLoginAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                      : 'Never'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--mut)' }}>
                    {new Date(m.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td>
                    <span className={`chip ${m.isActive ? 'chip-green' : 'chip-red'}`} style={{ fontSize: 11 }}>
                      <span className="chip-dot"></span>
                      {m.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--mut)' }}>No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
