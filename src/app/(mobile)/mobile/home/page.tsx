import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'

export const metadata = { title: 'Home | Civil Tracker' }

export default async function MobileHomePage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId, name } = session.user

  const today = new Date(); today.setHours(0, 0, 0, 0)

  const [sites, todayExpenses, todayAttendance, pendingBills] = await Promise.all([
    prisma.site.findMany({ where: { companyId, status: 'ACTIVE', deletedAt: null }, select: { id: true, name: true, progress: true, currentStage: true, location: true, spent: true, budget: true }, take: 5 }),
    prisma.expense.aggregate({ where: { companyId, createdAt: { gte: today } }, _sum: { amount: true }, _count: true }),
    prisma.labourAttendance.count({ where: { labour: { companyId }, date: today, status: { in: ['PRESENT', 'HALF_DAY'] } } }),
    prisma.expense.count({ where: { companyId, approvalStatus: 'PENDING' } }),
  ])

  const todaySpend = Number(todayExpenses._sum.amount ?? 0)

  return (
    <div style={{ padding: '16px 16px 0' }}>
      {/* Hero */}
      <div className="ct-hero" style={{ marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, opacity: 0.75, marginBottom: '2px' }}>Welcome back,</div>
            <div style={{ fontSize: '20px', fontWeight: 800 }}>{name?.split(' ')[0]} \u{1F44B}</div>
          </div>
          <Link href="/dashboard" style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.12)', borderRadius: '9px', fontSize: '11.5px', fontWeight: 700, color: '#fff', textDecoration: 'none' }}>\u{1F4BB} Desktop</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '12px', padding: '11px 12px' }}>
            <div style={{ fontSize: '9.5px', fontWeight: 700, opacity: 0.7, marginBottom: '4px' }}>TODAY SPEND</div>
            <div style={{ fontSize: '17px', fontWeight: 800 }}>{formatCurrency(todaySpend)}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '12px', padding: '11px 12px' }}>
            <div style={{ fontSize: '9.5px', fontWeight: 700, opacity: 0.7, marginBottom: '4px' }}>LABOUR</div>
            <div style={{ fontSize: '17px', fontWeight: 800 }}>{todayAttendance}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '12px', padding: '11px 12px' }}>
            <div style={{ fontSize: '9.5px', fontWeight: 700, opacity: 0.7, marginBottom: '4px' }}>PENDING</div>
            <div style={{ fontSize: '17px', fontWeight: 800 }}>{pendingBills} bills</div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '18px' }}>
        {[
          { href: '/mobile/add/expense', icon: '\u{1F4B3}', label: 'Add Expense', color: '#13558e' },
          { href: '/mobile/attendance', icon: '\u{1F4CB}', label: 'Attendance', color: '#138a4e' },
          { href: '/mobile/add/dpr', icon: '\u{1F4DD}', label: 'Add DPR', color: '#5b47b8' },
          { href: '/mobile/add/material', icon: '\u{1F9F1}', label: 'Materials', color: '#e08a0b' },
        ].map(a => (
          <Link key={a.href} href={a.href} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', background: '#fff', borderRadius: '14px', border: '1px solid var(--line)', textDecoration: 'none', color: 'inherit' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: a.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>{a.icon}</div>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{a.label}</span>
          </Link>
        ))}
      </div>

      {/* Active sites */}
      <div style={{ marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 800, margin: 0 }}>Active Sites</h2>
          <Link href="/sites" style={{ fontSize: '12px', color: 'var(--p)', fontWeight: 700, textDecoration: 'none' }}>View all</Link>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sites.map(site => {
            const pct = Math.round(Number(site.progress))
            return (
              <Link key={site.id} href={`/sites/${site.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid var(--line)', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 800 }}>{site.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--mut)', fontWeight: 500 }}>{site.location} \u00b7 {site.currentStage}</div>
                    </div>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--p)' }}>{pct}%</span>
                  </div>
                  <div className="ct-progress">
                    <div className="ct-progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
