'use client'

import React, { useState, useTransition } from 'react'
import { updatePurchaseRequestStatusAction } from '@/actions/requests'
import type { PurchaseRequestStatus } from '@prisma/client'
import { Loader2, ChevronDown } from 'lucide-react'

interface Props {
  requestId: string
  currentStatus: PurchaseRequestStatus
  disabled?: boolean
  className?: string
}

const statusConfig: Record<string, { bg: string; text: string; border: string; label: string }> = {
  PENDING: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', label: 'Pending Review' },
  PM_APPROVED: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', label: 'Approved' },
  PO_CREATED: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', label: 'PO Created' },
  DELIVERED: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-300', label: 'Delivered' },
  CANCELLED: { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200', label: 'Rejected / Cancelled' },
}

export default function PurchaseRequestStatusDropdown({
  requestId,
  currentStatus,
  disabled = false,
  className = '',
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [selectedStatus, setSelectedStatus] = useState<PurchaseRequestStatus>(currentStatus)

  const activeConf = statusConfig[selectedStatus] || {
    bg: 'bg-slate-50',
    text: 'text-slate-700',
    border: 'border-slate-200',
    label: selectedStatus,
  }

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextStatus = e.target.value as PurchaseRequestStatus
    if (nextStatus === selectedStatus) return

    let reason: string | undefined
    if (nextStatus === 'CANCELLED') {
      const enteredReason = window.prompt('Enter reason for rejecting / cancelling this material indent:')
      if (enteredReason === null) {
        return
      }
      if (enteredReason.trim().length < 2) {
        alert('Please specify a valid reason.')
        return
      }
      reason = enteredReason.trim()
    }

    const prevStatus = selectedStatus
    setSelectedStatus(nextStatus)

    startTransition(async () => {
      try {
        await updatePurchaseRequestStatusAction(requestId, nextStatus, reason)
      } catch (err: unknown) {
        setSelectedStatus(prevStatus)
        alert((err as Error)?.message || 'Failed to update request status')
      }
    })
  }

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <select
        value={selectedStatus}
        disabled={disabled || isPending}
        onChange={handleChange}
        aria-label="Update indent status"
        className={`appearance-none cursor-pointer font-bold rounded-lg border transition-all pl-2.5 pr-7 py-1 text-[11px] h-[30px] focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 disabled:opacity-60 disabled:cursor-not-allowed ${activeConf.bg} ${activeConf.text} ${activeConf.border} shadow-xs hover:brightness-95`}
      >
        <option value="PENDING" className="bg-white text-slate-800 font-semibold py-1">
          ⏳ Pending Review
        </option>
        <option value="PM_APPROVED" className="bg-white text-emerald-800 font-semibold py-1">
          ✅ Approved
        </option>
        <option value="PO_CREATED" className="bg-white text-blue-800 font-semibold py-1">
          📦 PO Created
        </option>
        <option value="DELIVERED" className="bg-white text-emerald-800 font-semibold py-1">
          🚚 Delivered
        </option>
        <option value="CANCELLED" className="bg-white text-rose-800 font-semibold py-1">
          ❌ Rejected / Cancelled
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
