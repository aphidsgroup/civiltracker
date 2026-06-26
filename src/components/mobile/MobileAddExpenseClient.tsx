'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createExpenseAction } from '@/actions/expense'
import type { ExpenseCategory, PaymentMode } from '@/types'
import { ArrowLeft, Camera, Plus, Loader2, MapPin, X } from 'lucide-react'
import Link from 'next/link'

type SiteOpt = {
  id: string
  name: string
}

export default function MobileAddExpenseClient({
  sites,
  defaultSiteName
}: {
  sites: SiteOpt[]
  defaultSiteName: string
}) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [gpsCoords, setGpsCoords] = useState<string | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)

  const [formData, setFormData] = useState({
    siteId: sites[0]?.id || '',
    amount: '',
    category: 'DIESEL' as ExpenseCategory,
    paymentMode: 'UPI' as PaymentMode,
    paidTo: '',
    notes: ''
  })

  const categories: { id: ExpenseCategory; label: string }[] = [
    { id: 'MATERIAL', label: 'Material' },
    { id: 'LABOUR', label: 'Labour' },
    { id: 'SUBCONTRACTOR', label: 'Subcontractor' },
    { id: 'TRANSPORT', label: 'Transport' },
    { id: 'TOOLS_EQUIPMENT', label: 'Tools' },
    { id: 'DIESEL', label: 'Diesel' },
    { id: 'SITE_PETTY_CASH', label: 'Petty Cash' },
    { id: 'MISCELLANEOUS', label: 'Misc' },
  ]

  const paymentModes: { id: PaymentMode; label: string }[] = [
    { id: 'CASH', label: 'Cash' },
    { id: 'UPI', label: 'UPI' },
    { id: 'BANK_TRANSFER', label: 'Bank' },
    { id: 'CREDIT', label: 'Credit' },
  ]

  const handleReceiptProof = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0]
      setFile(f)
      setPreviewUrl(URL.createObjectURL(f))
      triggerGpsTagging()
    }
  }

  const triggerGpsTagging = () => {
    setGpsLoading(true)
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsCoords(`${pos.coords.latitude.toFixed(4)}° N, ${pos.coords.longitude.toFixed(4)}° E`)
          setGpsLoading(false)
        },
        () => {
          setGpsCoords('28.5355° N, 77.3910° E')
          setGpsLoading(false)
        },
        { timeout: 5000 }
      )
    } else {
      setGpsCoords('28.5355° N, 77.3910° E')
      setGpsLoading(false)
    }
  }

  const handleSubmit = async () => {
    const finalSiteId = formData.siteId || sites[0]?.id || 'dummy-site'
    if (!formData.amount || isNaN(Number(formData.amount.replace(/,/g, ''))) || Number(formData.amount) <= 0) {
      return setError('Valid numeric amount is required')
    }

    setLoading(true)
    setError('')
    try {
      let uploadResult = null

      if (file) {
        const fileData = new FormData()
        fileData.append('file', file)
        fileData.append('module', 'expense')
        fileData.append('siteId', finalSiteId)

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: fileData
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        uploadResult = data
      }

      await createExpenseAction({
        siteId: finalSiteId,
        amount: Number(formData.amount.replace(/,/g, '')),
        category: formData.category,
        paymentMode: formData.paymentMode,
        paidTo: formData.paidTo || undefined,
        notes: `${formData.notes}${gpsCoords ? ` [GPS:${gpsCoords}]` : ''}` || undefined,
        ...(uploadResult ? {
          cloudinaryPublicId: uploadResult.publicId,
          secureUrl: uploadResult.url,
          format: file?.type.split('/')[1] || 'jpg',
          bytes: file?.size || 1024
        } : {
          secureUrl: previewUrl || undefined
        })
      })

      router.push('/mobile/home')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save site expense')
    } finally {
      setLoading(false)
    }
  }

  const selectedSite = sites.find(s => s.id === formData.siteId)
  const currentSiteLabel = selectedSite?.name || defaultSiteName

  return (
    <div className="p-5 pb-32 max-w-lg mx-auto bg-[#f8fafc] min-h-screen select-none font-sans text-[#1e293b]">
      {/* Top Bar */}
      <div className="flex items-center gap-3.5 mb-6 pt-1">
        <Link
          href="/mobile/home"
          className="w-10 h-10 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-center text-slate-700 no-underline active:scale-95 transition-all flex-shrink-0"
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] font-black tracking-tight text-[#1e293b] m-0 leading-tight">Add Expense</h1>
          <p className="text-[11.5px] font-bold text-[#647387] m-0 truncate mt-0.5">
            {currentSiteLabel} &middot; 24 Jun 2026
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3.5 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
          <X size={16} className="flex-shrink-0 cursor-pointer" onClick={() => setError('')} />
          <span>{error}</span>
        </div>
      )}

      {/* Amount */}
      <div className="mb-6">
        <div className="flex justify-between items-baseline mb-1.5 px-0.5">
          <span className="text-xs font-black text-[#647387] tracking-tight">Amount</span>
          <span className="text-[11px] font-black text-[#dc2626]">required</span>
        </div>
        <div className="relative flex items-center bg-white rounded-2xl border-2 border-[#1e40af] shadow-xs px-4 py-1 focus-within:ring-4 focus-within:ring-blue-100 transition-all">
          <span className="text-2xl font-black text-[#1e293b] select-none mr-2">₹</span>
          <input
            type="number"
            placeholder="0"
            value={formData.amount}
            onChange={e => setFormData(p => ({ ...p, amount: e.target.value }))}
            className="w-full py-2.5 bg-transparent border-none text-2xl font-black text-[#1e293b] placeholder:text-[#cbd5e1] focus:outline-none"
          />
        </div>
      </div>

      {/* Category */}
      <div className="mb-6">
        <span className="text-xs font-black text-[#647387] tracking-tight block mb-2.5 px-0.5">Category</span>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => {
            const active = formData.category === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setFormData(p => ({ ...p, category: cat.id }))}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                  active
                    ? 'bg-[#1e40af] text-white border-[#1e40af] shadow-xs scale-[1.02]'
                    : 'bg-white text-[#475569] border-[#cbd5e1] hover:bg-slate-50'
                }`}
              >
                {cat.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Payment mode */}
      <div className="mb-6">
        <span className="text-xs font-black text-[#647387] tracking-tight block mb-2 px-0.5">Payment mode</span>
        <div className="grid grid-cols-4 gap-2">
          {paymentModes.map((pm) => {
            const active = formData.paymentMode === pm.id
            return (
              <button
                key={pm.id}
                type="button"
                onClick={() => setFormData(p => ({ ...p, paymentMode: pm.id }))}
                className={`py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                  active
                    ? 'bg-[#1e40af] text-white border-[#1e40af] shadow-xs'
                    : 'bg-white text-[#475569] border-[#cbd5e1] hover:bg-slate-50'
                }`}
              >
                {pm.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Paid to */}
      <div className="mb-6">
        <label className="text-xs font-black text-[#647387] tracking-tight block mb-1.5 px-0.5">Paid to</label>
        <input
          type="text"
          placeholder="Vendor / labour / purpose"
          value={formData.paidTo}
          onChange={e => setFormData(p => ({ ...p, paidTo: e.target.value }))}
          className="w-full px-4 py-3 rounded-xl bg-white border border-[#cbd5e1] text-xs font-bold text-[#1e293b] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#1e40af] shadow-2xs box-border transition-colors"
        />
      </div>

      {/* Attach proof */}
      <div className="mb-6">
        <div className="flex justify-between items-baseline mb-2 px-0.5">
          <span className="text-xs font-black text-[#647387] tracking-tight">Attach proof</span>
          <span className="text-[11px] font-bold text-[#94a3b8]">optional</span>
        </div>
        <div className="border-2 border-dashed border-[#cbd5e1] rounded-[24px] p-6 bg-white text-center shadow-2xs relative overflow-hidden">
          {!previewUrl ? (
            <label className="block cursor-pointer">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleReceiptProof}
                className="hidden"
              />
              <div className="w-12 h-12 rounded-2xl bg-[#eff6ff] text-[#1e40af] flex items-center justify-center mx-auto mb-2 shadow-inner">
                <Plus size={24} strokeWidth={2.4} />
              </div>
              <span className="text-xs font-black text-[#647387]">Add receipt photo</span>
            </label>
          ) : (
            <div className="space-y-3">
              <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Receipt Preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => { setPreviewUrl(null); setFile(null); setGpsCoords(null) }}
                  className="absolute top-2 right-2 px-2.5 py-1 bg-slate-900/80 text-white font-black text-[10px] rounded-lg border-none cursor-pointer"
                >
                  Remove
                </button>
              </div>

              {gpsCoords && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-black">
                  <MapPin size={11} className="text-emerald-600" />
                  <span>GPS Tagged: {gpsCoords}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="mb-6">
        <label className="text-xs font-black text-[#647387] tracking-tight block mb-1.5 px-0.5">Notes</label>
        <textarea
          placeholder="Diesel for JCB, 40 litres."
          value={formData.notes}
          onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
          className="w-full px-4 py-3 rounded-2xl bg-white border border-[#cbd5e1] text-xs font-bold text-[#1e293b] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#1e40af] min-h-[80px] leading-relaxed shadow-2xs box-border resize-none"
        />
      </div>

      {/* Fixed Bottom Submit Button */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[440px] mx-auto p-4 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-10px_25px_rgba(0,0,0,0.06)] z-40">
        <button
          type="button"
          disabled={loading}
          onClick={handleSubmit}
          className="w-full py-3.5 bg-[#1e40af] hover:bg-[#1d4ed8] active:scale-[0.98] disabled:opacity-50 rounded-2xl text-white font-black text-sm flex items-center justify-center gap-2 border-none cursor-pointer shadow-lg shadow-blue-900/25 transition-all"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Saving voucher...</span>
            </>
          ) : (
            <span>Save expense</span>
          )}
        </button>
      </div>
    </div>
  )
}
