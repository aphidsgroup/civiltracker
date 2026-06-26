import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import Link from 'next/link'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default async function MobileHome() {
  const session = await auth()
  const companyId = session?.user?.companyId
  const userId = session?.user?.id

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayEnd = new Date(today)
  todayEnd.setHours(23, 59, 59, 999)

  // Active site — user's first assigned site or company's first site
  const member = await prisma.companyMember.findFirst({
    where: { userId, companyId },
  })
  const siteIds = member?.siteIds ?? []

  const activeSite = siteIds.length > 0
    ? await prisma.site.findFirst({ where: { id: { in: siteIds }, companyId } })
    : await prisma.site.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' } })

  const siteId = activeSite?.id

  // Parallel data fetches
  const [
    todayExpenseAgg,
    pendingBillsCount,
    todayAttendance,
    totalLabour,
    todayPhotos,
    pendingApprovals,
    recentExpenses,
  ] = await Promise.all([
    // Today's expense total
    siteId ? prisma.expense.aggregate({
      where: { siteId, createdAt: { gte: today, lte: todayEnd } },
      _sum: { amount: true },
    }) : Promise.resolve({ _sum: { amount: null } }),

    // Pending bills/expenses count
    siteId ? prisma.expense.count({
      where: { siteId, approvalStatus: 'PENDING' },
    }) : Promise.resolve(0),

    // Today's attendance count
    siteId ? prisma.labourAttendance.count({
      where: { siteId, date: { gte: today, lte: todayEnd }, status: 'PRESENT' },
    }) : Promise.resolve(0),

    // Total labour on site
    siteId ? prisma.labour.count({ where: { siteId, isActive: true } }) : Promise.resolve(0),

    // Today's site photos
    siteId ? prisma.sitePhoto.count({
      where: { siteId, createdAt: { gte: today, lte: todayEnd } },
    }) : Promise.resolve(0),

    // Pending expense approvals (submitted by this user)
    siteId ? prisma.expense.findMany({
      where: { siteId, approvalStatus: 'PENDING', createdById: userId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, description: true, amount: true, paidTo: true, createdAt: true, category: true },
    }) : Promise.resolve([]),

    // Recent expenses/uploads
    siteId ? prisma.expense.findMany({
      where: { siteId },
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: { id: true, description: true, amount: true, paidTo: true, approvalStatus: true, createdAt: true, category: true },
    }) : Promise.resolve([]),
  ])

  const todaySpend = Number(todayExpenseAgg._sum.amount ?? 0)
  const todaySpendFmt = todaySpend >= 100000
    ? '₹' + (todaySpend / 100000).toFixed(1) + 'L'
    : todaySpend >= 1000
    ? '₹' + (todaySpend / 1000).toFixed(1) + 'k'
    : '₹' + todaySpend

  const budget = Number(activeSite?.budget ?? 0)
  const spent = Number(activeSite?.spent ?? 0)
  const budgetPct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0

  // Day counter
  const startDate = activeSite?.startDate
  const targetDate = activeSite?.targetEndDate
  const dayOfProject = startDate
    ? Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000) + 1
    : null
  const totalDays = startDate && targetDate
    ? Math.floor((new Date(targetDate).getTime() - new Date(startDate).getTime()) / 86400000)
    : null

  function fmtAmt(n: number) {
    return '₹' + n.toLocaleString('en-IN')
  }

  function statusChipClass(s: string) {
    if (s === 'APPROVED') return 'schip green'
    if (s === 'REJECTED') return 'schip red'
    return 'schip amber'
  }

  function statusLabel(s: string) {
    if (s === 'APPROVED') return 'Approved'
    if (s === 'REJECTED') return 'Rejected'
    if (s === 'PENDING') return 'Pending'
    return s
  }

  function timeAgo(d: Date) {
    const diff = Date.now() - new Date(d).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `Today ${new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  }

  const firstName = session?.user?.name?.split(' ')[0] ?? 'there'

  return (
    <>
      {/* APPBAR */}
      <div className="appbar">
        <div className="sitepill">
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--p)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/></svg>
          </div>
          <div>
            <div className="sitenm">{activeSite?.name ?? 'No Site'}</div>
            <div className="sitesub" style={{ color: 'var(--mut)', fontSize: 11 }}>Madras Crafters</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mut)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 2 }}><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div className="hbtns">
          <div className="sync ok"><span className="sdot"></span>Synced</div>
          <div className="bell">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            {pendingBillsCount > 0 && <b style={{ background: '#e53935' }}></b>}
          </div>
        </div>
      </div>

      {/* GREETING */}
      <div className="greet">
        <div>
          <div className="gname">{getGreeting()}, {firstName}</div>
          <div className="grole" style={{ color: 'var(--mut)', fontSize: 12.5, marginTop: 2 }}>
            {session?.user?.role?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())} · {activeSite?.name ?? '—'}
          </div>
        </div>
        <div className="gdate">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long' })}<br/>
          <span style={{ fontSize: 11 }}>{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
      </div>

      {/* TODAY ON SITE CARD */}
      <div className="hero">
        <div className="herotop">
          <div className="herolbl">TODAY ON SITE</div>
          {dayOfProject && totalDays && (
            <div className="herochip">Day {dayOfProject} of {totalDays}</div>
          )}
        </div>
        <div className="herorow" style={{ gap: 0 }}>
          <div className="hstat">
            <div className="hnum" style={{ fontSize: 22 }}>{todaySpendFmt}</div>
            <div className="hsub">Today&apos;s expense</div>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.15)', margin: '4px 12px' }}></div>
          <div className="hstat">
            <div className="hnum" style={{ fontSize: 22 }}>{todayAttendance}/{totalLabour || '—'}</div>
            <div className="hsub">Labour present</div>
          </div>
          {pendingBillsCount > 0 && (
            <>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.15)', margin: '4px 12px' }}></div>
              <div className="hstat">
                <div className="hnum" style={{ fontSize: 22 }}>{pendingBillsCount}</div>
                <div className="hsub">Bills pending</div>
              </div>
            </>
          )}
        </div>
        <div className="herobar">
          <div className="hbline"><span>Budget used</span><span>{budgetPct}%</span></div>
          <div className="htrack"><div className="hfill" style={{ width: `${budgetPct}%` }}></div></div>
        </div>
      </div>

      {/* QUICK ACTIONS */}
      <div className="shead">
        <div className="stitle">Quick Actions</div>
        <div className="slink" style={{ fontSize: 11.5, color: 'var(--p)' }}>Within 3 taps</div>
      </div>
      <div className="qgrid">
        <Link href="/mobile/upload-bill" className="qtile" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="ic ic-blue">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
          </div>
          <div className="qtitle">Upload Bill</div>
          <div className="qmeta">{pendingBillsCount > 0 ? `${pendingBillsCount} pending approval` : 'Vendor invoice'}</div>
          {pendingBillsCount > 0 && <div className="qbadge" style={{ background: '#e53935' }}>{pendingBillsCount}</div>}
        </Link>

        <Link href="/mobile/add-expense" className="qtile" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="ic ic-amber">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h12v4M3 7v10a2 2 0 0 0 2 2h14V9H5a2 2 0 0 1-2-2Z"/><circle cx="16" cy="13" r="1.3" fill="currentColor"/></svg>
          </div>
          <div className="qtitle">Add Expense</div>
          <div className="qmeta">{todaySpend > 0 ? `${todaySpendFmt} today` : 'Petty cash'}</div>
        </Link>

        <Link href="/mobile/attendance" className="qtile" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="ic ic-green">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div className="qtitle">Mark Attendance</div>
          <div className="qmeta">{totalLabour > 0 ? `${todayAttendance} / ${totalLabour} marked` : 'Mark workers'}</div>
          {todayAttendance === 0 && totalLabour > 0 && <div className="qbadge">!</div>}
        </Link>

        <Link href="/mobile/site-photo" className="qtile" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="ic ic-violet">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          </div>
          <div className="qtitle">Site Photos</div>
          <div className="qmeta">{todayPhotos > 0 ? `${todayPhotos} uploaded today` : 'Progress pic'}</div>
        </Link>
      </div>

      {/* DAILY SITE REPORT BANNER */}
      <Link href="/mobile/dpr" className="qtile qwide" style={{ textDecoration: 'none', margin: '0 16px 4px' }}>
        <div className="ic">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </div>
        <div>
          <div className="qwtitle">Daily Site Report</div>
          <div className="qwsub">
            <span className="duepip"></span>
            Not submitted for {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · due 7 PM
          </div>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
      </Link>

      {/* PENDING YOUR APPROVAL */}
      {pendingApprovals.length > 0 && (
        <>
          <div className="shead">
            <div className="stitle">Pending your approval</div>
            <div className="slink">See all</div>
          </div>
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendingApprovals.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 14, padding: '12px 14px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e07a1f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#16273a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.description}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--mut)', marginTop: 2 }}>{a.paidTo ?? a.category} · you</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#16273a' }}>{fmtAmt(Number(a.amount))}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#e07a1f', marginTop: 2 }}>● Pending</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* RECENT BILL UPLOADS */}
      <div className="shead">
        <div className="stitle">Recent bill uploads</div>
        <Link href="/mobile/upload-bill" className="slink" style={{ color: 'var(--p)', textDecoration: 'none' }}>View all</Link>
      </div>
      <div style={{ padding: '0 16px 100px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {recentExpenses.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--mut)', fontSize: 13 }}>No uploads yet today</div>
        )}
        {recentExpenses.map(e => (
          <div key={e.id} className="lrow card" style={{ margin: 0 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--p)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            </div>
            <div className="lmain" style={{ flex: 1, minWidth: 0 }}>
              <div className="lt1" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.paidTo ?? e.description}</div>
              <div className="lt2">{e.category} · {timeAgo(e.createdAt)}</div>
            </div>
            <div className="lright" style={{ textAlign: 'right', flexShrink: 0 }}>
              <div className="lamt">{fmtAmt(Number(e.amount))}</div>
              <div className={statusChipClass(e.approvalStatus)} style={{ marginTop: 4 }}>{statusLabel(e.approvalStatus)}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
