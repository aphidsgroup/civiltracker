'use client'

import React, { useState, useTransition } from 'react'
import { approveApprovalAction, rejectApprovalAction, markApprovalPaidAction, addApprovalCommentAction } from '@/actions/approvals'

export default function ApprovalDetailActions({
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
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [commentText, setCommentText] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const isAwaitingApproval = ['PENDING', 'SUBMITTED', 'PENDING_REVIEW'].includes(status)
  const isApproved = status === 'APPROVED'

  const handleApprove = () => {
    if (!confirm('Are you sure you want to officially approve this request?')) return
    setErrorMsg('')
    startTransition(async () => {
      try {
        await approveApprovalAction(approvalId)
      } catch (err: unknown) {
        setErrorMsg((err as Error)?.message || 'Failed to approve')
      }
    })
  }

  const handleRejectSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (rejectReason.trim().length < 3) {
      setErrorMsg('Mandatory rejection reason required (min 3 chars)')
      return
    }
    setErrorMsg('')
    startTransition(async () => {
      try {
        await rejectApprovalAction(approvalId, rejectReason.trim())
        setRejectModalOpen(false)
      } catch (err: unknown) {
        setErrorMsg((err as Error)?.message || 'Failed to reject')
      }
    })
  }

  const handleMarkPaid = () => {
    if (!confirm('Confirm disbursement of funds for this request?')) return
    setErrorMsg('')
    startTransition(async () => {
      try {
        await markApprovalPaidAction(approvalId)
      } catch (err: unknown) {
        setErrorMsg((err as Error)?.message || 'Failed to mark paid')
      }
    })
  }

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return
    setErrorMsg('')
    startTransition(async () => {
      try {
        await addApprovalCommentAction(approvalId, commentText.trim())
        setCommentText('')
      } catch (err: unknown) {
        setErrorMsg((err as Error)?.message || 'Failed to add comment')
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {errorMsg && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#fde8e8', color: '#c81e1e', fontSize: '13px', fontWeight: 600 }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Action Buttons Bar */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {isAwaitingApproval && canApprove && (
          <>
            <button
              onClick={handleApprove}
              disabled={isPending}
              className="btn-primary"
              style={{ background: 'var(--green)', borderColor: 'var(--green)', padding: '10px 20px', fontSize: '14px', fontWeight: 800, color: '#fff', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
            >
              {isPending ? 'Processing...' : '✔ Approve Request'}
            </button>
            <button
              onClick={() => { setErrorMsg(''); setRejectModalOpen(true) }}
              disabled={isPending}
              style={{ background: '#fff', border: '1px solid var(--red)', color: 'var(--red)', padding: '10px 20px', fontSize: '14px', fontWeight: 800, borderRadius: '8px', cursor: 'pointer' }}
            >
              ✖ Reject Request
            </button>
          </>
        )}

        {isApproved && canPay && (
          <button
            onClick={handleMarkPaid}
            disabled={isPending}
            className="btn-primary"
            style={{ background: 'var(--p)', padding: '10px 20px', fontSize: '14px', fontWeight: 800, color: '#fff', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
          >
            {isPending ? 'Processing...' : '💰 Mark as Paid / Disbursed'}
          </button>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModalOpen && (
        <div style={{ padding: '16px', borderRadius: '10px', background: '#fff9f9', border: '1px solid #fecaca' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: '#991b1b' }}>Provide Rejection Rationale</h4>
          <form onSubmit={handleRejectSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain mandatory reason for rejecting this request..."
              rows={3}
              required
              minLength={3}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #fca5a5', fontSize: '13px', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                style={{ padding: '6px 12px', background: 'transparent', border: 'none', color: '#666', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || rejectReason.trim().length < 3}
                style={{ padding: '6px 16px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}
              >
                {isPending ? 'Submitting...' : 'Confirm Rejection'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Comment Box */}
      <div className="ct-card" style={{ padding: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 800, margin: '0 0 10px' }}>💬 Add Internal Note</h3>
        <form onSubmit={handleAddComment} style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Write a comment or query for the site team..."
            rows={2}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '13px', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={isPending || !commentText.trim()}
              className="btn-secondary"
              style={{ padding: '8px 16px', fontSize: '12.5px', fontWeight: 700, borderRadius: '6px', border: '1px solid var(--line)', background: '#fff', cursor: 'pointer' }}
            >
              Post Note
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
