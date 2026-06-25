import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

const CAT_COLOR: Record<string, string> = {
  CONTRACT: 'chip-blue', DRAWING: 'chip-violet', PERMIT: 'chip-amber',
  REPORT: 'chip-green', INVOICE: 'chip-red', OTHER: '',
}

export default async function DocumentsPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const docs = await prisma.document.findMany({
    where: { companyId },
    include: { site: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const byCategory = docs.reduce((acc, d) => {
    acc[d.category] = (acc[d.category] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <>
      <div className="topbar">
        <div className="title">Documents</div>
      </div>

      <div style={{ padding: '20px' }}>
        <div className="kpis" style={{ marginBottom: '20px' }}>
          <div className="kpi">
            <div className="klbl">Total Documents</div>
            <div className="knum">{docs.length}</div>
          </div>
          {Object.entries(byCategory).map(([cat, count]) => (
            <div key={cat} className="kpi">
              <div className="klbl">{cat}</div>
              <div className="knum">{count}</div>
            </div>
          ))}
        </div>

        {docs.length === 0 ? (
          <div className="ct-card" style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>No documents yet</div>
            <div style={{ fontSize: 13, color: 'var(--mut)' }}>Upload contracts, drawings, permits, and reports to keep everything in one place.</div>
          </div>
        ) : (
          <div className="ct-card" style={{ overflowX: 'auto' }}>
            <table className="ct-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Site</th>
                  <th>Category</th>
                  <th>Version</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#e7f0fb', color: 'var(--p)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{d.name}</div>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--mut)' }}>{d.site?.name ?? 'Company-wide'}</td>
                    <td>
                      <span className={`chip ${CAT_COLOR[d.category] ?? ''}`}
                        style={{ fontSize: 10, fontWeight: 700, ...(!CAT_COLOR[d.category] ? { background: '#eef2f6', color: 'var(--mut)' } : {}) }}>
                        {d.category}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--mut)' }}>v{d.version ?? '1'}</td>
                    <td style={{ fontSize: 12, color: 'var(--mut)' }}>
                      {new Date(d.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
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
