'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, CheckCircle2, AlertCircle, Loader2, Truck } from 'lucide-react'

type VendorRow = {
  id: string
  name: string
  phone: string | null
  email: string | null
  gst: string | null
  category: string | null
  address: string | null
  paymentTerms: string | null
  rating: number | null
  totalPurchase: number
  amountPayable: number
  isActive: boolean
}

type Props = {
  vendors: VendorRow[]
  updateAction: (formData: FormData) => Promise<void>
  markPaidAction: (formData: FormData) => Promise<void>
  deactivateAction: (formData: FormData) => Promise<void>
}

function fmt(n: number) {
  if (n >= 100000) return '₹' + (n / 100000).toFixed(2) + 'L'
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'k'
  return '₹' + n.toLocaleString('en-IN')
}

function VendorCard({ vendor, updateAction, markPaidAction, deactivateAction }: {
  vendor: VendorRow
  updateAction: (fd: FormData) => Promise<void>
  markPaidAction: (fd: FormData) => Promise<void>
  deactivateAction: (fd: FormData) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(vendor.name)
  const [phone, setPhone] = useState(vendor.phone ?? '')
  const [email, setEmail] = useState(vendor.email ?? '')
  const [gst, setGst] = useState(vendor.gst ?? '')
  const [category, setCategory] = useState(vendor.category ?? '')
  const [address, setAddress] = useState(vendor.address ?? '')
  const [paymentTerms, setPaymentTerms] = useState(vendor.paymentTerms ?? '')
  const [amountPayable, setAmountPayable] = useState(String(vendor.amountPayable))
  const [status, setStatus] = useState(vendor.isActive ? 'Active' : 'Inactive')

  const isPending = vendor.amountPayable > 0

  const handleSave = () => {
    startTransition(async () => {
      const fd = new FormData()
      fd.append('id', vendor.id)
      fd.append('name', name)
      fd.append('phone', phone)
      fd.append('email', email)
      fd.append('gst', gst)
      fd.append('category', category)
      fd.append('address', address)
      fd.append('paymentTerms', paymentTerms)
      fd.append('amountPayable', amountPayable)
      fd.append('isActive', status === 'Active' ? 'true' : 'false')
      await updateAction(fd)
      setOpen(false)
    })
  }

  const handleMarkPaid = () => {
    startTransition(async () => {
      const fd = new FormData()
      fd.append('id', vendor.id)
      fd.append('amount', String(vendor.amountPayable))
      await markPaidAction(fd)
    })
  }

  const handleDeactivate = () => {
    if (!confirm(`Remove "${vendor.name}"? All PO data is kept.`)) return
    startTransition(async () => {
      const fd = new FormData()
      fd.append('id', vendor.id)
      await deactivateAction(fd)
    })
  }

  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] bg-white"
  const labelCls = "block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1"

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${isPending && !open ? 'border-orange-200' : 'border-slate-200'}`}>
      {/* Collapsed row */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50/60 transition-colors select-none"
        onClick={() => setOpen(o => !o)}
      >
        {/* Avatar */}
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg flex-shrink-0 ${isPending ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}>
          {vendor.name.charAt(0).toUpperCase()}
        </div>

        {/* Name + category */}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-800 truncate">{vendor.name}</div>
          <div className="text-xs text-slate-400 mt-0.5 truncate">
            {vendor.category || 'General Vendor'} {vendor.phone ? `· ${vendor.phone}` : vendor.email ? `· ${vendor.email}` : ''}
          </div>
        </div>

        {/* Financial */}
        <div className="hidden sm:flex items-center gap-6 flex-shrink-0">
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Total Purchase</div>
            <div className="text-sm font-bold text-slate-700">{fmt(vendor.totalPurchase)}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Pending Payment</div>
            <div className={`text-sm font-black ${isPending ? 'text-orange-600' : 'text-emerald-600'}`}>
              {isPending ? fmt(vendor.amountPayable) : '✓ Settled'}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {isPending && (
            <button
              onClick={handleMarkPaid}
              disabled={pending}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm disabled:opacity-50"
            >
              {pending ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
              Mark Paid
            </button>
          )}
          <div className="p-1 text-slate-400">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
        </div>
      </div>

      {/* Expanded form */}
      {open && (
        <div className="border-t border-slate-100 bg-slate-50/40 px-5 py-5">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="col-span-2 md:col-span-3">
              <label className={labelCls}>Vendor / Company Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Cement Supplier" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>GST Number</label>
              <input value={gst} onChange={e => setGst(e.target.value.toUpperCase())} placeholder="27AAAAA0000A1Z5" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Payment Terms</label>
              <input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="e.g. Net 30" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Amount Payable (₹)</label>
              <input type="number" step="0.01" min="0" value={amountPayable} onChange={e => setAmountPayable(e.target.value)} className={inputCls} />
            </div>
            <div className="col-span-2 md:col-span-3">
              <label className={labelCls}>Address</label>
              <input value={address} onChange={e => setAddress(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={handleSave}
              disabled={pending}
              className="flex items-center gap-1.5 px-5 py-2 bg-[#fc6e20] hover:bg-[#e85b0d] text-white rounded-lg text-sm font-bold transition-colors shadow-sm disabled:opacity-50"
            >
              {pending && <Loader2 size={13} className="animate-spin" />}
              Save Changes
            </button>
            <button onClick={() => setOpen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-semibold transition-colors">
              Cancel
            </button>
            <button
              onClick={handleDeactivate}
              disabled={pending}
              className="ml-auto px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-bold transition-colors"
            >
              Remove Vendor
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function VendorCardList({ vendors, updateAction, markPaidAction, deactivateAction }: Props) {
  return (
    <div className="space-y-3">
      {vendors.map(v => (
        <VendorCard
          key={v.id}
          vendor={v}
          updateAction={updateAction}
          markPaidAction={markPaidAction}
          deactivateAction={deactivateAction}
        />
      ))}
    </div>
  )
}
