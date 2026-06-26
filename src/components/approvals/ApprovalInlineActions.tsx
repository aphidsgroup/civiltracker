'use client'

import React, { useTransition } from 'react'
import { approveApprovalAction, rejectApprovalAction, markApprovalPaidAction } from '@/actions/approvals'
import { CheckCircle2, XCircle, Banknote } from 'lucide-react'

export default function ApprovalInlineActions({
  approvalId,
  status,
  canApprove,
  canPay,
}: {
  approvalId: string
  status: string
  canApprove: boolean
  canPay: boolean
}) {
  const [isPending, startTransition] = useTransition()

  const isAwaitingApproval = ['PENDING', 'SUBMITTED', 'PENDING_REVIEW'].includes(status)
  const isApproved = status === 'APPROVED'

  const handleApprove = () => {
    if (!confirm('Quick Approve: Are you sure you want to approve this request?')) return
    startTransition(async () => {
      try {
        await approveApprovalAction(approvalId)
      } catch (err: unknown) {
        alert((err as Error)?.message || 'Failed to approve')
      }
    })
  }

  const handleReject = () => {
    const reason = prompt('Please enter a mandatory reason for rejecting this request:')
    if (reason === null) return // cancelled
    if (reason.trim().length < 3) {
      alert('A valid reason (min 3 chars) is required to reject.')
      return
    }
    startTransition(async () => {
      try {
        await rejectApprovalAction(approvalId, reason.trim())
      } catch (err: unknown) {
        alert((err as Error)?.message || 'Failed to reject')
      }
    })
  }

  const handleMarkPaid = () => {
    if (!confirm('Quick Pay: Confirm disbursement of funds?')) return
    startTransition(async () => {
      try {
        await markApprovalPaidAction(approvalId)
      } catch (err: unknown) {
        alert((err as Error)?.message || 'Failed to mark paid')
      }
    })
  }

  return (
    <div className="flex items-center gap-1.5 opacity-90 hover:opacity-100 transition-opacity">
      {isAwaitingApproval && canApprove && (
        <>
          <button
            onClick={handleApprove}
            disabled={isPending}
            title="Approve"
            className="flex items-center justify-center p-1.5 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleReject}
            disabled={isPending}
            title="Reject"
            className="flex items-center justify-center p-1.5 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors disabled:opacity-50"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </>
      )}

      {isApproved && canPay && (
        <button
          onClick={handleMarkPaid}
          disabled={isPending}
          title="Mark as Paid"
          className="flex items-center justify-center p-1.5 text-[#fc6e20] bg-[#fff7ed] hover:bg-[#fff7ed] rounded-md transition-colors disabled:opacity-50"
        >
          <Banknote className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
