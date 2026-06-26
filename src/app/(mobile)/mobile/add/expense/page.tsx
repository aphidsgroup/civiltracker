'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Check } from 'lucide-react'

const CATEGORIES = [
  { value: 'MATERIAL', label: '\u{1F9F1} Material' },
  { value: 'LABOUR', label: '\u{1F477} Labour' },
  { value: 'DIESEL', label: '\u26FD Diesel' },
  { value: 'TRANSPORT', label: '\u{1F69B} Transport' },
  { value: 'TOOLS_EQUIPMENT', label: '\u{1F527} Tools' },
  { value: 'SITE_PETTY_CASH', label: '\u{1F4B0} Petty Cash' },
  { value: 'SUBCONTRACTOR', label: '\u{1F528} Subcontractor' },
  { value: 'MISCELLANEOUS', label: '\u2614 Misc' },
]

const PAYMENT_MODES = [
  { value: 'CASH', label: '\u{1F4B5} Cash' },
  { value: 'UPI', label: '\u{1F4F1} UPI' },
  { value: 'BANK_TRANSFER', label: '\u{1F3E6} Bank' },
  { value: 'CREDIT', label: '\u{1F4B3} Credit' },
]

type Site = { id: string; name: string }

export default function AddExpensePage() {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('MATERIAL')
  const [paymentMode, setPaymentMode] = useState('CASH')
  const [description, setDescription] = useState('')
  const [paidTo, setPaidTo] = useState('')
  const [billNumber, setBillNumber] = useState('')
  const [siteId, setSiteId] = useState('')
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    fetch('/api/sites').then(r => r.json()).then(data => {
      if (data.sites) { setSites(data.sites); if (data.sites[0]) setSiteId(data.sites[0].id) }
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!amount || !siteId || !description) return
    setLoading(true)
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(amount), category, paymentMode, description, paidTo, billNumber, siteId }),
      })
      if (res.ok) {
        setSubmitted(true)
        setTimeout(() => router.push('/mobile/home'), 1500)
      }
    } catch {}
    setLoading(false)
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-3 bg-gray-50">
        <CheckCircle2 className="w-16 h-16 text-green-500 animate-bounce" />
        <div className="text-xl font-extrabold text-gray-900">Expense Added!</div>
        <div className="text-sm text-gray-500">Redirecting...</div>
      </div>
    )
  }

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 pt-2">
        <button 
          onClick={() => router.back()} 
          className="p-2 text-gray-700 hover:bg-gray-200 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">Add Expense</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Amount */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Amount</label>
          <div className="flex items-center">
            <span className="text-3xl font-extrabold text-gray-400 mr-2">\u20B9</span>
            <input 
              type="number" 
              className="w-full text-3xl font-extrabold text-gray-900 focus:outline-none placeholder-gray-300 bg-transparent" 
              placeholder="0" 
              value={amount} 
              onChange={e => setAmount(e.target.value)} 
              required 
              min="1" 
              step="0.01" 
            />
          </div>
        </div>

        {/* Site */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-2">Site</label>
          <select 
            className="w-full px-3.5 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" 
            value={siteId} 
            onChange={e => setSiteId(e.target.value)} 
            required
          >
            <option value="">Select site</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Category chips */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-2">Category</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => (
              <button 
                key={c.value} 
                type="button" 
                className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all shadow-sm ${
                  category === c.value 
                    ? 'border border-amber-500 bg-amber-50 text-amber-900 ring-1 ring-amber-500 font-semibold' 
                    : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`} 
                onClick={() => setCategory(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Payment mode chips */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-2">Payment Mode</label>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_MODES.map(p => (
              <button 
                key={p.value} 
                type="button" 
                className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all shadow-sm ${
                  paymentMode === p.value 
                    ? 'border border-amber-500 bg-amber-50 text-amber-900 ring-1 ring-amber-500 font-semibold' 
                    : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`} 
                onClick={() => setPaymentMode(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-2">Description *</label>
          <textarea 
            className="w-full px-3.5 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm resize-none" 
            placeholder="What was this expense for?" 
            value={description} 
            onChange={e => setDescription(e.target.value)} 
            rows={2} 
            required 
          />
        </div>

        {/* Paid to */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-2">Paid To (Vendor/Person)</label>
          <input 
            type="text" 
            className="w-full px-3.5 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" 
            placeholder="Vendor name" 
            value={paidTo} 
            onChange={e => setPaidTo(e.target.value)} 
          />
        </div>

        {/* Bill number */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-2">Bill / Invoice No.</label>
          <input 
            type="text" 
            className="w-full px-3.5 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm" 
            placeholder="INV-001" 
            value={billNumber} 
            onChange={e => setBillNumber(e.target.value)} 
          />
        </div>

        <button 
          type="submit" 
          disabled={loading} 
          className="w-full mt-2 py-3.5 px-4 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold rounded-xl text-sm shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Check className="w-5 h-5" />
          {loading ? 'Saving...' : 'Submit Expense'}
        </button>
      </form>
    </div>
  )
}
