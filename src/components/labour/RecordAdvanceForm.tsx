'use client'

import { useState } from 'react'
import { recordLabourAdvanceAction } from '@/actions/mobile-labour'
import { labourAdvancePayload } from '@/lib/attendance-payloads'
import { Wallet, X } from 'lucide-react'

/**
 * Pays a worker an advance today, separately from marking the roll. Only rendered for a
 * user with payment access; the server still checks `payments.manage`, the site binding,
 * today's attendance row and the balance the payer saw.
 */
export default function RecordAdvanceForm({
  worker,
  currentAdvance,
  onRecorded,
  onCancel,
}: {
  worker: { id: string; name: string; siteId: string }
  currentAdvance: number
  onRecorded: (advance: number) => void
  onCancel: () => void
}) {
  const [amount, setAmount] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const built = labourAdvancePayload({
      labourId: worker.id,
      siteId: worker.siteId,
      amount,
      currentAdvance,
      confirmation,
      reason,
    })
    if (!built.ok) {
      setError(built.error)
      return
    }
    setSaving(true)
    try {
      const res = await recordLabourAdvanceAction(built.payload)
      if (res.success) onRecorded(Number(res.advance) || 0)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record advance')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2.5 text-slate-900">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-black uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
          <Wallet size={13} /><span>Pay advance to {worker.name}</span>
        </div>
        <button type="button" onClick={onCancel} aria-label="Cancel advance" className="w-6 h-6 rounded-full bg-white text-slate-500 flex items-center justify-center border border-amber-200 cursor-pointer p-0">
          <X size={12} />
        </button>
      </div>
      <div className="text-[10px] font-bold text-amber-700">Already paid today: ₹{currentAdvance.toLocaleString('en-IN')}</div>
      <div>
        <label className="text-[11px] font-bold text-slate-600 block mb-1">Amount (₹)</label>
        <input
          type="text" inputMode="decimal" required placeholder="e.g. 500"
          value={amount} onChange={e => setAmount(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-white border border-amber-300 text-sm font-mono font-black focus:outline-none focus:ring-2 focus:ring-amber-500 box-border"
        />
      </div>
      <div>
        <label className="text-[11px] font-bold text-slate-600 block mb-1">Type &quot;{worker.name}&quot; to confirm</label>
        <input
          type="text" required autoComplete="off"
          value={confirmation} onChange={e => setConfirmation(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-white border border-amber-300 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 box-border"
        />
      </div>
      <div>
        <label className="text-[11px] font-bold text-slate-600 block mb-1">Reason</label>
        <input
          type="text" required maxLength={500} placeholder="e.g. Weekly food allowance"
          value={reason} onChange={e => setReason(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-white border border-amber-300 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 box-border"
        />
      </div>
      {error && <div role="alert" className="text-[11px] font-bold text-rose-600">{error}</div>}
      <button type="submit" disabled={saving} className="w-full py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-black text-xs rounded-lg border-none cursor-pointer">
        {saving ? 'Recording...' : 'Record Advance Payment'}
      </button>
    </form>
  )
}
