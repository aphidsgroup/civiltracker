'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, CheckCircle2, Loader2, HardHat } from 'lucide-react'

type SubRow = {
  id: string
  name: string
  phone: string | null
  trade: string | null
  gst: string | null
  workOrderValue: number
  raBilled: number
  advance: number
  retention: number
  status: string
  isActive: boolean
  pending: number
}

type Props = {
  subs: SubRow[]
  updateAction: (formData: FormData) => Promise<void>
  markPaidAction: (formData: FormData) => Promise<void>
  deactivateAction: (formData: FormData) => Promise<void>
}

function fmt(n: number) {
  if (n >= 100000) return '₹' + (n / 100000).toFixed(2) + 'L'
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'k'
  return '₹' + n.toLocaleString('en-IN')
}

function SubCard({ sub, updateAction, markPaidAction, deactivateAction }: {
  sub: SubRow
  updateAction: (fd: FormData) => Promise<void>
  markPaidAction: (fd: FormData) => Promise<void>
  deactivateAction: (fd: FormData) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const [name, setName] = useState(sub.name)
  const [phone, setPhone] = useState(sub.phone ?? '')
  const [trade, setTrade] = useState(sub.trade ?? '')
  const [gst, setGst] = useState(sub.gst ?? '')
  const [workOrderValue, setWorkOrderValue] = useState(String(sub.workOrderValue))
  const [raBilled, setRaBilled] = useState(String(sub.raBilled))
  const [advance, setAdvance] = useState(String(sub.advance))
  const [retention, setRetention] = useState(String(sub.retention))
  const [status, setStatus] = useState(sub.status)

  // Live-recalculate pending from form state
  const livePending = Math.max(0,
    (parseFloat(raBilled) || 0) - (parseFloat(advance) || 0) - (parseFloat(retention) || 0)
  )

  const isPending = sub.pending > 0
  const completion = sub.workOrderValue > 0
    ? Math.min(100, Math.round((sub.raBilled / sub.workOrderValue) * 100))
    : 0

  const handleSave = () => {
    startTransition(async () => {
      const fd = new FormData()
      fd.append('id', sub.id)
      fd.append('name', name)
      fd.append('phone', phone)
      fd.append('trade', trade)
      fd.append('gst', gst)
      fd.append('workOrderValue', workOrderValue)
      fd.append('raBilled', raBilled)
      fd.append('advance', advance)
      fd.append('retention', retention)
      fd.append('status', status)
      await updateAction(fd)
      setOpen(false)
    })
  }

  const handleMarkPaid = () => {
    startTransition(async () => {
      const fd = new FormData()
      fd.append('id', sub.id)
      fd.append('amount', String(sub.pending))
      await markPaidAction(fd)
    })
  }

  const handleDeactivate = () => {
    if (!confirm(`Remove "${sub.name}"? All data is kept.`)) return
    startTransition(async () => {
      const fd = new FormData()
      fd.append('id', sub.id)
      await deactivateAction(fd)
    })
  }

  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] bg-white"
  const labelCls = "block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1"

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${isPending && !open ? 'border-rose-200' : 'border-slate-200'}`}>
      {/* Collapsed view */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50/60 transition-colors select-none"
        onClick={() => setOpen(o => !o)}
      >
        {/* Avatar */}
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg flex-shrink-0 ${isPending ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
          {sub.name.charAt(0).toUpperCase()}
        </div>

        {/* Name + trade + progress bar */}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-800 truncate">{sub.name}</div>
          <div className="text-xs text-slate-400 mt-0.5">{sub.trade || 'General'} {sub.phone ? `· ${sub.phone}` : ''}</div>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${completion}%` }} />
            </div>
            <span className="text-[10px] text-slate-400 font-semibold">{completion}% billed</span>
          </div>
        </div>

        {/* Financial grid */}
        <div className="hidden md:grid grid-cols-4 gap-4 flex-shrink-0 text-center">
          {[
            { label: 'Work Order', val: fmt(sub.workOrderValue), cls: 'text-slate-600' },
            { label: 'RA Billed', val: fmt(sub.raBilled), cls: 'text-slate-600' },
            { label: 'Advance', val: fmt(sub.advance), cls: 'text-slate-600' },
            { label: 'Pending', val: isPending ? fmt(sub.pending) : '✓ Settled', cls: isPending ? 'text-rose-600 font-black' : 'text-emerald-600 font-black' },
          ].map(f => (
            <div key={f.label}>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{f.label}</div>
              <div className={`text-sm font-bold mt-0.5 ${f.cls}`}>{f.val}</div>
            </div>
          ))}
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

      {/* Expanded edit form */}
      {open && (
        <div className="border-t border-slate-100 bg-slate-50/40 px-5 py-5">
          {/* Live financial summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 p-3 bg-white rounded-xl border border-slate-200">
            {[
              { label: 'Work Order', val: fmt(parseFloat(workOrderValue) || 0), cls: 'text-slate-700' },
              { label: 'RA Billed', val: fmt(parseFloat(raBilled) || 0), cls: 'text-slate-700' },
              { label: 'Advance Paid', val: fmt(parseFloat(advance) || 0), cls: 'text-slate-700' },
              { label: 'Pending Now', val: livePending > 0 ? fmt(livePending) : '✓ Settled', cls: livePending > 0 ? 'text-rose-600 font-black' : 'text-emerald-600 font-black' },
            ].map(f => (
              <div key={f.label} className="text-center">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">{f.label}</div>
                <div className={`text-sm font-bold ${f.cls}`}>{f.val}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="col-span-2 md:col-span-3">
              <label className={labelCls}>Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Trade / Specialty</label>
              <input value={trade} onChange={e => setTrade(e.target.value)} placeholder="e.g. Brickwork, Tiling" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>GST Number</label>
              <input value={gst} onChange={e => setGst(e.target.value.toUpperCase())} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Work Order Value (₹)</label>
              <input type="number" step="0.01" min="0" value={workOrderValue} onChange={e => setWorkOrderValue(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>RA Billed (₹)</label>
              <input type="number" step="0.01" min="0" value={raBilled} onChange={e => setRaBilled(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Advance Paid (₹)</label>
              <input type="number" step="0.01" min="0" value={advance} onChange={e => setAdvance(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Retention (₹)</label>
              <input type="number" step="0.01" min="0" value={retention} onChange={e => setRetention(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
                <option>Active</option>
                <option>Inactive</option>
                <option>Completed</option>
              </select>
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
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function SubCardList({ subs, updateAction, markPaidAction, deactivateAction }: Props) {
  return (
    <div className="space-y-3">
      {subs.map(s => (
        <SubCard
          key={s.id}
          sub={s}
          updateAction={updateAction}
          markPaidAction={markPaidAction}
          deactivateAction={deactivateAction}
        />
      ))}
    </div>
  )
}
