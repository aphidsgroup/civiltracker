'use client'

import { useState } from 'react'
import { addMobileWorkerAction, updateWorkerAction, saveMobileAttendanceAction } from '@/actions/mobile-labour'
import { Users, Plus, CheckCircle2, X, HardHat, Building2, ShieldCheck, Check, Edit3, IndianRupee, Wallet } from 'lucide-react'

type LabourItem = {
  id: string
  name: string
  trade: string
  phone: string | null
  dailyRate: number
  siteId: string
  siteName: string
  status: string
  advance: number
}

type SiteOption = {
  id: string
  name: string
}

const STANDARD_TRADES = [
  'MASON', 'HELPER', 'CARPENTER', 'BAR_BENDER',
  'ELECTRICIAN', 'PLUMBER', 'PAINTER', 'TILE_WORKER', 'WELDER', 'SUPERVISOR'
]

function getDisplayTrade(worker: { trade: string; phone?: string | null }) {
  if (worker.phone && worker.phone.startsWith('CUSTOM_TRADE:')) {
    return worker.phone.replace('CUSTOM_TRADE:', '')
  }
  return worker.trade
}

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
  const [advances, setAdvances] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {}
    initialLabour.forEach(l => { map[l.id] = l.advance || 0 })
    return map
  })

  // Add Worker Form State
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTrade, setNewTrade] = useState('HELPER')
  const [newCustomTrade, setNewCustomTrade] = useState('')
  const [newRate, setNewRate] = useState('650')
  const [newSiteId, setNewSiteId] = useState(sites[0]?.id || '')
  const [adding, setAdding] = useState(false)

  // Edit Worker State
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editTrade, setEditTrade] = useState('HELPER')
  const [editCustomTrade, setEditCustomTrade] = useState('')
  const [editRate, setEditRate] = useState('650')
  const [editSiteId, setEditSiteId] = useState('')
  const [editAdvance, setEditAdvance] = useState('0')
  const [updating, setUpdating] = useState(false)

  // Save Muster State
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')

  const toggleStatus = (id: string, st: string) => {
    setStatuses(prev => ({
      ...prev,
      [id]: prev[id] === st ? '' : st
    }))
  }

  const handleStartEdit = (worker: LabourItem) => {
    setEditingId(worker.id)
    setEditName(worker.name)
    setEditRate(String(worker.dailyRate))
    setEditSiteId(worker.siteId)
    setEditAdvance(String(advances[worker.id] || 0))

    if (worker.phone && worker.phone.startsWith('CUSTOM_TRADE:')) {
      setEditTrade('OTHERS')
      setEditCustomTrade(worker.phone.replace('CUSTOM_TRADE:', ''))
    } else {
      setEditTrade(worker.trade)
      setEditCustomTrade('')
    }
  }

  const handleAddWorker = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || !newSiteId) return
    if (newTrade === 'OTHERS' && !newCustomTrade.trim()) {
      alert('Please enter the custom trade name')
      return
    }
    setAdding(true)
    try {
      const res = await addMobileWorkerAction({
        name: newName,
        trade: newTrade,
        customTrade: newCustomTrade,
        dailyRate: Number(newRate) || 650,
        siteId: newSiteId
      })
      if (res.success && res.worker) {
        const selSite = sites.find(s => s.id === newSiteId)
        const newItem: LabourItem = {
          id: res.worker.id,
          name: res.worker.name,
          trade: res.worker.trade,
          phone: res.worker.phone,
          dailyRate: Number(res.worker.dailyWage || 650),
          siteId: res.worker.siteId,
          siteName: selSite?.name || 'Assigned Site',
          status: 'PRESENT',
          advance: 0
        }
        setLabourList(prev => [newItem, ...prev])
        setStatuses(prev => ({ ...prev, [res.worker.id]: 'PRESENT' }))
        setNewName('')
        setNewCustomTrade('')
        setShowAddForm(false)
      }
    } catch (err: any) {
      alert(err.message || 'Failed to add worker')
    } finally {
      setAdding(false)
    }
  }

  const handleUpdateWorker = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingId || !editName.trim() || !editSiteId) return
    if (editTrade === 'OTHERS' && !editCustomTrade.trim()) {
      alert('Please enter the custom trade name')
      return
    }
    setUpdating(true)
    try {
      const res = await updateWorkerAction({
        id: editingId,
        name: editName,
        trade: editTrade,
        customTrade: editCustomTrade,
        dailyWage: Number(editRate) || 650,
        siteId: editSiteId,
        advance: Number(editAdvance) || 0
      })
      if (res.success && res.worker) {
        const selSite = sites.find(s => s.id === editSiteId)
        setLabourList(prev => prev.map(w => {
          if (w.id === editingId) {
            return {
              ...w,
              name: res.worker.name,
              trade: res.worker.trade,
              phone: res.worker.phone,
              dailyRate: Number(res.worker.dailyWage || 650),
              siteId: res.worker.siteId,
              siteName: selSite?.name || w.siteName,
            }
          }
          return w
        }))
        setAdvances(prev => ({ ...prev, [editingId]: Number(editAdvance) || 0 }))
        setEditingId(null)
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update worker')
    } finally {
      setUpdating(false)
    }
  }

  const handleSaveMuster = async () => {
    setSaving(true)
    setSavedMessage('')
    try {
      const payload = labourList.map(l => ({
        labourId: l.id,
        siteId: l.siteId,
        status: statuses[l.id] || '',
        advance: advances[l.id] || 0
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
          onClick={() => { setShowAddForm(!showAddForm); setEditingId(null) }}
          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-extrabold rounded-xl shadow-md shadow-blue-600/25 flex items-center gap-1.5 transition-all border-none cursor-pointer"
        >
          {showAddForm ? <X size={15} /> : <Plus size={15} strokeWidth={3} />}
          <span>{showAddForm ? 'Close Form' : 'Add Employee'}</span>
        </button>
      </div>

      {/* Expandable Add New Employee Form */}
      {showAddForm && (
        <form onSubmit={handleAddWorker} className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-5 rounded-3xl text-white shadow-xl space-y-4 border border-blue-500/30 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="text-xs font-black uppercase tracking-wider text-amber-300">New Field Worker Registration</div>
            <span className="text-[10px] text-slate-400">Instantly joins roster</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-slate-300 block mb-1">Worker Full Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Murugan M"
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
                  {STANDARD_TRADES.map(t => (
                    <option key={t} value={t} className="bg-slate-900 text-white font-bold">{t}</option>
                  ))}
                  <option value="OTHERS" className="bg-amber-600 text-white font-black">✨ OTHERS (Type custom)</option>
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

            {newTrade === 'OTHERS' && (
              <div className="animate-in fade-in duration-200">
                <label className="text-[11px] font-black text-amber-300 block mb-1">Type Custom Trade Category</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Glass Fitter, Crane Operator, Scaffolder"
                  value={newCustomTrade}
                  onChange={e => setNewCustomTrade(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-200 placeholder:text-amber-300/50 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-400 box-border"
                />
              </div>
            )}

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
            {adding ? <span>Saving Worker...</span> : (
              <>
                <Check size={16} strokeWidth={3} />
                <span>Save Worker & Mark Present</span>
              </>
            )}
          </button>
        </form>
      )}

      {/* Roster Checklist Feed */}
      <div className="space-y-3">
        {labourList.map(worker => {
          const st = statuses[worker.id]
          const isP = st === 'PRESENT'
          const isHD = st === 'HALF_DAY'
          const isA = st === 'ABSENT'
          const isEditing = editingId === worker.id
          const adv = advances[worker.id] || 0
          const displayTradeName = getDisplayTrade(worker)

          return (
            <div key={worker.id} className={`rounded-2xl transition-all border overflow-hidden ${isEditing ? 'bg-slate-900 text-white border-blue-500 shadow-xl ring-2 ring-blue-500/30 p-5' : 'bg-white text-slate-900 border-slate-200/80 shadow-sm p-4'}`}>
              {!isEditing ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-slate-900 truncate">{worker.name}</span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-wider flex-shrink-0">
                        {displayTradeName}
                      </span>
                      <button
                        onClick={() => { handleStartEdit(worker); setShowAddForm(false) }}
                        className="w-6 h-6 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 flex items-center justify-center border-none cursor-pointer p-0 flex-shrink-0 ml-1 active:scale-90 transition-all"
                        title="Edit details, wage & advance"
                      >
                        <Edit3 size={13} strokeWidth={2.5} />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400 mt-1.5 flex-wrap">
                      <div className="flex items-center gap-1 text-slate-600 font-bold">
                        <IndianRupee size={11} className="text-emerald-600" />
                        <span>₹{worker.dailyRate}/day</span>
                      </div>
                      <span>·</span>
                      <div className={`flex items-center gap-1 font-extrabold px-2 py-0.5 rounded ${adv > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200/60' : 'text-slate-400'}`}>
                        <Wallet size={11} className={adv > 0 ? 'text-amber-600' : 'text-slate-300'} />
                        <span>{adv > 0 ? `Advance: ₹${adv}` : 'No Advance'}</span>
                      </div>
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
              ) : (
                /* Inline Edit Worker Card */
                <form onSubmit={handleUpdateWorker} className="space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="text-xs font-black uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                      <Edit3 size={14} />
                      <span>Editing {worker.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center border-none cursor-pointer p-0"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">Full Name</label>
                      <input
                        type="text"
                        required
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 box-border"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">Trade Category</label>
                        <select
                          value={editTrade}
                          onChange={e => setEditTrade(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/20 text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 box-border"
                        >
                          {STANDARD_TRADES.map(t => (
                            <option key={t} value={t} className="bg-slate-900 text-white font-bold">{t}</option>
                          ))}
                          <option value="OTHERS" className="bg-amber-600 text-white font-black">✨ OTHERS (Custom)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">Daily Wage (₹)</label>
                        <input
                          type="number"
                          required
                          value={editRate}
                          onChange={e => setEditRate(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 box-border"
                        >
                        </input>
                      </div>
                    </div>

                    {editTrade === 'OTHERS' && (
                      <div className="animate-in fade-in duration-200">
                        <label className="text-[11px] font-black text-amber-300 block mb-1">Custom Trade Category Name</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Glass Fitter, Crane Operator"
                          value={editCustomTrade}
                          onChange={e => setEditCustomTrade(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-400 box-border"
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">Assigned Site</label>
                        <select
                          value={editSiteId}
                          onChange={e => setEditSiteId(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/20 text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 box-border"
                        >
                          {sites.map(s => (
                            <option key={s.id} value={s.id} className="bg-slate-900 text-white font-bold">{s.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-black text-amber-300 block mb-1">Today&apos;s Advance (₹)</label>
                        <input
                          type="number"
                          placeholder="0"
                          value={editAdvance}
                          onChange={e => setEditAdvance(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-400/30 text-amber-300 font-mono font-black text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 box-border"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={updating}
                      className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 active:scale-95 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-lg transition-all border-none cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {updating ? <span>Updating...</span> : (
                        <>
                          <Check size={15} strokeWidth={3} />
                          <span>Save Changes & Advance</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-slate-300 font-bold text-xs rounded-xl border-none cursor-pointer transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )
        })}

        {labourList.length === 0 && (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm space-y-3">
            <Users className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="font-bold text-slate-800 text-sm">No Workers on Roster</div>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">Tap &quot;Add Employee&quot; above to enroll your first worker.</p>
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
