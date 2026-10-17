import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import Link from 'next/link'
import { getApprovalByIdAction } from '@/actions/approvals'
import ApprovalDetailActions from '@/components/approvals/ApprovalDetailActions'
import { hasPermission } from '@/lib/permissions'
import type { Role } from '@prisma/client'
import { ArrowLeft, Paperclip, MessageSquare, History, MapPin, Package, Wrench } from 'lucide-react'

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

        {/* Display Equipment Requisition Breakdown */}
        {(approval.approvalType === 'EQUIPMENT_REQUEST' || Boolean((approval.metadataJson as Record<string, unknown>)?.isEquipment)) ? (
          <div className="mt-5 border-t border-slate-200 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold m-0 uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-[#059669]" /> Tool & Equipment Requisition Details
              </h4>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                Machinery Allocation
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Tool / Equipment</div>
                  <div className="text-sm font-extrabold text-slate-900 mt-0.5">
                    {String((approval.metadataJson as Record<string, unknown>)?.toolName || approval.title)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Quantity</div>
                  <div className="text-sm font-extrabold text-[#059669] mt-0.5">
                    {String((approval.metadataJson as Record<string, unknown>)?.quantity || 1)} {String((approval.metadataJson as Record<string, unknown>)?.unit || 'Nos')}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Category</div>
                  <div className="text-sm font-semibold text-slate-800 mt-0.5">
                    {String((approval.metadataJson as Record<string, unknown>)?.category || 'General Equipment')}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Brand / Make</div>
                  <div className="text-sm font-semibold text-slate-800 mt-0.5">
                    {String((approval.metadataJson as Record<string, unknown>)?.brand || 'Any Standard')}
                  </div>
                </div>
              </div>

              {Boolean((approval.metadataJson as Record<string, unknown>)?.neededFrom || (approval.metadataJson as Record<string, unknown>)?.neededUntil) && (
                <div className="pt-2 border-t border-slate-200/60 flex items-center gap-4 flex-wrap text-slate-600">
                  {Boolean((approval.metadataJson as Record<string, unknown>)?.neededFrom) && (
                    <div>
                      <span className="font-bold text-slate-700">Needed From:</span> {String((approval.metadataJson as Record<string, unknown>).neededFrom)}
                    </div>
                  )}
                  {Boolean((approval.metadataJson as Record<string, unknown>)?.neededUntil) && (
                    <div>
                      <span className="font-bold text-slate-700">Duration:</span> {String((approval.metadataJson as Record<string, unknown>).neededUntil)}
                    </div>
                  )}
                </div>
              )}

              {Boolean((approval.metadataJson as Record<string, unknown>)?.purpose) && (
                <div className="pt-2 border-t border-slate-200/60 text-slate-600">
                  <span className="font-bold text-slate-700">Work Purpose:</span> {String((approval.metadataJson as Record<string, unknown>).purpose)}
                </div>
              )}
            </div>
          </div>
        ) : approval.entityType === 'MATERIAL_REQUEST' && (
          <div className="mt-5 border-t border-slate-200 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold m-0 uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-[#fc6e20]" /> Material Indent Specifications
              </h4>
              {approval.metadataJson && typeof approval.metadataJson === 'object' && 'workLocation' in approval.metadataJson && (approval.metadataJson as { workLocation?: string }).workLocation && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold">
                  <MapPin className="w-3 h-3" /> {(approval.metadataJson as { workLocation?: string }).workLocation}
                </span>
              )}
            </div>

            {/* Check for items list in metadata */}
            {approval.metadataJson && typeof approval.metadataJson === 'object' && 'items' in approval.metadataJson && Array.isArray((approval.metadataJson as { items?: unknown[] }).items) ? (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-2.5 px-3">Item / Material</th>
                      <th className="py-2.5 px-3">Specification / Grade</th>
                      <th className="py-2.5 px-3">Brand</th>
                      <th className="py-2.5 px-3 text-right">Indent Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {((approval.metadataJson as { items: Array<{ materialName: string; specification?: string; brand?: string; quantity: number; unit: string }> }).items).map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-bold text-slate-900">{item.materialName}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-700">{item.specification || 'Standard'}</td>
                        <td className="py-2.5 px-3 font-semibold text-sky-600">{item.brand || 'Any Approved'}</td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-[#ea580c]">{item.quantity} {item.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              entityData && 'description' in entityData && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center text-xs">
                  <div>
                    <div className="font-bold text-slate-900">{String(entityData.description)}</div>
                    {'workLocation' in entityData && entityData.workLocation && (
                      <div className="text-slate-500 mt-0.5">Location: {String(entityData.workLocation)}</div>
                    )}
                  </div>
                  <div className="font-extrabold text-[#ea580c] text-sm">
                    {'quantity' in entityData && String(entityData.quantity)} {'unit' in entityData && String(entityData.unit || 'Units')}
                  </div>
                </div>
              )
            )}
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
