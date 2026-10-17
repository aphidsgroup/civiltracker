'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Package, Clock, Calendar, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { createMaterialRequestAction } from '@/actions/requests'

interface SiteOption {
  id: string
  name: string
}

const COMMON_MATERIALS = [
  'Cement (53 Grade)',
  'TMT Steel (16mm)',
  'TMT Steel (12mm)',
  'River Sand (M-Sand)',
  '20mm Aggregate',
  'Red Clay Bricks',
  'AAC Blocks',
  'Binding Wire',
  'PVC Pipes (4 inch)',
  'Ready Mix Concrete (M25)',
]

const COMMON_UNITS = [
  'Bags',
  'Tons',
  'Kg',
  'Nos',
  'Sq.ft',
  'Cu.m',
  'Loads',
  'Truckloads',
  'Bundles',
  'Litres',
  'Meters',
]

export default function MobileRequestMaterialClient({
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
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('Bags')
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

    if (!description.trim()) {
      setError('Please specify the material name or description.')
      return
    }

    const numQty = Number(quantity)
    if (!quantity || isNaN(numQty) || numQty <= 0) {
      setError('Please enter a valid positive quantity.')
      return
    }

    setLoading(true)
    try {
      const res = await createMaterialRequestAction({
        siteId: selectedSiteId,
        description: description.trim(),
        quantity: numQty,
        unit,
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
      setError((err as Error)?.message || 'Failed to submit material request.')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4 animate-in zoom-in-75">
          <CheckCircle2 size={36} strokeWidth={2.5} />
        </div>
        <h2 className="text-xl font-black text-slate-900 mb-1">Request Submitted!</h2>
        <p className="text-sm text-slate-500 max-w-xs mb-6">
          Your material request has been sent to Company Admin for review and approval.
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
            <h1 className="text-[17px] font-black text-slate-900 m-0 tracking-tight">Request Materials</h1>
            <p className="text-[11px] font-semibold text-slate-400 m-0">Send requisition to Admin</p>
          </div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
          <Package size={20} />
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

        {/* Material Description & Quick Chips */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-[12px] font-extrabold uppercase tracking-wider text-slate-500">
              Material / Item Name *
            </label>
            <span className="text-[10.5px] font-bold text-slate-400">Required</span>
          </div>

          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Ultratech 53G Cement, 16mm TMT Bars"
            required
            className="w-full h-12 px-3.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#fc6e20] focus:ring-2 focus:ring-[#fc6e20]/15"
          />

          {/* Quick chips */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">Quick select</span>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_MATERIALS.map((mat) => (
                <button
                  type="button"
                  key={mat}
                  onClick={() => setDescription(mat)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                    description === mat
                      ? 'bg-[#fc6e20] text-white border-[#fc6e20]'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {mat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quantity & Unit */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[12px] font-extrabold uppercase tracking-wider text-slate-500">
              Quantity *
            </label>
            <input
              type="number"
              min="0.1"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 50"
              required
              className="w-full h-12 px-3.5 rounded-xl border border-slate-200 text-sm font-extrabold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#fc6e20] focus:ring-2 focus:ring-[#fc6e20]/15"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-extrabold uppercase tracking-wider text-slate-500">
              Unit
            </label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full h-12 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-[#fc6e20]"
            >
              {COMMON_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Urgency Priority */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-2">
          <label className="text-[12px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Clock size={14} />
            <span>Urgency Level</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'Normal', label: '🟢 Normal', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 active:bg-emerald-100' },
              { id: 'High', label: '🟡 High', bg: 'bg-amber-50 text-amber-700 border-amber-200 active:bg-amber-100' },
              { id: 'Urgent', label: '🔴 Urgent', bg: 'bg-rose-50 text-rose-700 border-rose-200 active:bg-rose-100' },
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
            <span>Needed by Date (Optional)</span>
          </label>
          <input
            type="date"
            value={neededBy}
            onChange={(e) => setNeededBy(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-[#fc6e20]"
          />
        </div>

        {/* Additional Notes & Instructions */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-2">
          <label className="text-[12px] font-extrabold uppercase tracking-wider text-slate-500">
            Notes / Delivery Location on Site
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="e.g. Unload at Block B entrance. For slab casting on Friday."
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
              <Package size={18} />
              <span>Submit Material Request</span>
            </>
          )}
        </button>
      </form>
    </div>
  )
}
