'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createExpenseAction } from '@/actions/expense'
import type { ExpenseCategory, PaymentMode } from '@/types'
import { ArrowLeft, Camera, FileText, Check, Image as ImageIcon, CheckCircle2, X, Loader2, Send } from 'lucide-react'

export default function MobileUploadBill() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [sites, setSites] = useState<{id: string, name: string}[]>([])
  const [error, setError] = useState('')
  
  const [formData, setFormData] = useState({
    siteId: '',
    amount: '',
    category: 'MATERIAL' as ExpenseCategory,
    paymentMode: 'CREDIT' as PaymentMode,
    paidTo: '',
    billNumber: '',
    notes: ''
  })

  useEffect(() => {
    fetch('/api/sites')
      .then(res => res.json())
      .then(data => {
        if (data.sites) {
          setSites(data.sites)
          if (data.sites.length > 0) {
            setFormData(prev => ({ ...prev, siteId: data.sites[0].id }))
          }
        }
      })
      .catch(console.error)
  }, [])
  
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  const handleSubmit = async () => {
    if (!formData.siteId) return setError('Site is required')
    if (!formData.amount || isNaN(Number(formData.amount))) return setError('Valid amount is required')
    
    setLoading(true)
    setError('')
    try {
      let uploadResult = null

      if (file) {
        const fileData = new FormData()
        fileData.append('file', file)
        fileData.append('module', 'bill')
        fileData.append('siteId', formData.siteId)
        
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: fileData
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        uploadResult = data
      }

      await createExpenseAction({
        siteId: formData.siteId,
        amount: Number(formData.amount),
        category: formData.category,
        paymentMode: formData.paymentMode,
        paidTo: formData.paidTo,
        billNumber: formData.billNumber,
        notes: formData.notes,
        ...(uploadResult ? {
          cloudinaryPublicId: uploadResult.publicId,
          secureUrl: uploadResult.url,
          format: file?.type.split('/')[1],
          bytes: file?.size
        } : {})
      })

      router.push('/mobile/home')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit bill')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 pb-28 max-w-lg mx-auto bg-gray-50 min-h-screen flex flex-col">
      <div className="flex items-center gap-3 mb-6 pt-2">
        <button 
          onClick={() => router.back()} 
          className="p-2 text-gray-700 hover:bg-gray-200 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Upload Bill</h1>
          <p className="text-xs text-gray-500">Vendor invoice or receipt</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-4">
        {error && (
          <div className="p-3.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-semibold">
            {error}
          </div>
        )}

        {!file ? (
          <label className="border-2 border-dashed border-gray-300 hover:border-amber-500 bg-white rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors shadow-sm gap-3">
            <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={handleFile} />
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
              <Camera className="w-8 h-8" />
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">Capture or upload bill</div>
              <div className="text-xs text-gray-500 mt-0.5">Take a clear photo of the invoice</div>
            </div>
            <div className="flex gap-2 mt-2">
              <div className="px-3 py-1.5 bg-amber-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm">
                <Camera className="w-3.5 h-3.5" />
                Camera
              </div>
              <div className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-gray-200 transition-colors">
                <FileText className="w-3.5 h-3.5" />
                File
              </div>
            </div>
          </label>
        ) : (
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs relative flex-shrink-0">
              IMG
              <div className="absolute -bottom-1 -right-1 bg-green-500 text-white rounded-full p-0.5 shadow-sm">
                <Check className="w-3 h-3" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-gray-900 truncate">{file.name}</div>
              <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <ImageIcon className="w-3.5 h-3.5 text-gray-400" />
                <span>Image · {(file.size / 1024 / 1024).toFixed(1)} MB</span>
              </div>
              <div className="text-[11px] font-bold text-green-600 flex items-center gap-1 mt-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Selected</span>
              </div>
            </div>
            <button 
              onClick={() => setFile(null)} 
              className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4 mt-1">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Site <span className="text-red-500">*</span></label>
            <select 
              className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" 
              value={formData.siteId}
              onChange={e => setFormData({...formData, siteId: e.target.value})}
            >
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              {sites.length === 0 && <option value="">Loading sites...</option>}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Amount <span className="text-red-500">*</span></label>
            <div className="flex items-center border border-gray-200 rounded-xl px-3.5 py-2 bg-white focus-within:ring-2 focus-within:ring-amber-500 shadow-sm">
              <span className="text-xl font-bold text-gray-400 mr-2">₹</span>
              <input 
                type="number" 
                className="w-full text-lg font-bold text-gray-900 focus:outline-none bg-transparent placeholder-gray-300" 
                placeholder="0.00" 
                value={formData.amount}
                onChange={e => setFormData({...formData, amount: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Category</label>
              <select 
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value as ExpenseCategory})}
              >
                <option value="MATERIAL">Material</option>
                <option value="LABOUR">Labour</option>
                <option value="SUBCONTRACTOR">Subcontractor</option>
                <option value="DIESEL">Diesel</option>
                <option value="MISCELLANEOUS">Miscellaneous</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Payment</label>
              <select 
                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
                value={formData.paymentMode}
                onChange={e => setFormData({...formData, paymentMode: e.target.value as PaymentMode})}
              >
                <option value="CREDIT">Credit</option>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Vendor / Supplier</label>
            <input 
              type="text" 
              className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" 
              placeholder="e.g. Sri Ram Traders" 
              value={formData.paidTo}
              onChange={e => setFormData({...formData, paidTo: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Bill Number</label>
            <input 
              type="text" 
              className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" 
              placeholder="e.g. INV-2024-001" 
              value={formData.billNumber}
              onChange={e => setFormData({...formData, billNumber: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Notes (Optional)</label>
            <textarea 
              className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm resize-none" 
              placeholder="Additional details..."
              rows={2}
              value={formData.notes}
              onChange={e => setFormData({...formData, notes: e.target.value})}
            ></textarea>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <button 
          className="w-full py-3.5 px-4 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed" 
          onClick={handleSubmit} 
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Uploading...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Submit Bill</span>
              <span className="text-amber-200 font-normal text-xs ml-0.5">for approval</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
