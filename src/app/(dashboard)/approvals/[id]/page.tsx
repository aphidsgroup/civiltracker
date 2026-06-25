import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import Link from 'next/link'
import { getApprovalByIdAction } from '@/actions/approvals'
import ApprovalDetailActions from '@/components/approvals/ApprovalDetailActions'
import { hasPermission } from '@/lib/permissions'
import type { Role } from '@prisma/client'

export default async function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect('/login')

  let approvalData
  try {
    approvalData = await getApprovalByIdAction(id)
  } catch {
    redirect('/approvals')
  }

  const { approval, entityData } = approvalData

  const statusColor: Record<string, string> = {
    PENDING: 'amber',
    SUBMITTED: 'amber',
    PENDING_REVIEW: 'amber',
    APPROVED: 'green',
    PAID: 'blue',
    REJECTED: 'red',
    DRAFT: 'mut',
  }

  const userRole = session.user.role as Role
  const canApprove = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'PROJECT_MANAGER', 'ACCOUNTANT', 'PURCHASE_MANAGER'].includes(userRole)
  const canPay = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ACCOUNTANT'].includes(userRole) || hasPermission(userRole, 'salary.markPaid') || hasPermission(userRole, 'payments.manage')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', maxWidth: '900px', margin: '0 auto' }}>
      <div>
        <Link href="/approvals" style={{ color: 'var(--mut)', textDecoration: 'none', fontSize: '13px', fontWeight: 700 }}>
          ← Back to Approval Center
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '10px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
              <span className={`chip chip-${statusColor[approval.currentStatus] ?? 'mut'}`} style={{ fontSize: '11px' }}>
                {approval.currentStatus}
              </span>
              <span className="chip chip-mut" style={{ fontSize: '11px' }}>
                {approval.entityType}
              </span>
              <span className={`chip chip-${approval.priority === 'URGENT' ? 'red' : 'mut'}`} style={{ fontSize: '11px' }}>
                {approval.priority}
              </span>
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
              {approval.title}
            </h1>
            <p style={{ color: 'var(--mut)', fontSize: '13.5px', margin: 0 }}>
              Requested by {approval.requestedBy.name} ({approval.requestedBy.role}) · {approval.site?.name || 'Office Wide'}
            </p>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: 'var(--mut)', fontWeight: 700, textTransform: 'uppercase' }}>Amount</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ink)' }}>
              {formatCurrency(approval.amount ? Number(approval.amount) : 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Description / Metadata Card */}
      <div className="ct-card" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 10px' }}>Request Rationale & Context</h3>
        <p style={{ fontSize: '14px', lineHeight: '1.6', color: 'var(--ink)', margin: 0, whiteSpace: 'pre-wrap' }}>
          {approval.description || 'No additional text description provided.'}
        </p>

        {approval.rejectionReason && (
          <div style={{ marginTop: '16px', padding: '12px 16px', borderRadius: '8px', background: '#fdf2f2', borderLeft: '4px solid var(--red)' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#991b1b', marginBottom: '4px' }}>REJECTION REASON</div>
            <div style={{ fontSize: '13.5px', color: '#771d1d', fontWeight: 600 }}>{approval.rejectionReason}</div>
          </div>
        )}

        {/* Display attachments if expense */}
        {entityData && 'billAttachments' in entityData && Array.isArray(entityData.billAttachments) && entityData.billAttachments.length > 0 && (
          <div style={{ marginTop: '20px', borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 10px', color: 'var(--mut)' }}>Attached Bill / Document</h4>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {entityData.billAttachments.map((att: { id: string; secureUrl: string; format: string | null }) => (
                <a
                  key={att.id}
                  href={att.secureUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '6px', background: 'var(--bg)', border: '1px solid var(--line)', textDecoration: 'none', color: 'var(--p)', fontSize: '13px', fontWeight: 700 }}
                >
                  📎 View Attachment ({att.format || 'doc'})
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Interactive Action Bar (Client Component) */}
      <ApprovalDetailActions
        approvalId={approval.id}
        status={approval.currentStatus}
        canApprove={canApprove}
        canPay={canPay}
      />

      {/* Comments Trail */}
      <div className="ct-card" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 16px' }}>💬 Internal Discussion ({approval.comments.length})</h3>
        {approval.comments.length === 0 ? (
          <div style={{ color: 'var(--mut)', fontSize: '13px', fontStyle: 'italic' }}>No notes posted yet. Use the box above to start discussion.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {approval.comments.map((c: { id: string; user: { name: string; role: string }; comment: string; createdAt: Date }) => (
              <div key={c.id} style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--bg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{c.user.name} ({c.user.role})</span>
                  <span style={{ fontSize: '11px', color: 'var(--mut)', fontWeight: 600 }}>{formatDateTime(c.createdAt)}</span>
                </div>
                <div style={{ fontSize: '13.5px', color: 'var(--ink)', lineHeight: '1.5' }}>{c.comment}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Timeline Trail */}
      <div className="ct-card" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 16px' }}>📜 Audit Timeline</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderLeft: '2px solid var(--line)', paddingLeft: '16px', marginLeft: '6px' }}>
          {approval.timelines.map((t: { id: string; action: string; note: string | null; actor: { name: string; role: string }; createdAt: Date }) => (
            <div key={t.id} style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '-21px', top: '2px', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--p)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>{t.action}</span>
                <span style={{ fontSize: '11px', color: 'var(--mut)', fontWeight: 600 }}>{formatDateTime(t.createdAt)}</span>
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--mut)', marginTop: '2px' }}>
                By {t.actor.name} ({t.actor.role}) {t.note && `— "${t.note}"`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
