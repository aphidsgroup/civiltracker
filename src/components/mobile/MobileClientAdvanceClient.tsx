'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, IndianRupee, Calendar, FileText, Building2, CheckCircle, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { createClientAdvance } from '@/actions/client-advance'

interface Site {
  id: string
  name: string
  location: string
}

interface Props {
  sites: Site[]
  defaultSiteId?: string
}

export default function MobileClientAdvanceClient({ sites, defaultSiteId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [changeSite, setChangeSite] = useState(false)

  const now = new Date()
  const localDatetime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)

  const matchedSite = sites.find(s => s.id === defaultSiteId)
  const initialSiteId = matchedSite ? matchedSite.id : (sites[0]?.id ?? '')

  const [form, setForm] = useState({
    siteId: initialSiteId,
    amount: '',
    purpose: '',
    receivedAt: localDatetime,
  })

  async function handleSubmit() {
    setError(null)
    if (!form.siteId) { setError('Please select a site.'); return }
    if (!form.amount || Number(form.amount) <= 0) { setError('Enter a valid amount.'); return }
    if (!form.purpose.trim()) { setError('Please enter the purpose / notes.'); return }

    setLoading(true)
    try {
      await createClientAdvance({
        siteId: form.siteId,
        amount: Number(form.amount),
        purpose: form.purpose,
        receivedAt: form.receivedAt,
      })
      setSuccess(true)
      setTimeout(() => router.push('/mobile/home'), 1800)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 p-8">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle size={40} className="text-emerald-600" strokeWidth={1.8} />
        </div>
        <div className="text-xl font-black text-[#1e293b] text-center">Advance Recorded!</div>
        <div className="text-sm text-slate-500 font-medium text-center">
          ₹{Number(form.amount).toLocaleString('en-IN')} advance has been saved successfully.
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white pb-32 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-4 border-b border-slate-100">
        <Link
          href="/mobile/home"
          className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center active:scale-95 transition-transform"
        >
          <ArrowLeft size={16} className="text-slate-600" />
        </Link>
        <div>
          <h1 className="text-lg font-black text-[#1e293b] tracking-tight">Client Advance</h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">Record advance payment received from client</p>
        </div>
      </div>

      <div className="px-5 pt-6 space-y-5">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {/* Site Selection */}
        <div>
          <div className="flex items-center justify-between mb-2 px-0.5">
            <label className="text-xs font-black text-[#647387] tracking-tight flex items-center gap-1.5">
              <Building2 size={12} />
              Project / Site
            </label>
            {matchedSite && !changeSite && (
              <button
                type="button"
                onClick={() => setChangeSite(true)}
                className="text-[11px] font-bold text-blue-600 hover:underline focus:outline-none"
              >
                Change project
              </button>
            )}
          </div>
          {sites.length === 0 ? (
            <div className="text-xs text-slate-400 bg-slate-50 rounded-xl px-4 py-3 border border-slate-200">
              No active sites found. Contact your admin.
            </div>
          ) : matchedSite && !changeSite ? (
            <div className="w-full px-4 py-3 rounded-xl bg-blue-50/70 border border-blue-200 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />
                <span className="text-sm font-black text-blue-950 truncate">{matchedSite.name}</span>
                <span className="text-xs font-semibold text-blue-700/80 truncate">({matchedSite.location})</span>
              </div>
            </div>
          ) : (
            <select
              value={form.siteId}
              onChange={e => setForm(p => ({ ...p, siteId: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-white border border-[#cbd5e1] text-sm font-bold text-[#1e293b] focus:outline-none focus:border-[#1e40af] shadow-sm appearance-none cursor-pointer"
            >
              {sites.map(s => (
                <option key={s.id} value={s.id}>{s.name} — {s.location}</option>
              ))}
            </select>
          )}
        </div>

        {/* Amount */}
        <div>
          <label className="text-xs font-black text-[#647387] tracking-tight block mb-2 px-0.5 flex items-center gap-1.5">
            <IndianRupee size={12} />
            Advance Amount <span className="text-[#dc2626] ml-0.5">*</span>
          </label>
          <div className="relative flex items-center bg-white rounded-2xl border-2 border-[#1e40af] shadow-sm px-4 py-1 focus-within:ring-4 focus-within:ring-blue-100 transition-all">
            <span className="text-2xl font-black text-[#1e293b] select-none mr-2">₹</span>
            <input
              type="number"
              inputMode="numeric"
              placeholder="0"
              min={1}
              value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              className="w-full py-2.5 bg-transparent border-none text-2xl font-black text-[#1e293b] placeholder:text-[#cbd5e1] focus:outline-none"
            />
          </div>
        </div>

        {/* Date & Time */}
        <div>
          <label className="text-xs font-black text-[#647387] tracking-tight block mb-2 px-0.5 flex items-center gap-1.5">
            <Calendar size={12} />
            Date &amp; Time Received <span className="text-[#dc2626] ml-0.5">*</span>
          </label>
          <input
            type="datetime-local"
            value={form.receivedAt}
            onChange={e => setForm(p => ({ ...p, receivedAt: e.target.value }))}
            className="w-full px-4 py-3 rounded-xl bg-white border border-[#cbd5e1] text-sm font-bold text-[#1e293b] focus:outline-none focus:border-[#1e40af] shadow-sm"
          />
        </div>

        {/* Purpose / Notes */}
        <div>
          <label className="text-xs font-black text-[#647387] tracking-tight block mb-2 px-0.5 flex items-center gap-1.5">
            <FileText size={12} />
            Purpose / Notes <span className="text-[#dc2626] ml-0.5">*</span>
          </label>
          <textarea
            placeholder="e.g. First advance payment for foundation work, paid via NEFT."
            value={form.purpose}
            onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))}
            rows={4}
            className="w-full px-4 py-3 rounded-2xl bg-white border border-[#cbd5e1] text-sm font-bold text-[#1e293b] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#1e40af] min-h-[100px] leading-relaxed shadow-sm resize-none"
          />
        </div>
      </div>

      {/* Submit Button */}
      <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto p-4 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-10px_25px_rgba(0,0,0,0.06)] z-40">
        <button
          type="button"
          disabled={loading}
          onClick={handleSubmit}
          className="w-full py-3.5 bg-[#1e40af] hover:bg-[#1d4ed8] active:scale-[0.98] disabled:opacity-50 rounded-2xl text-white font-black text-sm flex items-center justify-center gap-2 border-none cursor-pointer shadow-lg shadow-blue-900/25 transition-all"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Saving Advance...</span>
            </>
          ) : (
            <span>Save Client Advance</span>
          )}
        </button>
      </div>
    </div>
  )
}
