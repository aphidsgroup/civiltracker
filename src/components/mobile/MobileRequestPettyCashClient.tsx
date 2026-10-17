'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Wallet, Clock, Calendar, CheckCircle2, AlertCircle, Loader2, IndianRupee } from 'lucide-react'
import { createPettyCashRequestAction } from '@/actions/requests'

interface SiteOption {
  id: string
  name: string
}

const COMMON_PURPOSES = [
  'Site Cleaning Labour',
  'Hardware & Fasteners',
  'Diesel for Generator',
  'Plumbing / Pipe emergency',
  'Unloading / Coolie charges',
  'Safety Helmets / Gloves',
  'Masonry Snacks / Tea',
  'Site Transport & Auto',
]

const QUICK_AMOUNTS = [1000, 2000, 5000, 10000, 15000, 20000]

export default function MobileRequestPettyCashClient({
  sites,
  defaultSiteId,
  defaultSiteName,
}: {
  sites: SiteOption[]
  defaultSiteId?: string
  defaultSiteName: string
}) {
  const router = useRouter()
  const initialSiteId = defaultSiteId || (sites[0]?.id ?? '')

  const [siteId, setSiteId] = useState(initialSiteId)
  const [amount, setAmount] = useState('')
  const [purpose, setPurpose] = useState('')
  const [urgency, setUrgency] = useState<'Normal' | 'High' | 'Urgent'>('Normal')
  const [neededBy, setNeededBy] = useState('')
  const [notes, setNotes] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const selectedSiteId = siteId || sites[0]?.id
    if (!selectedSiteId) {
      setError('Please select a construction site.')
      return
    }

    const numAmt = Number(amount.replace(/,/g, ''))
    if (!amount || isNaN(numAmt) || numAmt <= 0) {
      setError('Please enter a valid cash amount in ₹.')
      return
    }

    if (!purpose.trim()) {
      setError('Please specify the purpose of the petty cash request.')
      return
    }

    setLoading(true)
    try {
      const res = await createPettyCashRequestAction({
        siteId: selectedSiteId,
        amount: numAmt,
        purpose: purpose.trim(),
        urgency,
        neededBy: neededBy || undefined,
        notes: notes.trim() || undefined,
      })

      if (res?.success) {
        setSuccess(true)
        setTimeout(() => {
          router.push(`/mobile/home?siteId=${selectedSiteId}`)
          router.refresh()
        }, 1200)
      }
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to submit petty cash request.')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4 animate-in zoom-in-75">
          <CheckCircle2 size={36} strokeWidth={2.5} />
        </div>
        <h2 className="text-xl font-black text-slate-900 mb-1">Petty Cash Requested!</h2>
        <p className="text-sm text-slate-500 max-w-xs mb-6">
          Your petty cash requisition of ₹{Number(amount).toLocaleString('en-IN')} has been submitted to Company Admin.
        </p>
        <div className="flex items-center gap-2 text-xs font-bold text-[#fc6e20]">
          <Loader2 size={16} className="animate-spin" />
          <span>Redirecting to home...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 select-none">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/mobile/home"
            className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center active:scale-95 no-underline transition-transform"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-[17px] font-black text-slate-900 m-0 tracking-tight">Request Petty Cash</h1>
            <p className="text-[11px] font-semibold text-slate-400 m-0">Site cash funds requisition</p>
          </div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
          <Wallet size={20} />
        </div>
      </header>

      <form onSubmit={handleSubmit} className="p-4 space-y-4 max-w-[480px] mx-auto">
        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2.5 text-rose-700 text-xs font-bold animate-in fade-in">
            <AlertCircle size={18} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Site Selector */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-2">
          <label className="text-[12px] font-extrabold uppercase tracking-wider text-slate-500">
            Project Site
          </label>
          {sites.length > 1 ? (
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-[#fc6e20]"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-sm font-extrabold text-slate-800 py-1">
              {sites[0]?.name || defaultSiteName || 'Active Site'}
            </div>
          )}
        </div>

        {/* Amount Input & Quick Chips */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-[12px] font-extrabold uppercase tracking-wider text-slate-500">
              Amount Required (₹) *
            </label>
            <span className="text-[10.5px] font-bold text-slate-400">Required</span>
          </div>

          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-extrabold text-lg">
              ₹
            </span>
            <input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              required
              className="w-full h-14 pl-9 pr-3.5 rounded-xl border border-slate-200 text-2xl font-black text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-[#fc6e20] focus:ring-2 focus:ring-[#fc6e20]/15 tabular"
            />
          </div>

          {/* Quick amount chips */}
          <div className="flex flex-wrap gap-2 pt-1">
            {QUICK_AMOUNTS.map((amt) => (
              <button
                type="button"
                key={amt}
                onClick={() => setAmount(String(amt))}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  amount === String(amt)
                    ? 'bg-[#fc6e20] text-white border-[#fc6e20] shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                ₹{amt.toLocaleString('en-IN')}
              </button>
            ))}
          </div>
        </div>

        {/* Purpose / Description */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-[12px] font-extrabold uppercase tracking-wider text-slate-500">
              Purpose / Reason *
            </label>
            <span className="text-[10.5px] font-bold text-slate-400">Required</span>
          </div>

          <input
            type="text"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Site cleaning labour cash, Emergency plumbing"
            required
            className="w-full h-12 px-3.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#fc6e20] focus:ring-2 focus:ring-[#fc6e20]/15"
          />

          {/* Quick purpose chips */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">Common reasons</span>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_PURPOSES.map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setPurpose(p)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                    purpose === p
                      ? 'bg-[#fc6e20] text-white border-[#fc6e20]'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Urgency */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-2">
          <label className="text-[12px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Clock size={14} />
            <span>Urgency Level</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'Normal', label: '🟢 Normal', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
              { id: 'High', label: '🟡 High', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
              { id: 'Urgent', label: '🔴 Urgent', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
            ].map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => setUrgency(p.id as 'Normal' | 'High' | 'Urgent')}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition-all text-center ${
                  urgency === p.id
                    ? `${p.bg} ring-2 ring-current font-black shadow-xs`
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Needed By Date */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-2">
          <label className="text-[12px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Calendar size={14} />
            <span>Required By Date (Optional)</span>
          </label>
          <input
            type="date"
            value={neededBy}
            onChange={(e) => setNeededBy(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-[#fc6e20]"
          />
        </div>

        {/* Notes */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-2">
          <label className="text-[12px] font-extrabold uppercase tracking-wider text-slate-500">
            Justification & Details
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="e.g. Immediate cash required to pay 5 daily wage helpers for manual trench clearance."
            className="w-full p-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#fc6e20] focus:ring-2 focus:ring-[#fc6e20]/15 resize-none"
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full h-13 rounded-2xl bg-gradient-to-r from-[#ea580c] to-[#fc6e20] text-white font-extrabold text-[15px] shadow-lg shadow-[#fc6e20]/30 active:scale-98 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer border-none"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Submitting Request...</span>
            </>
          ) : (
            <>
              <IndianRupee size={18} />
              <span>Submit Petty Cash Request</span>
            </>
          )}
        </button>
      </form>
    </div>
  )
}
