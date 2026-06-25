'use client'

import { useState, useEffect } from 'react'

import { useRouter } from 'next/navigation'
import { createExpenseAction } from '@/actions/expense'
import type { ExpenseCategory, PaymentMode } from '@/types'

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
    <>
      <div className="fhead">
        <button onClick={() => router.back()} className="backb">
          <svg className="svg18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div>
          <div className="ftitle">Upload Bill</div>
          <div className="fsub">Vendor invoice or receipt</div>
        </div>
      </div>

      <div style={{ padding: '4px 18px 24px' }}>
        {error && (
          <div style={{ padding: '12px', background: '#fbe6e3', color: '#c4392c', borderRadius: '12px', marginBottom: '16px', fontSize: '13px', fontWeight: 600 }}>
            {error}
          </div>
        )}

        {!file ? (
          <label className="capz">
            <input type="file" accept="image/*,application/pdf" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
            <div className="capc">
              <svg className="svg28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </div>
            <div>
              <div className="capt">Capture or upload bill</div>
              <div className="caps">Take a clear photo of the invoice</div>
            </div>
            <div className="capbtns">
              <div className="capbtn">
                <svg className="svg16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                Camera
              </div>
              <div className="capbtn alt">
                <svg className="svg16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                File
              </div>
            </div>
          </label>
        ) : (
          <div className="preview">
            <div className="pvthumb">
              IMG
              <div className="pvdone">
                <svg className="svg24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            </div>
            <div className="pvmain">
              <div className="pvname">{file.name}</div>
              <div className="pvmeta">
                <svg className="svg16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                Image · {(file.size / 1024 / 1024).toFixed(1)} MB
              </div>
              <div className="cloud done">
                <svg className="svg16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
                Selected
              </div>
            </div>
            <button onClick={() => setFile(null)} className="backb" style={{ width: '32px', height: '32px', color: 'var(--red)' }}>
              <svg className="svg18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}

        <div className="field">
          <label className="flabel">Site <span className="req">*</span></label>
          <select 
            className="inp" 
            value={formData.siteId}
            onChange={e => setFormData({...formData, siteId: e.target.value})}
          >
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            {sites.length === 0 && <option value="">Loading sites...</option>}
          </select>
        </div>

        <div className="field">
          <label className="flabel">Amount <span className="req">*</span></label>
          <div className="amtwrap">
            <span className="rupee">₹</span>
            <input 
              type="number" 
              className="amtin" 
              placeholder="0.00" 
              value={formData.amount}
              onChange={e => setFormData({...formData, amount: e.target.value})}
            />
          </div>
        </div>

        <div className="two" style={{ marginBottom: '14px' }}>
          <div>
            <label className="flabel">Category</label>
            <select 
              className="inp"
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
            <label className="flabel">Payment</label>
            <select 
              className="inp"
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

        <div className="field">
          <label className="flabel">Vendor / Supplier</label>
          <input 
            type="text" 
            className="inp" 
            placeholder="e.g. Sri Ram Traders" 
            value={formData.paidTo}
            onChange={e => setFormData({...formData, paidTo: e.target.value})}
          />
        </div>

        <div className="field">
          <label className="flabel">Bill Number</label>
          <input 
            type="text" 
            className="inp" 
            placeholder="e.g. INV-2024-001" 
            value={formData.billNumber}
            onChange={e => setFormData({...formData, billNumber: e.target.value})}
          />
        </div>

        <div className="field">
          <label className="flabel">Notes (Optional)</label>
          <textarea 
            className="ta" 
            placeholder="Additional details..."
            value={formData.notes}
            onChange={e => setFormData({...formData, notes: e.target.value})}
          ></textarea>
        </div>
      </div>

      <div className="sFooter">
        <button className="btnP" onClick={handleSubmit} disabled={loading} style={{ opacity: loading ? 0.7 : 1 }}>
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg className="svg22 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
              Uploading...
            </span>
          ) : (
            <>
              <svg className="svg22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Submit Bill
              <span className="btnsub">for approval</span>
            </>
          )}
        </button>
      </div>
    </>
  )
}
