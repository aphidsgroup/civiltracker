'use client'

import { useState } from 'react'
import { addMobileWorkerAction, updateWorkerAction, saveMobileAttendanceAction, addExistingWorkerToRoster, saveContractorAttendance, removeLabourAttendanceAction, removeContractorAttendanceAction } from '@/actions/mobile-labour'
import { Users, Plus, CheckCircle2, X, HardHat, Building2, ShieldCheck, Check, Edit3, IndianRupee, Wallet, Search, Briefcase, Trash2 } from 'lucide-react'

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
  startTime: string | null
}

type ContractorItem = {
  id: string
  name: string
  trade: string
  labourCount: number
  advance: number
  siteId: string
  startTime: string | null
}

type SiteOption = {
  id: string
  name: string
}

const STANDARD_TRADES = [
  'MASON', 'HELPER', 'CARPENTER', 'BAR_BENDER',
  'ELECTRICIAN', 'PLUMBER', 'PAINTER', 'TILE_WORKER', 'WELDER', 'SUPERVISOR'
]

const CONTRACTOR_TYPES = [
  'SHUTTERING', 'BAR_BENDING', 'BRICKWORK', 'PLASTERING', 'PAINTING',
  'ELECTRICAL', 'PLUMBING', 'FLOORING', 'FABRICATION', 'EXCAVATION'
]

function getDisplayTrade(worker: { trade: string; phone?: string | null }) {
  if (worker.phone && worker.phone.startsWith('CUSTOM_TRADE:')) {
    return worker.phone.replace('CUSTOM_TRADE:', '')
  }
  return worker.trade
}

