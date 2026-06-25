'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '60px' }}>\u2705</div>
        <div style={{ fontSize: '18px', fontWeight: 800 }}>Expense Added!</div>
        <div style={{ fontSize: '13px', color: 'var(--mut)' }}>Redirecting...</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: '4px', color: 'var(--ink)' }}>\u2190</button>
        <h1 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>Add Expense</h1>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Amount */}
        <div>
          <label className="ct-label">Amount</label>
          <div className="mobile-amt-wrap">
            <span className="mobile-rupee">\u20B9</span>
            <input type="number" className="mobile-amt-in" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} required min="1" step="0.01" />
          </div>
        </div>

        {/* Site */}
        <div>
          <label className="ct-label">Site</label>
          <select className="mobile-inp" value={siteId} onChange={e => setSiteId(e.target.value)} required>
            <option value="">Select site</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Category chips */}
        <div>
          <label className="ct-label">Category</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {CATEGORIES.map(c => (
              <button key={c.value} type="button" className={`mobile-chip ${category === c.value ? 'selected' : ''}`} onClick={() => setCategory(c.value)}>{c.label}</button>
            ))}
          </div>
        </div>

        {/* Payment mode chips */}
        <div>
          <label className="ct-label">Payment Mode</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {PAYMENT_MODES.map(p => (
              <button key={p.value} type="button" className={`mobile-chip ${paymentMode === p.value ? 'selected' : ''}`} onClick={() => setPaymentMode(p.value)}>{p.label}</button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="ct-label">Description *</label>
          <textarea className="mobile-inp" placeholder="What was this expense for?" value={description} onChange={e => setDescription(e.target.value)} rows={2} required style={{ resize: 'none' }} />
        </div>

        {/* Paid to */}
        <div>
          <label className="ct-label">Paid To (Vendor/Person)</label>
          <input type="text" className="mobile-inp" placeholder="Vendor name" value={paidTo} onChange={e => setPaidTo(e.target.value)} />
        </div>

        {/* Bill number */}
        <div>
          <label className="ct-label">Bill / Invoice No.</label>
          <input type="text" className="mobile-inp" placeholder="INV-001" value={billNumber} onChange={e => setBillNumber(e.target.value)} />
        </div>

        <button type="submit" disabled={loading} className="mobile-btn-primary">
          {loading ? 'Saving...' : '\u2714 Submit Expense'}
        </button>
      </form>
    </div>
  )
}
