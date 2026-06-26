import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'

import { redirect } from 'next/navigation'

function siteStatus(progress: number): { label: string; cls: string } {
  if (progress >= 75) return { label: 'On track', cls: 'chip-green' }
  if (progress >= 40) return { label: 'In progress', cls: 'chip-blue' }
  return { label: 'Needs review', cls: 'chip-amber' }
}

export default async function CompanyDashboard() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayEnd = new Date(today)
  todayEnd.setHours(23, 59, 59, 999)

  // Fetch site IDs first for labourAttendance
  const siteIds = await prisma.site.findMany({ where: { companyId }, select: { id: true } }).then(s => s.map(x => x.id))

  const [
    activeSitesCount,
    todayExpenseAgg,
    pendingExpenses,
    totalLabour,
    todayAttendance,
    recentPendingExpenses,
    recentExpenses,
    sites,
  ] = await Promise.all([
    prisma.site.count({ where: { companyId, deletedAt: null, status: 'ACTIVE' } }),

    prisma.expense.aggregate({
      where: { companyId, deletedAt: null, createdAt: { gte: today, lte: todayEnd } },
      _sum: { amount: true },
    }),

    prisma.expense.aggregate({
      where: { companyId, deletedAt: null, approvalStatus: 'PENDING' },
      _sum: { amount: true },
      _count: true,
    }),

    prisma.labour.count({ where: { companyId, isActive: true } }),

    prisma.labourAttendance.count({
      where: {
        siteId: { in: siteIds },
        date: { gte: today, lte: todayEnd },
        status: 'PRESENT',
      },
    }),

    // Pending approvals for right panel
    prisma.expense.findMany({
      where: { companyId, deletedAt: null, approvalStatus: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: {
        id: true, description: true, amount: true, paidTo: true, category: true,
        site: { select: { name: true } },
        createdAt: true,
      },
    }),

    // Recent bill uploads for right panel
    prisma.expense.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: {
        id: true, description: true, amount: true, paidTo: true,
        approvalStatus: true, category: true, createdAt: true,
        site: { select: { name: true } },
      },
    }),

    prisma.site.findMany({
      where: { companyId, deletedAt: null, status: 'ACTIVE' },
      orderBy: { spent: 'desc' },
      take: 5,
    }),
  ])

  const todaySpend = Number(todayExpenseAgg._sum.amount ?? 0)
  const pendingCount = pendingExpenses._count
  const pendingTotal = Number(pendingExpenses._sum.amount ?? 0)

  function fmtAmt(n: number) {
    if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2) + ' Cr'
    if (n >= 100000) return '₹' + (n / 100000).toFixed(2) + ' L'
    if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'k'
    return '₹' + n
  }

  function statusChipCls(s: string) {
    if (s === 'APPROVED') return 'schip green'
    if (s === 'REJECTED') return 'schip red'
    return 'schip amber'
  }

  function statusLabel(s: string) {
    const map: Record<string, string> = { APPROVED: 'Approved', PENDING: 'Pending', REJECTED: 'Rejected', PAID: 'Paid' }
    return map[s] ?? s
  }

  function timeAgo(d: Date) {
    const diff = Date.now() - new Date(d).getTime()
    const hrs = Math.floor(diff / 3600000)
    if (hrs < 1) return `${Math.floor(diff / 60000)}m ago`
    if (hrs < 24) return `${hrs}h ago`
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  }

  return (
    <>
      {/* QUICK ACTIONS ROW */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        {[
          { href: '/sites/new', icon: 'M12 5v14M5 12h14', label: 'Add Site', color: 'var(--p)' },
          { href: '/bills/upload', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', icon2: 'M14 2v6h6M12 18v-6M9 15h6', label: 'Upload Bill', color: '#0f7a45' },
          { href: '/expenses/new', icon: 'M3 7a2 2 0 0 1 2-2h12v4M3 7v10a2 2 0 0 0 2 2h14V9H5a2 2 0 0 1-2-2Z', label: 'Add Expense', color: '#b45309' },
          { href: '/labour', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', icon2: 'M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', label: 'Mark Attendance', color: '#6d28d9' },
          { href: '/dpr/new', icon: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7', icon2: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z', label: 'Create DPR', color: '#0369a1' },
          { href: '/reports', icon: 'M21 21l-4-4m0 0A7 7 0 1 0 3 3a7 7 0 0 0 14 14z', label: 'Generate Report', color: '#be123c' },
        ].map(a => (
          <Link key={a.href} href={a.href} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px',
            background: '#fff', border: '1.5px solid var(--line)', borderRadius: 10,
            fontSize: 13, fontWeight: 600, color: 'var(--ink)', textDecoration: 'none',
            whiteSpace: 'nowrap', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={a.color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d={a.icon}/>
              {a.icon2 && <path d={a.icon2}/>}
            </svg>
            {a.label}
          </Link>
        ))}
      </div>

      {/* 6 KPI CARDS */}
      <div className="kpis">
        <div className="kpi">
          <div className="klbl">Active Sites</div>
          <div className="knum">{activeSitesCount}</div>
          <div className="ksub up"><span>●</span>Active this month</div>
        </div>
        <div className="kpi feat">
          <div className="klbl">Today&apos;s Expense</div>
          <div className="knum">{fmtAmt(todaySpend)}</div>
          <div className="ksub"><span>▲</span>Across all sites today</div>
        </div>
        <div className="kpi">
          <div className="klbl">Bills Pending</div>
          <div className="knum">{pendingCount}</div>
          <div className="ksub warn"><span>▲</span>{fmtAmt(pendingTotal)} to approve</div>
        </div>
        <div className="kpi">
          <div className="klbl">Labour Present</div>
          <div className="knum">{todayAttendance}/{totalLabour || '—'}</div>
          <div className="ksub up"><span>●</span>{totalLabour > 0 ? Math.round((todayAttendance / totalLabour) * 100) : 0}% attendance</div>
        </div>
        <div className="kpi">
          <div className="klbl">Salary Due</div>
          <div className="knum">—</div>
          <div className="ksub mut"><span>●</span>No run scheduled</div>
        </div>
        <div className="kpi">
          <div className="klbl">Client Receivable</div>
          <div className="knum">—</div>
          <div className="ksub mut"><span>●</span>No overdue invoices</div>
        </div>
      </div>

      <div className="dgrid">
        <div className="colL">
          <div className="card">
            <div className="chead">
              <div>
                <div className="ctitle">Site-wise cost summary</div>
                <div className="csub">{activeSitesCount} active sites</div>
              </div>
              <Link href="/sites" className="clink">View all sites</Link>
            </div>
            <div className="cbody" style={{ padding: 0 }}>
              {sites.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--mut)' }}>No active sites</div>
              ) : (
                <table className="ct-table">
                  <thead>
                    <tr>
                      <th>Site</th>
                      <th>Budget</th>
                      <th>Spend</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sites.map(site => {
                      const budget = Number(site.budget)
                      const spent = Number(site.spent)
                      const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : site.progress
                      const st = siteStatus(site.progress)
                      return (
                        <tr key={site.id}>
                          <td>
                            <div className="conm">{site.name}</div>
                            <div className="csub">{site.location}</div>
                          </td>
                          <td style={{ minWidth: 120 }}>
                            <div className="ct-progress" style={{ width: 110 }}>
                              <div className={`ct-progress-fill ${pct > 80 ? 'red' : pct > 60 ? 'amber' : ''}`} style={{ width: `${pct}%` }}></div>
                            </div>
                            <div className="csub" style={{ marginTop: 3 }}>
                              {budget > 0 ? `${fmtAmt(spent)} of ${fmtAmt(budget)}` : `${pct}% complete`}
                            </div>
                          </td>
                          <td className="conm" style={{ fontWeight: 700 }}>{fmtAmt(spent)}</td>
                          <td><span className={`chip ${st.cls}`}><span className="chip-dot"></span>{st.label}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <div className="colR">
          {/* Pending Approval */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="chead">
              <div>
                <div className="ctitle">Pending approval</div>
                <div className="csub">{pendingCount} items · {fmtAmt(pendingTotal)}</div>
              </div>
              <Link href="/approvals" className="clink" style={{ color: 'var(--p)', fontSize: 13 }}>Open</Link>
            </div>
            <div className="cbody" style={{ padding: '4px 0 0' }}>
              {recentPendingExpenses.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--mut)', fontSize: 13 }}>No pending items</div>
              ) : recentPendingExpenses.map(e => (
                <div key={e.id} className="lrow" style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)' }}>
                  <div className="lava" style={{ background: '#fff3e0', color: '#e07a1f', width: 34, height: 34, fontSize: 12 }}>
                    {(e.category ?? 'EX').substring(0, 2)}
                  </div>
                  <div className="lmain">
                    <div className="lt1" style={{ fontSize: 13 }}>{e.description}</div>
                    <div className="lt2">{e.paidTo ?? e.site?.name ?? '—'} · {e.site?.name}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', flexShrink: 0 }}>{fmtAmt(Number(e.amount))}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent bill uploads */}
          <div className="card">
            <div className="chead">
              <div className="ctitle">Recent bill uploads</div>
              <Link href="/bills" className="clink">All</Link>
            </div>
            <div className="cbody" style={{ padding: '4px 0 0' }}>
              {recentExpenses.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--mut)', fontSize: 13 }}>No recent bills</div>
              ) : recentExpenses.map(e => (
                <div key={e.id} className="lrow" style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)' }}>
                  <div className="lava" style={{ background: '#f0f4f8', color: 'var(--p)', width: 34, height: 34, fontSize: 11 }}>
                    {(e.category ?? 'BI').substring(0, 2)}
                  </div>
                  <div className="lmain">
                    <div className="lt1" style={{ fontSize: 13 }}>{e.paidTo ?? e.description}</div>
                    <div className="lt2">{e.category} · {timeAgo(e.createdAt)}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{fmtAmt(Number(e.amount))}</div>
                    <div className={statusChipCls(e.approvalStatus)} style={{ marginTop: 4 }}>{statusLabel(e.approvalStatus)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
                       