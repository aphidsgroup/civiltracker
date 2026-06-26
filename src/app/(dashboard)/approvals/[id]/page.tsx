import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import Link from 'next/link'
import { getApprovalByIdAction } from '@/actions/approvals'
import ApprovalDetailActions from '@/components/approvals/ApprovalDetailActions'
import { hasPermission } from '@/lib/permissions'
import type { Role } from '@prisma/client'
import { ArrowLeft, Paperclip, MessageSquare, History } from 'lucide-react'

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

  const statusColors: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-800',
    SUBMITTED: 'bg-amber-100 text-amber-800',
    PENDING_REVIEW: 'bg-amber-100 text-amber-800',
    APPROVED: 'bg-emerald-100 text-emerald-800',
    PAID: 'bg-blue-100 text-blue-800',
    REJECTED: 'bg-red-100 text-red-800',
    DRAFT: 'bg-slate-100 text-slate-700',
  }

  const userRole = session.user.role as Role
  const canApprove = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'PROJECT_MANAGER', 'ACCOUNTANT', 'PURCHASE_MANAGER'].includes(userRole)
  const canPay = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ACCOUNTANT'].includes(userRole) || hasPermission(userRole, 'salary.markPaid') || hasPermission(userRole, 'payments.manage')

  return (
    <div className="flex flex-col gap-5.5 max-w-[900px] mx-auto">
      <div>
        <Link href="/approvals" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 no-underline text-xs font-bold transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Approval Center
        </Link>
        <div className="flex justify-between items-start mt-2.5 flex-wrap gap-3">
          <div>
            <div className="flex gap-2 items-center mb-1.5">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusColors[approval.currentStatus] ?? 'bg-slate-100 text-slate-700'}`}>
                {approval.currentStatus}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                {approval.entityType}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${approval.priority === 'URGENT' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'}`}>
                {approval.priority}
              </span>
            </div>
            <h1 className="text-2xl font-extrabold m-0 mb-1 tracking-tight text-slate-900">
              {approval.title}
            </h1>
            <p className="text-slate-500 text-[13.5px] m-0">
              Requested by {approval.requestedBy.name} ({approval.requestedBy.role}) · {approval.site?.name || 'Office Wide'}
            </p>
          </div>

          <div className="text-right">
            <div className="text-[11px] text-slate-500 font-bold uppercase">Amount</div>
            <div className="text-[28px] font-extrabold text-slate-900">
              {formatCurrency(approval.amount ? Number(approval.amount) : 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Description / Metadata Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-extrabold m-0 mb-2.5 text-slate-800">Request Rationale & Context</h3>
        <p className="text-sm leading-relaxed text-slate-900 m-0 whitespace-pre-wrap">
          {approval.description || 'No additional text description provided.'}
        </p>

        {approval.rejectionReason && (
          <div className="mt-4 p-3 sm:px-4 sm:py-3 rounded-lg bg-red-50 border-l-4 border-red-600">
            <div className="text-xs font-extrabold text-red-800 mb-1">REJECTION REASON</div>
            <div className="text-sm text-red-900 font-semibold">{approval.rejectionReason}</div>
          </div>
        )}

        {/* Display attachments if expense */}
        {entityData && 'billAttachments' in entityData && Array.isArray(entityData.billAttachments) && entityData.billAttachments.length > 0 && (
          <div className="mt-5 border-t border-slate-200 pt-4">
            <h4 className="text-xs font-extrabold m-0 mb-2.5 text-slate-500">Attached Bill / Document</h4>
            <div className="flex gap-2.5 flex-wrap">
              {entityData.billAttachments.map((att: { id: string; secureUrl: string; format: string | null }) => (
                <a
                  key={att.id}
                  href={att.secureUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-slate-50 border border-slate-200 no-underline text-blue-600 hover:bg-slate-100 text-xs font-bold transition-colors"
                >
                  <Paperclip className="w-3.5 h-3.5" /> View Attachment ({att.format || 'doc'})
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
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-extrabold m-0 mb-4 text-slate-800 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-600" /> Internal Discussion ({approval.comments.length})
        </h3>
        {approval.comments.length === 0 ? (
          <div className="text-slate-500 text-xs italic">No notes posted yet. Use the box above to start discussion.</div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {approval.comments.map((c: { id: string; user: { name: string; role: string }; comment: string; createdAt: Date }) => (
              <div key={c.id} className="p-3 sm:px-3.5 sm:py-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex justify-between mb-1.5">
                  <span className="text-xs font-extrabold text-slate-900">{c.user.name} ({c.user.role})</span>
                  <span className="text-[11px] text-slate-500 font-semibold">{formatDateTime(c.createdAt)}</span>
                </div>
                <div className="text-[13.5px] text-slate-800 leading-normal">{c.comment}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Timeline Trail */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-extrabold m-0 mb-4 text-slate-800 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500" /> Audit Timeline
        </h3>
        <div className="flex flex-col gap-3 border-l-2 border-slate-200 pl-4 ml-1.5">
          {approval.timelines.map((t: { id: string; action: string; note: string | null; actor: { name: string; role: string }; createdAt: Date }) => (
            <div key={t.id} className="relative">
              <div className="absolute -left-[21px] top-0.5 w-2 h-2 rounded-full bg-blue-600" />
              <div className="flex justify-between">
                <span className="text-xs font-extrabold text-slate-900">{t.action}</span>
                <span className="text-[11px] text-slate-500 font-semibold">{formatDateTime(t.createdAt)}</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                By {t.actor.name} ({t.actor.role}) {t.note && `— "${t.note}"`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
