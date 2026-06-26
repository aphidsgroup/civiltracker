import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import Link from 'next/link'
import { getApprovalByIdAction } from '@/actions/approvals'
import ApprovalDetailActions from '@/components/approvals/ApprovalDetailActions'
import { hasPermission } from '@/lib/permissions'
import type { Role } from '@prisma/client'
import { ArrowLeft, Paperclip, MessageSquare, XCircle } from 'lucide-react'

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

  const statusBadge: Record<string, string> = {
    PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
    SUBMITTED: 'bg-amber-50 text-amber-700 border-amber-200',
    PENDING_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
    APPROVED: 'bg-green-50 text-green-700 border-green-200',
    PAID: 'bg-blue-50 text-blue-700 border-blue-200',
    REJECTED: 'bg-red-50 text-red-700 border-red-200',
    DRAFT: 'bg-gray-50 text-gray-600 border-gray-200',
  }

  const userRole = session.user.role as Role
  const canApprove = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'PROJECT_MANAGER', 'ACCOUNTANT', 'PURCHASE_MANAGER'].includes(userRole)
  const canPay = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ACCOUNTANT'].includes(userRole) || hasPermission(userRole, 'salary.markPaid') || hasPermission(userRole, 'payments.manage')

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto bg-gray-50 min-h-screen space-y-4">
      <div>
        <Link href="/mobile/approvals" className="inline-flex items-center text-gray-500 hover:text-gray-900 text-xs font-bold transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Approvals List
        </Link>
      </div>

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex gap-1.5 items-center mb-3 flex-wrap">
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider ${statusBadge[approval.currentStatus] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
            {approval.currentStatus}
          </span>
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border border-gray-200 bg-gray-50 text-gray-600 uppercase tracking-wider">
            {approval.entityType}
          </span>
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider ${
            approval.priority === 'URGENT' 
              ? 'bg-red-50 text-red-700 border-red-200 animate-pulse' 
              : 'bg-gray-50 text-gray-600 border-gray-200'
          }`}>
            {approval.priority}
          </span>
        </div>

        <h1 className="text-lg font-bold text-gray-900 mb-1">
          {approval.title}
        </h1>
        <div className="text-xs text-gray-500 font-medium mb-4">
          By {approval.requestedBy.name} · {approval.site?.name || 'Office'}
        </div>

        <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-100 flex justify-between items-center">
          <span className="text-xs text-gray-500 font-semibold">Total Value</span>
          <span className="text-xl font-extrabold text-amber-600">
            {formatCurrency(approval.amount ? Number(approval.amount) : 0)}
          </span>
        </div>

        {approval.description && (
          <div className="mt-4 text-sm leading-relaxed text-gray-700">
            <span className="text-[11px] font-bold tracking-wider uppercase text-gray-400 block mb-1">DETAILS</span>
            {approval.description}
          </div>
        )}

        {approval.rejectionReason && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-100 text-red-800 text-xs font-semibold flex items-start gap-2">
            <XCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <span>Rejected: {approval.rejectionReason}</span>
          </div>
        )}

        {/* Display attachments if expense */}
        {entityData && 'billAttachments' in entityData && Array.isArray(entityData.billAttachments) && entityData.billAttachments.length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <div className="text-[11px] font-bold tracking-wider uppercase text-gray-400 mb-2">ATTACHMENTS</div>
            <div className="space-y-2">
              {entityData.billAttachments.map((att: { id: string; secureUrl: string; format: string | null }) => (
                <a
                  key={att.id}
                  href={att.secureUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-colors"
                >
                  <Paperclip className="w-4 h-4" />
                  Open Bill Attachment ({att.format || 'doc'})
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div>
        <ApprovalDetailActions
          approvalId={approval.id}
          status={approval.currentStatus}
          canApprove={canApprove}
          canPay={canPay}
        />
      </div>

      {/* Discussion & Timeline */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold text-gray-900">Notes ({approval.comments.length})</h3>
        </div>
        {approval.comments.length === 0 ? (
          <div className="text-xs text-gray-400 italic py-2">No discussion notes yet.</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {approval.comments.map((c: { id: string; user: { name: string; role: string }; comment: string; createdAt: Date }) => (
              <div key={c.id} className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-xs">
                <span className="font-bold text-gray-900">{c.user.name}: </span>
                <span className="text-gray-700">{c.comment}</span>
                <div className="text-[10px] text-gray-400 mt-1.5">{formatDateTime(c.createdAt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
