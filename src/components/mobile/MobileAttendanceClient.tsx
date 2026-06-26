'use client'

import { useState } from 'react'
import { addMobileWorkerAction, saveMobileAttendanceAction } from '@/actions/mobile-labour'
import { Users, Plus, CheckCircle2, Clock, X, HardHat, Building2, IndianRupee, ShieldCheck, Check } from 'lucide-react'

type LabourItem = {
  id: string
  name: string
  trade: string
  dailyRate: number
  siteId: string
  siteName: string
  status: string
}

type SiteOption = {
  id: string
  name: string
}

const TRADES = [
  'MASON', 'HELPER', 'CARPENTER', 'BAR_BENDER',
  'ELECTRICIAN', 'PLUMBER', 'PAINTER', 'TILE_WORKER', 'WELDER'
]

export default function MobileAttendanceClient({
  initialLabour,
  sites
}: {
  initialLabour: LabourItem[]
  sites: SiteOption[]
}) {
  const [labourList, setLabourList] = useState<LabourItem[]>(initialLabour)
  const [statuses, setStatuses] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    initialLabour.forEach(l => { if (l.status) map[l.id] = l.status })
    return map
  })

  // Add Worker Form State
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTrade, setNewTrade] = useState('HELPER')
  const [newRate, setNewRate] = useState('650')
  const [newSiteId, setNewSiteId] = useState(sites[0]?.id || '')
  const [adding, setAdding] = useState(false)

  // Save Muster State
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')

  const toggleStatus = (id: string, st: string) => {
    setStatuses(prev => ({
      ...prev,
      [id]: prev[id] === st ? '' : st
    }))
  }

  const handleAddWorker = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || !newSiteId) return
    setAdding(true)
    try {
      const res = await addMobileWorkerAction({
        name: newName,
        trade: newTrade,
        dailyRate: Number(newRate) || 650,
        siteId: newSiteId
      })
      if (res.success && res.worker) {
        const selSite = sites.find(s => s.id === newSiteId)
        const newItem: LabourItem = {
          id: res.worker.id,
          name: res.worker.name,
          trade: res.worker.trade,
          dailyRate: Number(res.worker.dailyWage || 650),
          siteId: res.worker.siteId,
          siteName: selSite?.name || 'Assigned Site',
          status: 'PRESENT'
        }
        setLabourList(prev => [newItem, ...prev])
        setStatuses(prev => ({ ...prev, [res.worker.id]: 'PRESENT' }))
        setNewName('')
        setShowAddForm(false)
      }
    } catch (err: any) {
      alert(err.message || 'Failed to add worker')
    } finally {
      setAdding(false)
    }
  }

  const handleSaveMuster = async () => {
    setSaving(true)
    setSavedMessage('')
    try {
      const payload = labourList.map(l => ({
        labourId: l.id,
        siteId: l.siteId,
        status: statuses[l.id] || ''
      }))
      const res = await saveMobileAttendanceAction(payload)
      if (res.success) {
        setSavedMessage(`✓ Muster roll saved (${res.count} marked)`)
        setTimeout(() => setSavedMessage(''), 3500)
      }
    } catch (err: any) {
      alert(err.message || 'Failed to save attendance')
    } finally {
      setSaving(false)
    }
  }

  const presentCount = Object.values(statuses).filter(s => s === 'PRESENT').length
  const halfCount = Object.values(statuses).filter(s => s === 'HALF_DAY').length
  const absentCount = labourList.length - presentCount - halfCount

  return (
    <div className="space-y-6 select-none">
      {/* Live Telemetry Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-3.5 text-center shadow-sm">
          <div className="text-xl font-black text-emerald-700">{presentCount}</div>
          <div className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider mt-0.5">Present</div>
        </div>
        <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-3.5 text-center shadow-sm">
          <div className="text-xl font-black text-amber-700">{halfCount}</div>
          <div className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider mt-0.5">Half Day</div>
        </div>
        <div className="bg-rose-50 border border-rose-200/80 rounded-2xl p-3.5 text-center shadow-sm">
          <div className="text-xl font-black text-rose-700">{absentCount}</div>
          <div className="text-[10px] font-extrabold text-rose-800 uppercase tracking-wider mt-0.5">Absent</div>
        </div>
      </div>

      {/* Action Bar: Add Employee Option */}
      <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2.5 pl-1">
          <HardHat size={18} className="text-blue-600" />
          <span className="text-xs font-black text-slate-800 uppercase tracking-wide">Daily Muster Roll</span>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-extrabold rounded-xl shadow-md shadow-blue-600/25 flex items-center gap-1.5 transition-all border-none cursor-pointer"
        >
          {showAddForm ? <X size={15} /> : <Plus size={15} strokeWidth={3} />}
          <span>{showAddForm ? 'Close Form' : 'Add Employee'}</span>
        </button>
      </div>

      {/* Expandable Add New Employee Inline Form */}
      {showAddForm && (
        <form onSubmit={handleAddWorker} className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-5 rounded-3xl text-white shadow-xl space-y-4 border border-blue-500/30 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="text-xs font-black uppercase tracking-wider text-amber-300">New Field Worker Registration</div>
            <span className="text-[10px] text-slate-400">Instantly joins today&apos;s muster</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-slate-300 block mb-1">Worker Full Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Murugan M or Suresh Mason"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-slate-500 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 box-border"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Trade Category</label>
                <select
                  value={newTrade}
                  onChange={e => setNewTrade(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-white/15 text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 box-border"
                >
                  {TRADES.map(t => (
                    <option key={t} value={t} className="bg-slate-900 text-white font-bold">{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Daily Wage (₹)</label>
                <input
                  type="number"
                  required
                  value={newRate}
                  onChange={e => setNewRate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 box-border"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-300 block mb-1">Assigned Site</label>
              <select
                value={newSiteId}
                onChange={e => setNewSiteId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-white/15 text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 box-border"
              >
                {sites.map(s => (
                  <option key={s.id} value={s.id} className="bg-slate-900 text-white font-bold">{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={adding}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 active:scale-98 disabled:opacity-50 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all border-none cursor-pointer mt-2 flex items-center justify-center gap-2"
          >
            {adding ? <span>Adding Roster Record...</span> : (
              <>
                <Check size={16} strokeWidth={3} />
                <span>Save Worker & Mark Present</span>
              </>
            )}
          </button>
        </form>
      )}

      {/* Roster Checklist Feed */}
      <div className="space-y-2.5">
        {labourList.map(worker => {
          const st = statuses[worker.id]
          const isP = st === 'PRESENT'
          const isHD = st === 'HALF_DAY'
          const isA = st === 'ABSENT'

          return (
            <div key={worker.id} className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold text-slate-900 truncate">{worker.name}</span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-wider flex-shrink-0">
                    {worker.trade}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400 mt-1 truncate">
                  <Building2 size={12} className="text-blue-500 flex-shrink-0" />
                  <span className="truncate">{worker.siteName}</span>
                  <span>·</span>
                  <span className="font-bold text-slate-600">₹{worker.dailyRate}/day</span>
                </div>
              </div>

              {/* Attendance Quick-Buttons */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => toggleStatus(worker.id, 'PRESENT')}
                  className={`w-10 h-10 rounded-xl font-black text-xs transition-all border cursor-pointer flex items-center justify-center active:scale-90 ${
                    isP
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/30 ring-2 ring-emerald-200'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200/80'
                  }`}
                >
                  P
                </button>
                <button
                  onClick={() => toggleStatus(worker.id, 'HALF_DAY')}
                  className={`w-10 h-10 rounded-xl font-black text-xs transition-all border cursor-pointer flex items-center justify-center active:scale-90 ${
                    isHD
                      ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/30 ring-2 ring-amber-200'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200/80'
                  }`}
                >
                  ½
                </button>
                <button
                  onClick={() => toggleStatus(worker.id, 'ABSENT')}
                  className={`w-10 h-10 rounded-xl font-black text-xs transition-all border cursor-pointer flex items-center justify-center active:scale-90 ${
                    isA
                      ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/30 ring-2 ring-rose-200'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200/80'
                  }`}
                >
                  A
                </button>
              </div>
            </div>
          )
        })}

        {labourList.length === 0 && (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm space-y-3">
            <Users className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="font-bold text-slate-800 text-sm">No Workers on Roster</div>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">Tap &quot;Add Employee&quot; above to enroll your first site mason or helper into today&apos;s muster.</p>
          </div>
        )}
      </div>

      {/* Sticky Save Action Bar */}
      <div className="sticky bottom-4 z-40 pt-4">
        {savedMessage ? (
          <div className="p-4 rounded-2xl bg-emerald-600 text-white font-black text-center text-xs shadow-xl flex items-center justify-center gap-2 animate-in zoom-in-95 duration-200">
            <ShieldCheck size={18} />
            <span>{savedMessage}</span>
          </div>
        ) : (
          <button
            onClick={handleSaveMuster}
            disabled={saving || labourList.length === 0}
            className="w-full py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-slate-900 hover:from-blue-700 hover:to-slate-950 active:scale-98 disabled:opacity-50 text-white font-black text-sm rounded-2xl shadow-xl shadow-blue-900/25 transition-all border-none cursor-pointer flex items-center justify-center gap-2"
          >
            {saving ? <span>Submitting Muster Roll...</span> : (
              <>
                <CheckCircle2 size={18} className="text-amber-300" />
                <span>Save & Submit Today&apos;s Attendance</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
