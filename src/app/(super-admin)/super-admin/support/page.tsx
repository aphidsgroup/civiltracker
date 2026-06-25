import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function SupportPage() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  // Surface recent approvals pending SUPER_ADMIN review as support items
  const pendingApprovals = await prisma.approval.findMany({
    where: { deletedAt: null, currentStatus: 'PENDING' },
    include: {
      company: { select: { name: true } },
      requestedBy: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const totalPending = await prisma.approval.count({ where: { deletedAt: null, currentStatus: 'PENDING' } })
  const totalApproved = await prisma.approval.count({ where: { deletedAt: null, currentStatus: 'APPROVED' } })
  const totalCompanies = await prisma.company.count()

  return (
    <>
      <div className="topbar">
        <div className="title">Support & Approvals</div>
      </div>

      <div style={{ padding: '24px' }}>
        <div className="kpis" style={{ marginBottom: '24px' }}>
          {[
            { label: 'Pending', value: totalPending, sub: 'Awaiting action' },
            { label: 'Approved', value: totalApproved, sub: 'Resolved' },
            { label: 'Companies', value: totalCompanies, sub: 'On platform' },
          ].map(k => (
            <div key={k.label} className="kpi">
              <div className="klbl">{k.label}</div>
              <div className="knum">{k.value}</div>
              <div className="ksub"><span>●</span>{k.sub}</div>
            </div>
          ))}
        </div>

        <div className="ct-card" style={{ overflowX: 'auto' }}>
          <table className="ct-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Company</th>
                <th>Requested By</th>
                <th>Type</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {pendingApprovals.map(a => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 700, fontSize: 13, maxWidth: 240 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--mut)' }}>{a.company.name}</td>
                  <td style={{ fontSize: 12 }}>
                    <div style={{ fontWeight: 600 }}>{a.requestedBy.name}</div>
                    <div style={{ color: 'var(--mut)', fontSize: 11 }}>{a.requestedBy.email}</div>
                  </td>
                  <td><span className="chip" style={{ fontSize: 10, background: '#eef2f6', color: 'var(--mut)', fontWeight: 700 }}>{a.entityType}</span></td>
                  <td>
                    <span className={`chip ${a.priority === 'URGENT' ? 'chip-red' : a.priority === 'HIGH' ? 'chip-amber' : ''}`}
                      style={{ fontSize: 10, ...(a.priority === 'LOW' || a.priority === 'NORMAL' ? { background: '#eef2f6', color: 'var(--mut)' } : {}), fontWeight: 700 }}>
                      {a.priority}
                    </span>
                  </td>
                  <td>
                    <span className={`chip ${a.currentStatus === 'APPROVED' ? 'chip-green' : a.currentStatus === 'REJECTED' ? 'chip-red' : 'chip-amber'}`} style={{ fontSize: 10 }}>
                      <span className="chip-dot"></span>{a.currentStatus}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--mut)' }}>
                    {new Date(a.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </td>
                </tr>
              ))}
              {pendingApprovals.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--mut)' }}>No pending items.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