export default function MobileAttendanceClient({
  todayRoster,
  otherWorkers,
  initialContractors,
  sites
}: {
  todayRoster: LabourItem[]
  otherWorkers: LabourItem[]
  initialContractors: ContractorItem[]
  sites: SiteOption[]
}) {
  const [labourList, setLabourList] = useState<LabourItem[]>(todayRoster)
  const [availableWorkers, setAvailableWorkers] = useState<LabourItem[]>(otherWorkers)
  const [contractorList, setContractorList] = useState<ContractorItem[]>(initialContractors)
  
  const [statuses, setStatuses] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    todayRoster.forEach(l => { if (l.status) map[l.id] = l.status })
    return map
  })
  const [advances, setAdvances] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {}
    todayRoster.forEach(l => { map[l.id] = l.advance || 0 })
    return map
  })
  const [startTimes, setStartTimes] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    todayRoster.forEach(l => { if (l.startTime) map[l.id] = l.startTime })
    return map
  })

  // Add Worker Modal State
  const [showAddForm, setShowAddForm] = useState(false)
  const [addTab, setAddTab] = useState<'EXISTING' | 'NEW'>('EXISTING')
  const [searchQuery, setSearchQuery] = useState('')
  const [newName, setNewName] = useState('')
  const [newTrade, setNewTrade] = useState('HELPER')
  const [newCustomTrade, setNewCustomTrade] = useState('')
  const [newRate, setNewRate] = useState('650')
  const [newSiteId, setNewSiteId] = useState(sites[0]?.id || '')
  const [newStartTime, setNewStartTime] = useState(() => {
    const now = new Date()
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  })
  const [adding, setAdding] = useState(false)
  
  // Existing list bulk start time
  const [existStartTime, setExistStartTime] = useState(() => {
    const now = new Date()
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  })

  // Edit Worker State
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editTrade, setEditTrade] = useState('HELPER')
  const [editCustomTrade, setEditCustomTrade] = useState('')
  const [editRate, setEditRate] = useState('650')
  const [editSiteId, setEditSiteId] = useState('')
  const [editAdvance, setEditAdvance] = useState('0')
  const [editStartTime, setEditStartTime] = useState('')
  const [updating, setUpdating] = useState(false)

  // Contractor State
  const [showContractorForm, setShowContractorForm] = useState(false)
  const [conName, setConName] = useState('')
  const [conType, setConType] = useState('SHUTTERING')
  const [conCustomType, setConCustomType] = useState('')
  const [conCount, setConCount] = useState('10')
  const [conAdvance, setConAdvance] = useState('0')
  const [conSiteId, setConSiteId] = useState(sites[0]?.id || '')
  const [conStartTime, setConStartTime] = useState(() => {
    const now = new Date()
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  })
  const [addingContractor, setAddingContractor] = useState(false)

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
    setEditStartTime(startTimes[worker.id] || '')

    if (worker.phone && worker.phone.startsWith('CUSTOM_TRADE:')) {
      setEditTrade('OTHERS')
      setEditCustomTrade(worker.phone.replace('CUSTOM_TRADE:', ''))
    } else {
      setEditTrade(worker.trade)
      setEditCustomTrade('')
    }
  }

  const handleAddExisting = async (worker: LabourItem) => {
    setAdding(true)
    try {
      const res = await addExistingWorkerToRoster(worker.id, newSiteId || worker.siteId, existStartTime)
      if (res.success) {
        const selSite = sites.find(s => s.id === (newSiteId || worker.siteId))
        const newItem = { ...worker, status: 'PRESENT', advance: 0, startTime: existStartTime, siteId: selSite?.id || worker.siteId, siteName: selSite?.name || worker.siteName }
        setLabourList(prev => [newItem, ...prev])
        setStatuses(prev => ({ ...prev, [worker.id]: 'PRESENT' }))
        setAdvances(prev => ({ ...prev, [worker.id]: 0 }))
        setStartTimes(prev => ({ ...prev, [worker.id]: existStartTime }))
        setAvailableWorkers(prev => prev.filter(w => w.id !== worker.id))
        setShowAddForm(false)
      }
    } catch (err: any) {
      alert(err.message || 'Failed to add worker')
    } finally {
      setAdding(false)
    }
  }

  const handleAddNewWorker = async (e: React.FormEvent) => {
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
        siteId: newSiteId,
        startTime: newStartTime
      })
      if (res.success && res.worker) {
        // Now also add them to today's roster
        await addExistingWorkerToRoster(res.worker.id, newSiteId)
        
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
          advance: 0,
          startTime: newStartTime
        }
        setLabourList(prev => [newItem, ...prev])
        setStatuses(prev => ({ ...prev, [res.worker.id]: 'PRESENT' }))
        setAdvances(prev => ({ ...prev, [res.worker.id]: 0 }))
        setStartTimes(prev => ({ ...prev, [res.worker.id]: newStartTime }))
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

  const handleAddContractor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!conName.trim() || !conCount || !conSiteId) return
    if (conType === 'OTHERS' && !conCustomType.trim()) {
      alert('Please enter custom contractor type')
      return
    }
    setAddingContractor(true)
    try {
      const finalType = conType === 'OTHERS' ? conCustomType : conType
      const res = await saveContractorAttendance({
        siteId: conSiteId,
        contractorName: conName,
        contractorType: finalType,
        labourCount: Number(conCount),
        dailyAdvance: Number(conAdvance) || 0,
        startTime: conStartTime
      })
      if (res.success && res.attendance) {
        const newItem: ContractorItem = {
          id: res.attendance.id,
          name: conName,
          trade: finalType,
          labourCount: Number(conCount),
          advance: Number(conAdvance) || 0,
          siteId: conSiteId,
          startTime: conStartTime
        }
        setContractorList(prev => [newItem, ...prev])
        setConName('')
        setConCount('10')
        setConAdvance('0')
        setConCustomType('')
        setShowContractorForm(false)
      }
    } catch (err: any) {
      alert(err.message || 'Failed to add contractor')
    } finally {
      setAddingContractor(false)
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
        setStartTimes(prev => ({ ...prev, [editingId]: editStartTime }))
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
        advance: advances[l.id] || 0,
        startTime: startTimes[l.id] || undefined
      }))
      const res = await saveMobileAttendanceAction(payload)
      if (res.success) {
        setSavedMessage(`✓ Saved internal attendance`)
        setTimeout(() => setSavedMessage(''), 3500)
      }
    } catch (err: any) {
      alert(err.message || 'Error saving muster roll')
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveLabour = async (workerId: string) => {
    if (!window.confirm("Remove from today's roster?")) return
    try {
      const res = await removeLabourAttendanceAction(workerId)
      if (res.success) {
        setLabourList(prev => prev.filter(w => w.id !== workerId))
      }
    } catch (e) {
      alert('Failed to remove')
    }
  }

  const handleRemoveContractor = async (attendanceId: string) => {
    if (!window.confirm("Delete contractor log for today?")) return
    try {
      const res = await removeContractorAttendanceAction(attendanceId)
      if (res.success) {
        setContractorList(prev => prev.filter(c => c.id !== attendanceId))
      }
    } catch (e) {
      alert('Failed to delete')
    }
  }

  const presentCount = Object.values(statuses).filter(s => s === 'PRESENT').length
  const halfCount = Object.values(statuses).filter(s => s === 'HALF_DAY').length
  
  const contractorLabourCount = contractorList.reduce((acc, c) => acc + c.labourCount, 0)
  const totalOnsite = presentCount + halfCount + contractorLabourCount

  const filteredAvailable = availableWorkers.filter(w => 
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    getDisplayTrade(w).toLowerCase().includes(searchQuery.toLowerCase())
  )

  const isCompletelyEmpty = labourList.length === 0 && contractorList.length === 0;

  if (isCompletelyEmpty && !showAddForm && !showContractorForm) {
    return (
      <div className="space-y-6 select-none pb-24 mt-8 px-4">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Today's Roster</h2>
          <p className="text-sm font-bold text-slate-400 mt-2">Your roster is currently empty.<br/>Add your workforce to begin.</p>
        </div>

        <button
          onClick={() => { setShowAddForm(true); setAddTab('EXISTING') }}
          className="w-full py-5 bg-white border-2 border-emerald-500 rounded-3xl shadow-xl shadow-emerald-900/10 active:scale-95 transition-all flex flex-col items-center justify-center gap-2 group cursor-pointer"
        >
          <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
            <HardHat size={28} strokeWidth={2.5} />
          </div>
          <div className="text-lg font-black text-slate-800">Add Own Labour</div>
          <div className="text-xs font-bold text-slate-400">From existing list or create new</div>
        </button>

        <button
          onClick={() => setShowContractorForm(true)}
          className="w-full py-5 bg-white border-2 border-blue-500 rounded-3xl shadow-xl shadow-blue-900/10 active:scale-95 transition-all flex flex-col items-center justify-center gap-2 group cursor-pointer mt-4"
        >
          <div className="w-14 h-14 bg-[#fff7ed] rounded-2xl flex items-center justify-center text-[#fc6e20] group-hover:scale-110 transition-transform">
            <Briefcase size={28} strokeWidth={2.5} />
          </div>
          <div className="text-lg font-black text-slate-800">Add Contractor Team</div>
          <div className="text-xs font-bold text-slate-400">Log an outside contractor & headcount</div>
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 select-none pb-24">
      {/* Live Telemetry Summary */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <div className="text-3xl font-black text-slate-900 leading-none">{totalOnsite}</div>
          <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mt-1">Total Labour Onsite</div>
        </div>
        <div className="flex gap-2 text-right">
          <div className="bg-emerald-50 px-3 py-2 rounded-2xl border border-emerald-100">
            <div className="text-sm font-black text-emerald-700">{presentCount + halfCount}</div>
            <div className="text-[9px] font-black text-emerald-600 uppercase">Own</div>
          </div>
          <div className="bg-[#fff7ed] px-3 py-2 rounded-2xl border border-blue-100">
            <div className="text-sm font-black text-[#e85b0d]">{contractorLabourCount}</div>
            <div className="text-[9px] font-black text-[#fc6e20] uppercase">Contr.</div>
          </div>
        </div>
      </div>

      {/* OWN LABOUR SECTION */}
      <div className="space-y-3">
        <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2.5 pl-1">
            <HardHat size={18} className="text-emerald-600" />
            <span className="text-xs font-black text-slate-800 uppercase tracking-wide">Own Labour Roster</span>
          </div>
          <button
            onClick={() => { setShowAddForm(!showAddForm); setShowContractorForm(false); setEditingId(null); if (!showAddForm) setAddTab('EXISTING'); }}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white text-[11px] font-extrabold rounded-xl shadow-md flex items-center gap-1.5 transition-all border-none cursor-pointer"
          >
            {showAddForm ? <X size={14} /> : <Plus size={14} strokeWidth={3} />}
            <span>{showAddForm ? 'Close' : 'Add Labour'}</span>
          </button>
        </div>

        {/* Add Labour Modal/Form */}
        {showAddForm && (
          <div className="bg-white p-1 rounded-3xl border border-slate-200 shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex p-1 bg-slate-100 rounded-2xl mb-3">
              <button
                onClick={() => setAddTab('EXISTING')}
                className={`flex-1 py-2 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all ${addTab === 'EXISTING' ? 'bg-white text-[#fc6e20] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Existing List
              </button>
              <button
                onClick={() => setAddTab('NEW')}
                className={`flex-1 py-2 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all ${addTab === 'NEW' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Create New
              </button>
            </div>

            <div className="p-3">
              {addTab === 'EXISTING' ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input 
                        type="text" 
                        placeholder="Search existing workers..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] box-border"
                      />
                    </div>
                    <div className="w-28 flex-shrink-0">
                      <input 
                        type="time" 
                        value={existStartTime}
                        onChange={e => setExistStartTime(e.target.value)}
                        className="w-full px-3 py-2.5 bg-[#fff7ed]/50 border border-blue-200 rounded-xl text-sm font-bold text-[#e85b0d] focus:outline-none focus:ring-2 focus:ring-[#fc6e20] box-border"
                      />
                    </div>
                  </div>
                  <div className="max-h-[250px] overflow-y-auto space-y-2 pr-1">
                    {filteredAvailable.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-xs font-bold">No available workers found.</div>
                    ) : filteredAvailable.map(w => (
                      <div key={`avail-${w.id}`} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-300 transition-colors">
                        <div>
                          <div className="text-sm font-black text-slate-800">{w.name}</div>
                          <div className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">{getDisplayTrade(w)} • ₹{w.dailyRate}</div>
                        </div>
                        <button
                          onClick={() => handleAddExisting(w)}
                          disabled={adding}
                          className="px-3 py-1.5 bg-[#fff7ed] hover:bg-[#fff7ed] text-[#e85b0d] text-xs font-black rounded-lg active:scale-95 transition-all disabled:opacity-50"
                        >
                          Add to Roster
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <form onSubmit={handleAddNewWorker} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">Full Name</label>
                      <input
                        type="text" required placeholder="e.g. Murugan M"
                        value={newName} onChange={e => setNewName(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#fc6e20] box-border"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">Trade</label>
                      <select
                        value={newTrade} onChange={e => setNewTrade(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#fc6e20] box-border"
                      >
                        {STANDARD_TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                        <option value="OTHERS">✨ OTHERS (Custom)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">Daily Wage (₹)</label>
                      <input
                        type="number" required value={newRate} onChange={e => setNewRate(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#fc6e20] box-border"
                      />
                    </div>
                    {newTrade === 'OTHERS' && (
                      <div className="col-span-2">
                        <label className="text-[11px] font-black text-amber-600 block mb-1">Custom Trade Category</label>
                        <input
                          type="text" required placeholder="e.g. Glass Fitter"
                          value={newCustomTrade} onChange={e => setNewCustomTrade(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 box-border"
                        />
                      </div>
                    )}
                    <div className="col-span-1">
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">Assigned Site</label>
                      <select
                        value={newSiteId} onChange={e => setNewSiteId(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#fc6e20] box-border"
                      >
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="col-span-1">
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">Start Time</label>
                      <input
                        type="time" value={newStartTime} onChange={e => setNewStartTime(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#fc6e20] box-border"
                      />
                    </div>
                  </div>
                  <button
                    type="submit" disabled={adding}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 active:scale-98 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-md transition-all mt-2"
                  >
                    {adding ? 'Saving...' : 'Register & Add to Roster'}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Own Labour Feed */}
        {labourList.map(worker => {
          const st = statuses[worker.id]
          const isP = st === 'PRESENT'
          const isHD = st === 'HALF_DAY'
          const isA = st === 'ABSENT'
          const isEditing = editingId === worker.id
          const adv = advances[worker.id] || 0

          return (
            <div key={worker.id} className={`rounded-2xl transition-all border overflow-hidden ${isEditing ? 'bg-slate-900 text-white border-blue-500 shadow-xl ring-2 ring-[#fc6e20]/30 p-5' : 'bg-white text-slate-900 border-slate-200/80 shadow-sm p-4'}`}>
              {!isEditing ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-slate-900 truncate">{worker.name}</span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[9px] font-black uppercase tracking-wider flex-shrink-0">
                        {getDisplayTrade(worker)}
                      </span>
                      <button
                        onClick={() => { handleStartEdit(worker); setShowAddForm(false); setShowContractorForm(false) }}
                        className="w-6 h-6 rounded-lg bg-[#fff7ed] hover:bg-[#fff7ed] text-[#fc6e20] flex items-center justify-center border-none cursor-pointer p-0 flex-shrink-0 ml-1 active:scale-90 transition-all"
                      >
                        <Edit3 size={13} strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={() => handleRemoveLabour(worker.id)}
                        className="w-6 h-6 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-500 flex items-center justify-center border-none cursor-pointer p-0 flex-shrink-0 ml-1 active:scale-90 transition-all"
                      >
                        <Trash2 size={13} strokeWidth={2.5} />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 mt-1.5 flex-wrap">
                      <div className="flex items-center gap-1 text-slate-600">
                        <IndianRupee size={10} className="text-emerald-600" />
                        <span>₹{worker.dailyRate}/day</span>
                      </div>
                      <span>·</span>
                      <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${adv > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200/60' : 'text-slate-400'}`}>
                        <Wallet size={10} className={adv > 0 ? 'text-amber-600' : 'text-slate-300'} />
                        <span>{adv > 0 ? `Advance: ₹${adv}` : 'No Advance'}</span>
                      </div>
                      {startTimes[worker.id] && (
                        <>
                          <span>·</span>
                          <span className="text-[#fc6e20] bg-[#fff7ed] px-1.5 py-0.5 rounded">
                            {startTimes[worker.id]}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => toggleStatus(worker.id, 'PRESENT')} className={`w-9 h-9 rounded-xl font-black text-xs transition-all border cursor-pointer flex items-center justify-center active:scale-90 ${isP ? 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>P</button>
                    <button onClick={() => toggleStatus(worker.id, 'HALF_DAY')} className={`w-9 h-9 rounded-xl font-black text-xs transition-all border cursor-pointer flex items-center justify-center active:scale-90 ${isHD ? 'bg-amber-500 text-white border-amber-500 ring-2 ring-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>½</button>
                    <button onClick={() => toggleStatus(worker.id, 'ABSENT')} className={`w-9 h-9 rounded-xl font-black text-xs transition-all border cursor-pointer flex items-center justify-center active:scale-90 ${isA ? 'bg-rose-600 text-white border-rose-600 ring-2 ring-rose-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>A</button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleUpdateWorker} className="space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="text-xs font-black uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                      <Edit3 size={14} /><span>Editing {worker.name}</span>
                    </div>
                    <button type="button" onClick={() => setEditingId(null)} className="w-7 h-7 rounded-full bg-white/10 text-slate-300 flex items-center justify-center"><X size={14} /></button>
                  </div>
                  {/* Edit Form Fields */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">Full Name</label>
                      <input type="text" required value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-xs font-bold focus:ring-2 focus:ring-blue-400 box-border" />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">Trade</label>
                      <select value={editTrade} onChange={e => setEditTrade(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/20 text-white text-xs font-bold focus:ring-2 focus:ring-blue-400 box-border">
                        {STANDARD_TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                        <option value="OTHERS">✨ OTHERS (Custom)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">Daily Wage (₹)</label>
                      <input type="number" required value={editRate} onChange={e => setEditRate(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-xs font-bold focus:ring-2 focus:ring-blue-400 box-border" />
                    </div>
                    {editTrade === 'OTHERS' && (
                      <div className="col-span-2">
                        <label className="text-[11px] font-black text-amber-300 block mb-1">Custom Trade Category</label>
                        <input type="text" required value={editCustomTrade} onChange={e => setEditCustomTrade(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs font-bold focus:ring-2 focus:ring-amber-400 box-border" />
                      </div>
                    )}
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">Assigned Site</label>
                      <select value={editSiteId} onChange={e => setEditSiteId(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/20 text-white text-xs font-bold focus:ring-2 focus:ring-blue-400 box-border">
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-black text-amber-300 block mb-1">Today's Advance (₹)</label>
                      <input type="number" placeholder="0" value={editAdvance} onChange={e => setEditAdvance(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-400/30 text-amber-300 font-black text-xs focus:ring-2 focus:ring-amber-400 box-border" />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">Start Time</label>
                      <input type="time" value={editStartTime} onChange={e => setEditStartTime(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/20 text-white text-xs font-bold focus:ring-2 focus:ring-blue-400 box-border" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button type="submit" disabled={updating} className="flex-1 py-2.5 bg-[#fc6e20] text-white font-black text-xs rounded-xl shadow-lg border-none"><Check size={15} className="inline mr-1 -mt-0.5" /> Save Changes</button>
                    <button type="button" onClick={() => setEditingId(null)} className="px-4 py-2.5 bg-white/10 text-slate-300 font-bold text-xs rounded-xl border-none">Cancel</button>
                  </div>
                </form>
              )}
            </div>
          )
        })}

        {labourList.length === 0 && (
          <div className="bg-slate-50 border border-dashed border-slate-300 rounded-3xl p-8 text-center">
            <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <div className="font-bold text-slate-600 text-sm">No own labour on roster today.</div>
            <p className="text-xs text-slate-400">Add from existing list or create new.</p>
          </div>
        )}
      </div>

      {/* OUTSIDE CONTRACTORS SECTION */}
      <div className="space-y-3 mt-8">
        <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-blue-200 shadow-sm">
          <div className="flex items-center gap-2.5 pl-1">
            <Briefcase size={18} className="text-[#fc6e20]" />
            <span className="text-xs font-black text-slate-800 uppercase tracking-wide">Outside Contractors</span>
          </div>
          <button
            onClick={() => { setShowContractorForm(!showContractorForm); setShowAddForm(false); setEditingId(null) }}
            className="px-3.5 py-2 bg-[#fc6e20] hover:bg-[#e85b0d] active:scale-95 text-white text-[11px] font-extrabold rounded-xl shadow-md shadow-blue-600/20 flex items-center gap-1.5 transition-all border-none cursor-pointer"
          >
            {showContractorForm ? <X size={14} /> : <Plus size={14} strokeWidth={3} />}
            <span>{showContractorForm ? 'Close' : 'Add Contractor'}</span>
          </button>
        </div>

        {showContractorForm && (
          <form onSubmit={handleAddContractor} className="bg-gradient-to-br from-blue-900 to-[#ea580c] p-5 rounded-3xl text-white shadow-xl space-y-4 border border-blue-500/30 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="text-xs font-black uppercase tracking-wider text-blue-300">Log Daily Contractor</div>
              <span className="text-[10px] text-blue-200/50">Today's Headcount</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[11px] font-bold text-blue-200 block mb-1">Contractor Name</label>
                <input type="text" required placeholder="e.g. Balaji Shuttering Works" value={conName} onChange={e => setConName(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-blue-200/40 text-xs font-bold focus:ring-2 focus:ring-blue-400 box-border" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-blue-200 block mb-1">Work Type</label>
                <select value={conType} onChange={e => setConType(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-white/15 text-white text-xs font-bold focus:ring-2 focus:ring-blue-400 box-border">
                  {CONTRACTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="OTHERS" className="bg-[#fc6e20] font-black">✨ OTHERS (Custom)</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-emerald-300 block mb-1">Labour Headcount</label>
                <input type="number" required min="1" value={conCount} onChange={e => setConCount(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-black focus:ring-2 focus:ring-emerald-400 box-border" />
              </div>
              {conType === 'OTHERS' && (
                <div className="col-span-2">
                  <label className="text-[11px] font-black text-amber-300 block mb-1">Custom Type</label>
                  <input type="text" required value={conCustomType} onChange={e => setConCustomType(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs font-bold box-border" />
                </div>
              )}
              <div className="col-span-1">
                <label className="text-[11px] font-black text-amber-300 block mb-1">Today's Advance Given (₹)</label>
                <input type="number" placeholder="0" value={conAdvance} onChange={e => setConAdvance(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-black focus:ring-2 focus:ring-amber-400 box-border" />
              </div>
              <div className="col-span-1">
                <label className="text-[11px] font-bold text-blue-200 block mb-1">Start Time</label>
                <input type="time" value={conStartTime} onChange={e => setConStartTime(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white text-xs font-bold focus:ring-2 focus:ring-blue-400 box-border" />
              </div>
            </div>
            <button type="submit" disabled={addingContractor} className="w-full py-3 bg-[#fc6e20] hover:bg-[#fc6e20] active:scale-98 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-md mt-2 flex justify-center items-center gap-1.5">
              {addingContractor ? 'Saving...' : <><Check size={16} strokeWidth={3} /> Save Contractor Log</>}
            </button>
          </form>
        )}

        {contractorList.map(c => (
          <div key={c.id} className="bg-white p-4 rounded-2xl border border-blue-100 shadow-sm flex items-center justify-between">
            <div className="flex-1 min-w-0 pr-3">
              <div className="text-sm font-black text-slate-800">{c.name}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 rounded bg-[#fff7ed] text-[#e85b0d] text-[9px] font-black uppercase tracking-wider">{c.trade}</span>
                {c.advance > 0 && <span className="text-[10px] font-bold text-amber-600">Advance: ₹{c.advance}</span>}
                {c.startTime && <span className="text-[10px] font-bold text-[#fc6e20] bg-[#fff7ed] px-1.5 py-0.5 rounded">{c.startTime}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="text-center bg-[#fff7ed] px-3 py-1.5 rounded-xl border border-blue-100">
                <div className="text-lg font-black text-[#e85b0d] leading-none">{c.labourCount}</div>
                <div className="text-[8px] font-black text-blue-500 uppercase tracking-wider mt-0.5">Workers</div>
              </div>
              <button
                onClick={() => handleRemoveContractor(c.id)}
                className="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-500 flex items-center justify-center border-none cursor-pointer p-0 active:scale-90 transition-all"
              >
                <Trash2 size={15} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        ))}

        {contractorList.length === 0 && (
          <div className="bg-slate-50 border border-dashed border-slate-300 rounded-3xl p-6 text-center">
            <Briefcase className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <div className="text-xs font-bold text-slate-500">No outside contractors logged today.</div>
          </div>
        )}
      </div>

      {/* Sticky Save Action Bar */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none z-40">
        <div className="max-w-lg mx-auto pointer-events-auto">
          {savedMessage ? (
            <div className="p-3.5 rounded-2xl bg-emerald-600 text-white font-black text-center text-xs shadow-xl flex items-center justify-center gap-2 animate-in zoom-in-95 duration-200">
              <ShieldCheck size={18} /><span>{savedMessage}</span>
            </div>
          ) : (
            <button
              onClick={handleSaveMuster}
              disabled={saving || labourList.length === 0}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white font-black text-sm rounded-2xl shadow-xl shadow-emerald-900/20 transition-all border-none flex items-center justify-center gap-2"
            >
              {saving ? 'Saving internal muster...' : <><CheckCircle2 size={18} /> Save Internal Attendance</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
