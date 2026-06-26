import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function SAUsersPage() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const members = await prisma.companyMember.findMany({
    include: {
      user: { select: { name: true, email: true, phone: true } },
      company: { select: { name: true } },
    },
    orderBy: { joinedAt: 'desc' },
    take: 200,
  })

  const active = members.filter(m => m.isActive).length

  function getInitials(name: string) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <>
      <div className="topbar"><div className="title">All Users</div></div>
      <div style={{ padding: '24px' }}>
        <div className="kpis" style={{ marginBottom: 24 }}>
          {[
            { label: 'Total Members', value: members.length },
            { label: 'Active', value: active },
            { label: 'Inactive', value: members.length - active },
          ].map(k => (
            <div key={k.label} className="kpi">
              <div className="klbl">{k.label}</div>
              <div className="knum" style={{ fontSize: 18 }}>{k.value}</div>
            </div>
          ))}
        </div>
        <div className="ct-card" style={{ overflowX: 'auto' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>All Members</div>
          <table className="ct-table">
            <thead>
              <tr><th>Member</th><th>Company</th><th>Role</th><th>Joined</th><th>Status</th></tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--p)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>{getInitials(m.user.name ?? m.user.email)}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{m.user.name ?? '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--mut)' }}>{m.user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: 13 }}>{m.company.name}</td>
                  <td><span className="chip chip-blue" style={{ fontSize: 11 }}>{m.role}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--mut)' }}>{new Date(m.joinedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td><span className={`chip ${m.isActive ? 'chip-green' : 'chip-red'}`} style={{ fontSize: 11 }}>{m.isActive ? 'Active' : 'Inactive'}</span></td>
                </tr>
              ))}
              {members.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--mut)' }}>No users yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
