import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import Link from 'next/link'
import { getApprovalByIdAction } from '@/actions/approvals'
import ApprovalDetailActions from '@/components/approvals/ApprovalDetailActions'
import { hasPermission } from '@/lib/permissions'
import type { Role } from '@prisma/client'

export default async function MobileApprovalDetailPage({
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
    redirect('/mobile/approvals')
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
    <div className="module" style={{ paddingBottom: '90px' }}>
      <div style={{ marginBottom: '14px' }}>
        <Link href="/mobile/approvals" style={{ color: 'var(--mut)', textDecoration: 'none', fontSize: '12.5px', fontWeight: 700 }}>
          ← Approvals List
        </Link>
      </div>

      <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
          <span className={`chip chip-${statusColor[approval.currentStatus] ?? 'mut'}`} style={{ fontSize: '10px' }}>
            {approval.currentStatus}
          </span>
          <span className="chip chip-mut" style={{ fontSize: '10px' }}>
            {approval.entityType}
          </span>
          <span className={`chip chip-${approval.priority === 'URGENT' ? 'red' : 'mut'}`} style={{ fontSize: '10px' }}>
            {approval.priority}
          </span>
        </div>

        <h1 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 6px', color: 'var(--ink)' }}>
          {approval.title}
        </h1>
        <div style={{ fontSize: '12px', color: 'var(--mut)', fontWeight: 600, marginBottom: '12px' }}>
          By {approval.requestedBy.name} · {approval.site?.name || 'Office'}
        </div>

        <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--mut)', fontWeight: 700 }}>Total Value</span>
          <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--p)' }}>
            {formatCurrency(approval.amount ? Number(approval.amount) : 0)}
          </span>
        </div>

        {approval.description && (
          <div style={{ marginTop: '14px', fontSize: '13px', lineHeight: '1.5', color: 'var(--ink)' }}>
            <b style={{ fontSize: '11px', color: 'var(--mut)', display: 'block', marginBottom: '4px' }}>DETAILS</b>
            {approval.description}
          </div>
        )}

        {approval.rejectionReason && (
          <div style={{ marginTop: '12px', padding: '10px', borderRadius: '6px', background: '#fdf2f2', color: '#991b1b', fontSize: '12.5px', fontWeight: 600 }}>
            ✖ Rejected: {approval.rejectionReason}
          </div>
        )}

        {/* Display attachments if expense */}
        {entityData && 'billAttachments' in entityData && Array.isArray(entityData.billAttachments) && entityData.billAttachments.length > 0 && (
          <div style={{ marginTop: '14px', borderTop: '1px solid var(--line)', paddingTop: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--mut)', marginBottom: '8px' }}>ATTACHMENTS</div>
            {entityData.billAttachments.map((att: { id: string; secureUrl: string; format: string | null }) => (
              <a
                key={att.id}
                href={att.secureUrl}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'block', textAlign: 'center', padding: '8px', borderRadius: '6px', background: '#e0f2fe', color: '#0369a1', textDecoration: 'none', fontSize: '12.5px', fontWeight: 700 }}
              >
                📎 Open Bill Attachment ({att.format || 'doc'})
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div style={{ marginBottom: '16px' }}>
        <ApprovalDetailActions
          approvalId={approval.id}
          status={approval.currentStatus}
          canApprove={canApprove}
          canPay={canPay}
        />
      </div>

      {/* Discussion & Timeline */}
      <div className="card" style={{ padding: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 800, margin: '0 0 12px' }}>💬 Notes ({approval.comments.length})</h3>
        {approval.comments.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--mut)', fontStyle: 'italic' }}>No discussion notes yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {approval.comments.map((c: { id: string; user: { name: string; role: string }; comment: string; createdAt: Date }) => (
              <div key={c.id} style={{ padding: '10px', borderRadius: '6px', background: 'var(--bg)', fontSize: '12.5px' }}>
                <b style={{ color: 'var(--ink)' }}>{c.user.name}: </b>
                <span>{c.comment}</span>
                <div style={{ fontSize: '10px', color: 'var(--mut)', marginTop: '4px' }}>{formatDateTime(c.createdAt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
