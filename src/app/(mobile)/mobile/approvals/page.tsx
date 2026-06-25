import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import MobileCardList from '@/components/responsive/MobileCardList'
import { getApprovalsAction } from '@/actions/approvals'

export default async function MobileApprovalsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const params = searchParams ? await searchParams : {}
  const activeStatus = params.status || 'ALL'

  const approvals = await getApprovalsAction({ status: activeStatus })

  const statusColor: Record<string, string> = {
    PENDING: 'amber',
    SUBMITTED: 'amber',
    PENDING_REVIEW: 'amber',
    APPROVED: 'green',
    PAID: 'blue',
    REJECTED: 'red',
    DRAFT: 'mut',
  }

  const tabs = ['ALL', 'PENDING', 'APPROVED', 'REJECTED']

  return (
    <div className="module" style={{ paddingBottom: '90px' }}>
      <div className="appbar" style={{ marginBottom: '14px' }}>
        <div className="sitepill">
          <div>
            <div className="sitenm">Field Approvals</div>
            <div className="sitesub">Review site requests & bills</div>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '16px', paddingBottom: '4px' }}>
        {tabs.map((tab) => {
          const isActive = activeStatus === tab
          return (
            <Link
              key={tab}
              href={`/mobile/approvals${tab === 'ALL' ? '' : `?status=${tab}`}`}
              style={{
                padding: '6px 14px',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: 700,
                textDecoration: 'none',
                background: isActive ? 'var(--p)' : '#fff',
                color: isActive ? '#fff' : 'var(--ink)',
                border: isActive ? 'none' : '1px solid var(--line)',
                whiteSpace: 'nowrap',
              }}
            >
              {tab}
            </Link>
          )
        })}
      </div>

      {/* Mobile Card List */}
      <MobileCardList
        items={approvals.map((app) => ({
          id: app.id,
          title: (
            <Link href={`/mobile/approvals/${app.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              {app.title}
            </Link>
          ),
          subtitle: `${app.entityType} • ${app.site?.name || 'Office'} • ${app.requestedBy.name}`,
          meta: (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>
                {formatCurrency(app.amount ? Number(app.amount) : 0)}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--mut)', fontWeight: 600 }}>
                {formatDate(app.submittedAt)}
              </span>
            </div>
          ),
          statusNode: (
            <span className={`chip chip-${statusColor[app.currentStatus] ?? 'mut'}`} style={{ fontSize: '10px' }}>
              {app.currentStatus}
            </span>
          ),
        }))}
      />

      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <Link href="/mobile/home" style={{ color: 'var(--p)', fontWeight: 700, textDecoration: 'none', fontSize: '13px' }}>
          ← Back to Mobile Home
        </Link>
      </div>
    </div>
  )
}
