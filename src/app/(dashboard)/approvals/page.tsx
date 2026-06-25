import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import ResponsiveTable from '@/components/responsive/ResponsiveTable'
import MobileCardList from '@/components/responsive/MobileCardList'
import { getApprovalsAction, getApprovalStatsAction } from '@/actions/approvals'

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>
}) {
  const session = await auth()
  if (!session?.user?.companyId && session?.user?.role !== 'SUPER_ADMIN') redirect('/login')

  const params = searchParams ? await searchParams : {}
  const activeStatus = params.status || 'ALL'

  const [approvals, stats] = await Promise.all([
    getApprovalsAction({ status: activeStatus }),
    getApprovalStatsAction(),
  ])

  const statusColor: Record<string, string> = {
    PENDING: 'amber',
    SUBMITTED: 'amber',
    PENDING_REVIEW: 'amber',
    APPROVED: 'green',
    PAID: 'blue',
    REJECTED: 'red',
    DRAFT: 'mut',
  }

  const tabs = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'PAID']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 3px', letterSpacing: '-0.02em' }}>Approval Center</h1>
          <p style={{ color: 'var(--mut)', fontSize: '13px', margin: 0 }}>Review, verify, and disburse operational & financial requests</p>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        {[
          { label: 'Pending Approvals', value: String(stats.pending), sub: 'Awaiting decision', color: 'var(--amber)' },
          { label: 'Urgent Priority', value: String(stats.urgent), sub: 'High attention required', color: 'var(--red)' },
          { label: 'Approved (7d)', value: String(stats.approvedWeek), sub: 'Recently cleared', color: 'var(--green)' },
          { label: 'Pending Value', value: formatCurrency(stats.pendingAmount), sub: 'Total pipeline cash', color: 'var(--p)' },
        ].map((c) => (
          <div key={c.label} className="ct-card" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: '10.5px', color: 'var(--mut)', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: c.color, marginBottom: '2px' }}>{c.value}</div>
            <div style={{ fontSize: '11.5px', color: 'var(--mut)', fontWeight: 500 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs / Filter Chips */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
        {tabs.map((tab) => {
          const isActive = activeStatus === tab
          return (
            <Link
              key={tab}
              href={`/approvals${tab === 'ALL' ? '' : `?status=${tab}`}`}
              style={{
                padding: '7px 14px',
                borderRadius: '20px',
                fontSize: '12.5px',
                fontWeight: 700,
                textDecoration: 'none',
                background: isActive ? 'var(--p)' : 'var(--card-bg, #fff)',
                color: isActive ? '#fff' : 'var(--ink)',
                border: isActive ? 'none' : '1px solid var(--line)',
                boxShadow: isActive ? '0 2px 6px rgba(19,85,142,0.25)' : 'var(--card-shadow)',
                whiteSpace: 'nowrap',
              }}
            >
              {tab}
            </Link>
          )
        })}
      </div>

      {/* Table & Mobile Card List */}
      <div className="ct-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 800, margin: 0 }}>Workflow Requests</h2>
          <span style={{ fontSize: '12px', color: 'var(--mut)', fontWeight: 600 }}>{approvals.length} records</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <ResponsiveTable
            desktopView={
              <table className="ct-table">
                <thead>
                  <tr>
                    <th>Title / Request</th>
                    <th>Entity</th>
                    <th>Site</th>
                    <th>Amount</th>
                    <th>Submitted By</th>
                    <th>Date</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {approvals.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--mut)' }}>No workflow approvals found matching this criteria.</td>
                    </tr>
                  ) : (
                    approvals.map((app) => (
                      <tr key={app.id}>
                        <td>
                          <Link href={`/approvals/${app.id}`} style={{ fontWeight: 700, color: 'var(--ink)', textDecoration: 'none', display: 'block', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {app.title}
                          </Link>
                          {app._count.comments > 0 && (
                            <span style={{ fontSize: '11px', color: 'var(--p)', fontWeight: 600 }}>💬 {app._count.comments} notes</span>
                          )}
                        </td>
                        <td>
                          <span className="chip chip-mut" style={{ fontSize: '10px' }}>{app.entityType}</span>
                        </td>
                        <td style={{ fontSize: '12.5px', color: 'var(--mut)', fontWeight: 600 }}>
                          {app.site?.name || 'Company Wide'}
                        </td>
                        <td style={{ fontWeight: 800, color: 'var(--ink)' }}>
                          {formatCurrency(app.amount ? Number(app.amount) : 0)}
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--mut)', fontWeight: 600 }}>
                          {app.requestedBy.name}
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--mut)', fontWeight: 600 }}>
                          {formatDate(app.submittedAt)}
                        </td>
                        <td>
                          <span className={`chip chip-${app.priority === 'URGENT' ? 'red' : app.priority === 'HIGH' ? 'amber' : 'mut'}`} style={{ fontSize: '10px' }}>
                            {app.priority}
                          </span>
                        </td>
                        <td>
                          <span className={`chip chip-${statusColor[app.currentStatus] ?? 'mut'}`}>
                            {app.currentStatus}
                          </span>
                        </td>
                        <td>
                          <Link href={`/approvals/${app.id}`} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '11.5px', textDecoration: 'none', fontWeight: 700 }}>
                            Review
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            }
            mobileView={
              <MobileCardList
                items={approvals.map((app) => ({
                  id: app.id,
                  title: (
                    <Link href={`/approvals/${app.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                      {app.title}
                    </Link>
                  ),
                  subtitle: `${app.entityType} • ${app.site?.name || 'Office'} • ${app.requestedBy.name}`,
                  meta: (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                      <div style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--ink)' }}>
                        {formatCurrency(app.amount ? Number(app.amount) : 0)}
                      </div>
                      <Link href={`/approvals/${app.id}`} style={{ fontSize: '12px', fontWeight: 700, color: 'var(--p)', textDecoration: 'none' }}>
                        Review →
                      </Link>
                    </div>
                  ),
                  statusNode: (
                    <span className={`chip chip-${statusColor[app.currentStatus] ?? 'mut'}`} style={{ fontSize: '10px' }}>
                      {app.currentStatus}
                    </span>
                  ),
                }))}
              />
            }
          />
        </div>
      </div>
    </div>
  )
}
