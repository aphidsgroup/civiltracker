import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

const STATUS_COLOR: Record<string, string> = {
  NOT_STARTED: '', IN_PROGRESS: 'chip-blue', DELAYED: 'chip-red', COMPLETED: 'chip-green',
}

export default async function TasksPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const tasks = await prisma.task.findMany({
    where: { companyId },
    include: { site: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const notStarted = tasks.filter(t => t.status === 'NOT_STARTED').length
  const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS').length
  const completed  = tasks.filter(t => t.status === 'COMPLETED').length
  const delayed    = tasks.filter(t => t.status === 'DELAYED').length

  return (
    <>
      <div className="topbar">
        <div className="title">Tasks</div>
      </div>

      <div style={{ padding: '20px' }}>
        <div className="kpis" style={{ marginBottom: '20px' }}>
          {[
            { label: 'Not Started', value: notStarted },
            { label: 'In Progress', value: inProgress },
            { label: 'Completed',   value: completed },
            { label: 'Delayed',     value: delayed },
          ].map(k => (
            <div key={k.label} className="kpi">
              <div className="klbl">{k.label}</div>
              <div className="knum">{k.value}</div>
            </div>
          ))}
        </div>

        {tasks.length === 0 ? (
          <div className="ct-card" style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>No tasks yet</div>
            <div style={{ fontSize: 13, color: 'var(--mut)' }}>Tasks are created per site to track work items and milestones.</div>
          </div>
        ) : (
          <div className="ct-card" style={{ overflowX: 'auto' }}>
            <table className="ct-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Site</th>
                  <th>Stage</th>
                  <th>Progress</th>
                  <th>Due Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(t => (
                  <tr key={t.id}>
                    <td>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                      {t.description && <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 2 }}>{t.description.substring(0, 60)}{t.description.length > 60 ? '…' : ''}</div>}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--mut)' }}>{t.site.name}</td>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{String(t.stage).replace(/_/g, ' ')}</td>
                    <td>
                      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{t.progress}%</div>
                      <div className="ct-progress" style={{ width: 80 }}>
                        <div className="ct-progress-fill" style={{ width: `${t.progress}%` }}></div>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--mut)' }}>
                      {t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                    </td>
                    <td>
                      <span className={`chip ${STATUS_COLOR[t.status] ?? ''}`}
                        style={{ fontSize: 11, fontWeight: 700, ...(!STATUS_COLOR[t.status] ? { background: '#eef2f6', color: 'var(--mut)' } : {}) }}>
                        <span className="chip-dot"></span>{String(t.status).replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
