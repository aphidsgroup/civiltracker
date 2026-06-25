import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { redirect } from 'next/navigation'
import ResponsiveTable from '@/components/responsive/ResponsiveTable'
import MobileCardList from '@/components/responsive/MobileCardList'

export default async function CompanyDashboard() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user
  
  // 1. Total Site Spend (sum of all APPROVED/PAID expenses)
  const expensesAgg = await prisma.expense.aggregate({
    where: { companyId, deletedAt: null, approvalStatus: { in: ['APPROVED', 'PAID'] } },
    _sum: { amount: true }
  })
  const totalSpend = Number(expensesAgg._sum.amount || 0)

  // 2. Pending Approvals
  const pendingApprovalsCount = await prisma.expense.count({
    where: { companyId, deletedAt: null, approvalStatus: 'PENDING' }
  })

  // 3. Active Labourers
  const activeLabourersCount = await prisma.labour.count({
    where: { companyId, isActive: true }
  })
  
  const activeSitesCount = await prisma.site.count({
    where: { companyId, deletedAt: null, status: 'ACTIVE' }
  })

  // 4. Upcoming Bills (Unpaid approved expenses)
  const upcomingBillsAgg = await prisma.expense.aggregate({
    where: { companyId, deletedAt: null, approvalStatus: 'APPROVED' },
    _sum: { amount: true }
  })
  const upcomingBills = Number(upcomingBillsAgg._sum.amount || 0)

  // 5. Active Sites
  const sites = await prisma.site.findMany({
    where: { companyId, deletedAt: null, status: 'ACTIVE' },
    orderBy: { spent: 'desc' },
    take: 5,
  })

  // 6. Recent Activity (Recent Expenses)
  const recentExpenses = await prisma.expense.findMany({
    where: { companyId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      createdBy: { select: { name: true } },
      site: { select: { name: true } }
    }
  })

  return (
    <>
      <div className="kpis">
        <div className="kpi feat">
          <div className="klbl">Total Site Spend</div>
          <div className="knum">{formatCurrency(totalSpend)}</div>
          <div className="ksub"><span>▲</span>Recorded via approved expenses</div>
        </div>
        <div className="kpi">
          <div className="klbl">Pending Approvals</div>
          <div className="knum">{pendingApprovalsCount}</div>
          <div className="ksub warn"><span>●</span>Awaiting review</div>
        </div>
        <div className="kpi">
          <div className="klbl">Active Labourers</div>
          <div className="knum">{activeLabourersCount}</div>
          <div className="ksub up"><span>●</span>Across {activeSitesCount} sites</div>
        </div>
        <div className="kpi">
          <div className="klbl">Upcoming Bills</div>
          <div className="knum">{formatCurrency(upcomingBills)}</div>
          <div className="ksub down"><span>●</span>Approved but unpaid</div>
        </div>
      </div>
      
      <div className="dgrid">
        <div className="colL">
          <div className="card">
            <div className="chead">
              <div>
                <div className="ctitle">Active Sites</div>
                <div className="csub">Sorted by highest spend</div>
              </div>
              <Link href="/sites" className="clink">View all</Link>
            </div>
            <div className="cbody" style={{ padding: 0 }}>
              {sites.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--mut)' }}>No active sites</div>
              ) : (
                <ResponsiveTable
                  desktopView={
                    <table className="ct-table">
                      <thead>
                        <tr>
                          <th>Site Name</th>
                          <th>Progress</th>
                          <th>Spend</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sites.map(site => (
                          <tr key={site.id}>
                            <td>
                              <div className="conm">{site.name}</div>
                              <div className="csub">{site.location}</div>
                            </td>
                            <td>
                              <div className="ct-progress" style={{ width: '100px' }}><div className={`ct-progress-fill ${site.progress < 50 ? 'amber' : ''}`} style={{ width: `${site.progress}%` }}></div></div>
                              <div className="csub" style={{ marginTop: '4px' }}>{site.progress}% complete</div>
                            </td>
                            <td className="conm">{formatCurrency(Number(site.spent))}</td>
                            <td><span className="chip chip-green"><span className="chip-dot"></span>{site.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  }
                  mobileView={
                    <MobileCardList
                      items={sites.map(site => ({
                        id: site.id,
                        title: site.name,
                        subtitle: site.location,
                        meta: <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '8px' }}>Spend: {formatCurrency(Number(site.spent))}</div>,
                        statusNode: <span className="chip chip-green"><span className="chip-dot"></span>{site.status}</span>
                      }))}
                    />
                  }
                />
              )}
            </div>
          </div>
        </div>
        
        <div className="colR">
          <div className="card">
            <div className="chead">
              <div>
                <div className="ctitle">Recent Activity</div>
                <div className="csub">Latest expenses and updates</div>
              </div>
            </div>
            <div className="cbody">
              <div className="dgrid" style={{ gap: '14px', display: 'flex', flexDirection: 'column' }}>
                {recentExpenses.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--mut)' }}>No recent activity</div>
                ) : recentExpenses.map(exp => (
                  <div key={exp.id} style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: exp.approvalStatus === 'APPROVED' ? '#e2f3ea' : '#e7f0fb', color: exp.approvalStatus === 'APPROVED' ? '#0f7a45' : '#13558e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg className="svg16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        {exp.approvalStatus === 'APPROVED' ? <polyline points="20 6 9 17 4 12"/> : <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>}
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{exp.approvalStatus === 'APPROVED' ? 'Expense Approved' : 'Expense Logged'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--mut)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>{formatCurrency(Number(exp.amount))} - {exp.description}</div>
                      <div style={{ fontSize: '10.5px', color: '#8aa0b3', marginTop: '4px' }}>{exp.site.name} • By {exp.createdBy.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
