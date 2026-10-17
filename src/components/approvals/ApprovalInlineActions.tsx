'use client'

import React from 'react'
import ApprovalStatusDropdown from './ApprovalStatusDropdown'

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
  const isAuthorized = canApprove || canPay

  if (!isAuthorized) {
    return null
  }

  return (
    <div className="flex items-center gap-1.5">
      <ApprovalStatusDropdown
        approvalId={approvalId}
        currentStatus={status}
        size="sm"
      />
    </div>
  )
}
