'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, CheckCircle2, Loader2 } from 'lucide-react'

type Site = { id: string; name: string }

type LabourRow = {
  id: string
  name: string
  phone: string | null
  trade: string
  dailyWage: number
  overtimeRate: number
  isActive: boolean
  openingAdvance: number
  site: { name: string }
  siteId: string
  pendingBalance: number
  presentDays: number
  totalAdvances: number
  earned: number
}

type Props = {
  workers: LabourRow[]
  sites: Site[]
  updateAction: (formData: FormData) => Promise<void>
  markPaidAction: (formData: FormData) => Promise<void>
  deactivateAction: (formData: FormData) => Promise<void>
}

const TRADES = ['MASON','HELPER','CARPENTER','BAR_BENDER','ELECTRICIAN','PLUMBER','PAINTER','TILE_WORKER','WELDER','SUPERVISOR']

const tradeColors: Record<string, string> = {
  MASON: 'bg-orange-100 text-orange-700',
  HELPER: 'bg-slate-100 text-slate-600',
  CARPENTER: 'bg-amber-100 text-amber-700',
  BAR_BENDER: 'bg-purple-100 text-purple-700',
  ELECTRICIAN: 'bg-yellow-100 text-yellow-700',
  PLUMBER: 'bg-cyan-100 text-cyan-700',
  PAINTER: 'bg-pink-100 text-pink-700',
  SUPERVISOR: 'bg-emerald-100 text-emerald-700',
  WELDER: 'bg-red-100 text-red-700',
  TILE_WORKER: 'bg-indigo-100 text-indigo-700',
}

function fmt(n: number) {
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L'
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'k'
  return '₹' + n.toLocaleString('en-IN')
}

function WorkerCard({ worker, sites, updateAction, markPaidAction, deactivateAction }: {
  worker: LabourRow
  sites: Site[]
  updateAction: (fd: FormData) => Promise<void>
  markPaidAction: (fd: FormData) => Promise<void>
  deactivateAction: (fd: FormData) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(worker.name)
  const [phone, setPhone] = useState(worker.phone ?? '')
  const [trade, setTrade] = useState(worker.trade)
  const [dailyWage, setDailyWage] = useState(String(worker.dailyWage))
  const [overtimeRate, setOvertimeRate] = useState(String(worker.overtimeRate))
  const [siteId, setSiteId] = useState(worker.siteId)
  const [status, setStatus] = useState(worker.isActive ? 'active' : 'inactive')
  const [openingAdvance, setOpeningAdvance] = useState(String(worker.openingAdvance ?? 0))

  const isPending = worker.pendingBalance > 0

  const handleSave = () => {
    startTransition(async () => {
      const fd = new FormData()
      fd.append('id', worker.id)
      fd.append('name', name)
      fd.append('phone', phone)
      fd.append('trade', trade)
      fd.append('dailyWage', dailyWage)
      fd.append('overtimeRate', overtimeRate)
      fd.append('openingAdvance', openingAdvance)
      fd.append('siteId', siteId)
      fd.append('status', status)
      await updateAction(fd)
      setOpen(false)
    })
  }

  const handleMarkPaid = () => {
    startTransition(async () => {
      const fd = new FormData()
      fd.append('id', worker.id)
      fd.append('amount', String(worker.pendingBalance))
      await markPaidAction(fd)
    })
  }

  const handleDeactivate = () => {
    if (!window.confirm(`Remove "${worker.name}" from active labour? All records are kept.`)) return
    startTransition(async () => {
      const fd = new FormData()
      fd.append('id', worker.id)
      fd.append('dangerConfirmed', 'true')
      await deactivateAction(fd)
    })
  }

  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/40 focus:border-[#fc6e20] bg-white"
  const labelCls = "block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1"

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${isPending && !open ? 'border-orange-200' : 'border-slate-200'}`}>
      {/* Collapsed header — always visible */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50/60 transition-colors select-none"
        onClick={() => setOpen(o => !o)}
      >
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-base flex-shrink-0 ${tradeColors[worker.trade] ?? 'bg-slate-100 text-slate-500'}`}>
          {worker.name.charAt(0).toUpperCase()}
        </div>

        {/* Name + trade */}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-800 truncate">{worker.name}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tradeColors[worker.trade] ?? 'bg-slate-100 text-slate-500'}`}>
              {worker.trade.replace(/_/g, ' ')}
            </span>
            <span className="text-xs text-slate-400">{worker.site.name}</span>
          </div>
        </div>

        {/* Financial summary */}
        <div className="hidden sm:flex items-center gap-6 flex-shrink-0">
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Daily Wage</div>
            <div className="text-sm font-bold text-slate-700">₹{worker.dailyWage.toLocaleString('en-IN')}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Days Present</div>
            <div className="text-sm font-bold text-slate-700">{worker.presentDays}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Advance Paid</div>
            <div className="text-sm font-bold text-slate-600">{fmt(worker.totalAdvances)}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Pending Salary</div>
            <div className={`text-sm font-black ${isPending ? 'text-orange-600' : 'text-emerald-600'}`}>
              {isPending ? fmt(worker.pendingBalance) : '✓ Paid'}
            </div>
          </div>
        </div>

        {/* Mark Paid + expand */}
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

      {/* Expanded inline edit form */}
      {open && (
        <div className="border-t border-slate-100 bg-slate-50/40 px-5 py-5">
          {/* Financial summary strip */}
          <div className="grid grid-cols-4 gap-3 mb-5 p-3 bg-white rounded-xl border border-slate-200">
            {[
              { label: 'Days Present', val: String(worker.presentDays), cls: 'text-slate-700' },
              { label: 'Total Earned', val: fmt(worker.earned), cls: 'text-slate-700' },
              { label: 'Advance Paid', val: fmt(worker.totalAdvances), cls: 'text-slate-700' },
              { label: 'Pending Balance', val: isPending ? fmt(worker.pendingBalance) : '✓ Settled', cls: isPending ? 'text-orange-600 font-black' : 'text-emerald-600 font-black' },
            ].map(f => (
              <div key={f.label} className="text-center">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">{f.label}</div>
                <div className={`text-sm font-bold ${f.cls}`}>{f.val}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="col-span-2 md:col-span-1">
              <label className={labelCls}>Full Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} placeholder="+91 99999 99999" />
            </div>
            <div>
              <label className={labelCls}>Trade</label>
              <select value={trade} onChange={e => setTrade(e.target.value)} className={inputCls}>
                {TRADES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Daily Wage (₹)</label>
              <input type="number" value={dailyWage} onChange={e => setDailyWage(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Overtime Rate (₹/hr)</label>
              <input type="number" value={overtimeRate} onChange={e => setOvertimeRate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Opening Advance (₹)</label>
              <input type="number" value={openingAdvance} onChange={e => setOpeningAdvance(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Assigned Site</label>
              <select value={siteId} onChange={e => setSiteId(e.target.value)} className={inputCls}>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={handleSave}
              disabled={pending}
              className="flex items-center gap-1.5 px-5 py-2 bg-[#fc6e20] hover:bg-[#e85b0d] text-white rounded-lg text-sm font-bold transition-colors shadow-sm disabled:opacity-50"
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : null}
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
              Remove Worker
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function LabourCardList({ workers, sites, updateAction, markPaidAction, deactivateAction }: Props) {
  return (
    <div className="space-y-3">
      {workers.map(w => (
        <WorkerCard
          key={w.id}
          worker={w}
          sites={sites}
          updateAction={updateAction}
          markPaidAction={markPaidAction}
          deactivateAction={deactivateAction}
        />
      ))}
    </div>
  )
}
