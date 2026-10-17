'use client'

import React, { useState, useTransition } from 'react'
import { updateApprovalStatusAction } from '@/actions/approvals'
import type { ApprovalStatus } from '@prisma/client'
import { Loader2, ChevronDown } from 'lucide-react'

interface ApprovalStatusDropdownProps {
  approvalId: string
  currentStatus: string
  disabled?: boolean
  size?: 'sm' | 'md'
  className?: string
}

const statusConfig: Record<string, { bg: string; text: string; border: string; label: string }> = {
  PENDING: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', label: 'Pending' },
  SUBMITTED: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', label: 'Pending' },
  PENDING_REVIEW: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', label: 'Pending' },
  APPROVED: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', label: 'Approved' },
  REJECTED: { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200', label: 'Rejected' },
  PAID: { bg: 'bg-orange-50', text: 'text-[#e85b0d]', border: 'border-orange-200', label: 'Disbursed / Paid' },
  CLOSED: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', label: 'Closed' },
  CANCELLED: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', label: 'Cancelled' },
}

export default function ApprovalStatusDropdown({
  approvalId,
  currentStatus,
  disabled = false,
  size = 'sm',
  className = '',
}: ApprovalStatusDropdownProps) {
  const [isPending, startTransition] = useTransition()
  const [selectedStatus, setSelectedStatus] = useState<string>(currentStatus)

  const activeConf = statusConfig[selectedStatus] || {
    bg: 'bg-slate-50',
    text: 'text-slate-700',
    border: 'border-slate-200',
    label: selectedStatus,
  }

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextStatus = e.target.value as ApprovalStatus
    if (nextStatus === selectedStatus) return

    let reason: string | undefined
    if (nextStatus === 'REJECTED') {
      const enteredReason = window.prompt('Enter rejection reason for site engineer:')
      if (enteredReason === null) {
        // User cancelled prompt
        return
      }
      if (enteredReason.trim().length < 2) {
        alert('Please provide a reason to reject.')
        return
      }
      reason = enteredReason.trim()
    }

    const prevStatus = selectedStatus
    setSelectedStatus(nextStatus)

    startTransition(async () => {
      try {
        await updateApprovalStatusAction(approvalId, nextStatus, reason)
      } catch (err: unknown) {
        setSelectedStatus(prevStatus)
        alert((err as Error)?.message || 'Failed to update approval status')
      }
    })
  }

  const isSmall = size === 'sm'

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <select
        value={selectedStatus}
        disabled={disabled || isPending}
        onChange={handleChange}
        aria-label="Update request status"
        className={`appearance-none cursor-pointer font-bold rounded-lg border transition-all pl-2.5 pr-7 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 disabled:opacity-60 disabled:cursor-not-allowed ${
          isSmall ? 'py-1 text-[11px] h-[28px]' : 'py-1.5 text-xs h-[34px]'
        } ${activeConf.bg} ${activeConf.text} ${activeConf.border} shadow-xs hover:brightness-95`}
      >
        <option value="PENDING" className="bg-white text-slate-800 font-semibold py-1">
          ⏳ Pending Review
        </option>
        <option value="APPROVED" className="bg-white text-emerald-800 font-semibold py-1">
          ✅ Approved
        </option>
        <option value="PAID" className="bg-white text-[#e85b0d] font-semibold py-1">
          💰 Disbursed / Paid
        </option>
        <option value="REJECTED" className="bg-white text-rose-800 font-semibold py-1">
          ❌ Rejected
        </option>
      </select>

      <div className="absolute right-2 pointer-events-none flex items-center text-current opacity-70">
        {isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-600" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
      </div>
    </div>
  )
}
