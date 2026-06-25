import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

const ACTION_COLOR: Record<string, string> = {
  CREATE: 'chip-green',
  UPDATE: 'chip-blue',
  DELETE: 'chip-red',
  LOGIN:  'chip-amber',
  EXPORT: '',
}

export default async function SystemLogsPage() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const logs = await prisma.auditLog.findMany({
    include: {
      user: { select: { name: true, email: true } },
      company: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const totalLogs = await prisma.auditLog.count()
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayLogs = await prisma.auditLog.count({ where: { createdAt: { gte: todayStart } } })

  return (
    <>
      <div className="topbar">
        <div className="title">System Logs</div>
      </div>

      <div style={{ padding: '24px' }}>
        <div className="kpis" style={{ marginBottom: '24px' }}>
          <div className="kpi">
            <div className="klbl">Total Events</div>
            <div className="knum">{totalLogs.toLocaleString()}</div>
          </div>
          <div className="kpi">
            <div className="klbl">Today</div>
            <div className="knum">{todayLogs}</div>
            <div className="ksub up"><span>●</span>Last 24h</div>
          </div>
          <div className="kpi">
            <div className="klbl">Showing</div>
            <div className="knum">{logs.length}</div>
            <div className="ksub"><span>●</span>Most recent</div>
          </div>
        </div>

        <div className="ct-card" style={{ overflowX: 'auto' }}>
          <table className="ct-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Company</th>
                <th>Action</th>
                <th>Module</th>
                <th>Record ID</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td style={{ fontSize: 11, color: 'var(--mut)', whiteSpace: 'nowrap' }}>
                    {new Date(l.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{l.user?.name ?? '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--mut)' }}>{l.user?.email}</div>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--mut)' }}>{l.company?.name ?? '—'}</td>
                  <td>
                    <span className={`chip ${ACTION_COLOR[l.action] ?? ''}`}
                      style={{ fontSize: 10, fontWeight: 700, ...(ACTION_COLOR[l.action] ? {} : { background: '#eef2f6', color: 'var(--mut)' }) }}>
                      {l.action}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, fontWeight: 600 }}>{l.module ?? '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--mut)', fontFamily: 'monospace' }}>
                    {l.recordId ? l.recordId.substring(0, 16) + '…' : '—'}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--mut)' }}>No logs yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
