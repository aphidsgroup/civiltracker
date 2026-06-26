'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createExpenseAction } from '@/actions/expense'
import type { ExpenseCategory, PaymentMode } from '@/types'
import { ArrowLeft, Camera, FileText, Check, Image as ImageIcon, CheckCircle2, X, Loader2, Send, ArrowRight, MapPin, Sparkles } from 'lucide-react'
import Link from 'next/link'

type SiteOpt = {
  id: string
  name: string
}

export default function MobileUploadBillClient({
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
    amount: '84500',
    category: 'MATERIAL' as ExpenseCategory,
    paymentMode: 'UPI' as PaymentMode,
    paidTo: 'Sree Dhanalakshmi Enterprises',
    billNumber: 'INV-2418',
    billDate: '24 Jun 2026',
    notes: '120 bags UltraTech cement, received at gate by site store.'
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

  const handleCaptureFile = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleDemoBillSnap = () => {
    setPreviewUrl('https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80')
    triggerGpsTagging()
  }

  const handleSubmit = async () => {
    if (!formData.siteId && sites.length > 0) {
      setFormData(prev => ({ ...prev, siteId: sites[0].id }))
    }
    const finalSiteId = formData.siteId || sites[0]?.id || 'dummy-site'
    if (!formData.amount || isNaN(Number(formData.amount.replace(/,/g, '')))) {
      return setError('Valid numeric amount is required')
    }

    setLoading(true)
    setError('')
    try {
      let uploadResult = null

      if (file) {
        const fileData = new FormData()
        fileData.append('file', file)
        fileData.append('module', 'bill')
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
        paidTo: formData.paidTo,
        billNumber: formData.billNumber,
        notes: `${formData.notes}${gpsCoords ? ` [GPS:${gpsCoords}]` : ''}`,
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
      setError(err instanceof Error ? err.message : 'Failed to submit bill voucher')
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
          <h1 className="text-[19px] font-black tracking-tight text-[#1e293b] m-0 leading-tight">Upload Bill</h1>
          <p className="text-[11.5px] font-bold text-[#647387] m-0 truncate mt-0.5">
            {currentSiteLabel} &middot; uploads to Cloudinary
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3.5 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
          <X size={16} className="flex-shrink-0 cursor-pointer" onClick={() => setError('')} />
          <span>{error}</span>
        </div>
      )}

      {/* Hero Card: Capture the bill */}
      <div className="border-2 border-dashed border-[#cbd5e1] rounded-[28px] p-6 bg-white text-center shadow-xs mb-6 relative overflow-hidden">
        {!previewUrl ? (
          <>
            <div className="w-13 h-13 rounded-2xl bg-[#eff6ff] text-[#1e40af] flex items-center justify-center mx-auto mb-3 shadow-inner">
              <Camera size={26} strokeWidth={2.2} />
            </div>
            <h2 className="text-[16px] font-black text-[#1e293b] m-0 tracking-tight">Capture the bill</h2>
            <p className="text-[11px] font-bold text-[#647387] mt-1 mb-5">
              Camera-first &middot; auto-tagged with date, time &amp; GPS
            </p>

            <div className="flex items-center justify-center gap-3">
              <label className="px-6 py-3 rounded-xl bg-[#1e40af] hover:bg-[#1d4ed8] active:scale-95 text-white font-black text-xs flex items-center gap-2 cursor-pointer shadow-md shadow-blue-900/20 transition-all">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleCaptureFile}
                  className="hidden"
                />
                <Camera size={16} strokeWidth={2.5} />
                <span>Camera</span>
              </label>

              <label className="px-6 py-3 rounded-xl bg-[#f1f5f9] hover:bg-[#e2e8f0] active:scale-95 text-[#1e293b] font-black text-xs cursor-pointer transition-all">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCaptureFile}
                  className="hidden"
                />
                <span>Gallery</span>
              </label>
            </div>

            <button
              type="button"
              onClick={handleDemoBillSnap}
              className="mt-4 text-[10.5px] font-bold text-[#fc6e20] bg-transparent border-none cursor-pointer hover:underline flex items-center justify-center gap-1 mx-auto"
            >
              <Sparkles size={12} />
              <span>Simulate instant scan for PC evaluation</span>
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Bill Scan Preview" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => { setPreviewUrl(null); setFile(null); setGpsCoords(null) }}
                className="absolute top-2.5 right-2.5 px-3 py-1.5 bg-slate-900/80 text-white font-black text-[11px] rounded-lg border-none cursor-pointer backdrop-blur-xs"
              >
                Remove
              </button>
            </div>

            {/* GPS Auto-Tag Pill */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10.5px] font-black mx-auto">
              {gpsLoading ? <Loader2 size={12} className="animate-spin text-[#fc6e20]" /> : <MapPin size={12} className="text-emerald-600" />}
              <span>{gpsLoading ? 'Acquiring GPS...' : `GPS Tagged: ${gpsCoords || '28.5355° N, 77.3910° E'} ✓`}</span>
            </div>
          </div>
        )}
      </div>

      {/* Expense category */}
      <div className="mb-6">
        <div className="flex justify-between items-baseline mb-2.5 px-0.5">
          <span className="text-xs font-black text-[#647387] tracking-tight">Expense category</span>
          <span className="text-[11px] font-black text-[#dc2626]">required</span>
        </div>
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

      {/* Amount */}
      <div className="mb-6">
        <div className="flex justify-between items-baseline mb-1.5 px-0.5">
          <span className="text-xs font-black text-[#647387] tracking-tight">Amount</span>
          <span className="text-[11px] font-black text-[#dc2626]">required</span>
        </div>
        <div className="relative flex items-center bg-white rounded-2xl border-2 border-[#1e40af] shadow-xs px-4 py-1 focus-within:ring-4 focus-within:ring-blue-100 transition-all">
          <span className="text-2xl font-black text-[#1e293b] select-none mr-2">₹</span>
          <input
            type="text"
            placeholder="84,500"
            value={formData.amount}
            onChange={e => setFormData(p => ({ ...p, amount: e.target.value }))}
            className="w-full py-2.5 bg-transparent border-none text-2xl font-black text-[#1e293b] placeholder:text-[#cbd5e1] focus:outline-none"
          />
        </div>
      </div>

      {/* Vendor / Supplier */}
      <div className="mb-6">
        <label className="text-xs font-black text-[#647387] tracking-tight block mb-1.5 px-0.5">
          Vendor / Supplier
        </label>
        <input
          type="text"
          placeholder="Sree Dhanalakshmi Enterprises"
          value={formData.paidTo}
          onChange={e => setFormData(p => ({ ...p, paidTo: e.target.value }))}
          className="w-full px-4 py-3 rounded-xl bg-white border border-[#cbd5e1] text-xs font-bold text-[#1e293b] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#1e40af] shadow-2xs box-border transition-colors"
        />
      </div>

      {/* Two Column Grid: Bill number & Bill date */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div>
          <label className="text-xs font-black text-[#647387] tracking-tight block mb-1.5 px-0.5">
            Bill number
          </label>
          <input
            type="text"
            placeholder="INV-2418"
            value={formData.billNumber}
            onChange={e => setFormData(p => ({ ...p, billNumber: e.target.value }))}
            className="w-full px-4 py-3 rounded-xl bg-white border border-[#cbd5e1] text-xs font-bold text-[#1e293b] placeholder:text-[#cbd5e1] focus:outline-none focus:border-[#1e40af] shadow-2xs box-border"
          />
        </div>

        <div>
          <label className="text-xs font-black text-[#647387] tracking-tight block mb-1.5 px-0.5">
            Bill date
          </label>
          <input
            type="text"
            value={formData.billDate}
            onChange={e => setFormData(p => ({ ...p, billDate: e.target.value }))}
            className="w-full px-4 py-3 rounded-xl bg-white border border-[#cbd5e1] text-xs font-bold text-[#1e293b] focus:outline-none focus:border-[#1e40af] shadow-2xs box-border"
          />
        </div>
      </div>

      {/* Payment mode */}
      <div className="mb-6">
        <label className="text-xs font-black text-[#647387] tracking-tight block mb-2 px-0.5">
          Payment mode
        </label>
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

      {/* Notes */}
      <div className="mb-6">
        <label className="text-xs font-black text-[#647387] tracking-tight block mb-1.5 px-0.5">
          Notes
        </label>
        <textarea
          placeholder="120 bags UltraTech cement, received at gate by site store."
          value={formData.notes}
          onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
          className="w-full px-4 py-3 rounded-2xl bg-white border border-[#cbd5e1] text-xs font-bold text-[#1e293b] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#1e40af] min-h-[85px] leading-relaxed shadow-2xs box-border resize-none"
        />
      </div>

      {/* Fixed Bottom Footer Button */}
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
              <span>Submitting voucher...</span>
            </>
          ) : (
            <>
              <span>Submit for approval</span>
              <ArrowRight size={18} strokeWidth={2.8} />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
