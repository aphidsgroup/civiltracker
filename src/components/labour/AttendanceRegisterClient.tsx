'use client'

import React, { useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { addMobileWorkerAction, updateWorkerAction, saveMobileAttendanceAction } from '@/actions/mobile-labour'
import { Check, X, Clock, UserCheck, Save, Plus, Edit3, Sparkles, Search, HardHat, Building2, Wallet, IndianRupee } from 'lucide-react'

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY'

interface Worker {
  id: string
  name: string
  phone: string | null
  trade: string
  dailyWage: number
  siteId: string
  site?: { id: string; name: string } | null
  status?: string
  overtimeHours?: number
  advance?: number
}

interface SiteOption {
  id: string
  name: string
}

interface AttendanceRegisterClientProps {
  initialLabour?: Worker[]
  labourList?: Worker[] // backwards compatibility
  sites?: SiteOption[]
  dateString: string
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

export default function AttendanceRegisterClient({
  initialLabour,
  labourList,
  sites = [],
  dateString
}: AttendanceRegisterClientProps) {
  const sourceList = initialLabour || labourList || []
  const fallbackList: Worker[] = sourceList.length > 0 ? sourceList : [
    { id: 'l-1', name: 'Rameshwar Yadav', phone: null, trade: 'MASON', dailyWage: 950, siteId: 's-1', site: { id: 's-1', name: 'Metro Heights Tower A' }, status: 'PRESENT', advance: 500 },
    { id: 'l-2', name: 'Suresh Manjhi', phone: null, trade: 'HELPER', dailyWage: 650, siteId: 's-1', site: { id: 's-1', name: 'Metro Heights Tower A' }, status: 'PRESENT', advance: 0 },
    { id: 'l-3', name: 'Dinesh Vishwakarma', phone: null, trade: 'CARPENTER', dailyWage: 900, siteId: 's-2', site: { id: 's-2', name: 'Green Valley Villas' }, status: 'HALF_DAY', advance: 200 },
    { id: 'l-4', name: 'Mukesh Glass Fitter', phone: 'CUSTOM_TRADE:Glass Fitter', trade: 'HELPER', dailyWage: 850, siteId: 's-1', site: { id: 's-1', name: 'Metro Heights Tower B' }, status: 'ABSENT', advance: 0 },
  ]

  const [workers, setWorkers] = useState<Worker[]>(fallbackList)
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>(() => {
    const init: Record<string, AttendanceStatus> = {}
    fallbackList.forEach(w => { init[w.id] = (w.status as AttendanceStatus) || 'PRESENT' })
    return init
  })
  const [overtime, setOvertime] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    fallbackList.forEach(w => { init[w.id] = w.overtimeHours || 0 })
    return init
  })
  const [advances, setAdvances] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    fallbackList.forEach(w => { init[w.id] = w.advance || 0 })
    return init
  })

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTrade, setSelectedTrade] = useState('ALL')

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTrade, setNewTrade] = useState('HELPER')
  const [newCustomTrade, setNewCustomTrade] = useState('')
  const [newWage, setNewWage] = useState('650')
  const [newSiteId, setNewSiteId] = useState(sites[0]?.id || 's-1')
  const [adding, setAdding] = useState(false)

  const [editingWorker, setEditingWorker] = useState<Worker | null>(null)
  const [editName, setEditName] = useState('')
  const [editTrade, setEditTrade] = useState('HELPER')
  const [editCustomTrade, setEditCustomTrade] = useState('')
  const [editWage, setEditWage] = useState('650')
  const [editSiteId, setEditSiteId] = useState('')
  const [editAdv, setEditAdv] = useState('0')
  const [updating, setUpdating] = useState(false)

  // Save State
  const [isSaving, setIsSaving] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)

  const handleStatusChange = (id: string, st: AttendanceStatus) => {
    setAttendance(prev => ({ ...prev, [id]: st }))
    setSavedSuccess(false)
  }

  const handleOvertimeChange = (id: string, h: number) => {
    setOvertime(prev => ({ ...prev, [id]: Math.max(0, Math.min(12, h)) }))
    setSavedSuccess(false)
  }

  const handleAdvanceChange = (id: string, val: string) => {
    const num = Number(val) || 0
    setAdvances(prev => ({ ...prev, [id]: num }))
    setSavedSuccess(false)
  }

  const handleOpenEdit = (w: Worker) => {
    setEditingWorker(w)
    setEditName(w.name)
    setEditWage(String(w.dailyWage))
    setEditSiteId(w.siteId || sites[0]?.id || 's-1')
    setEditAdv(String(advances[w.id] || 0))

    if (w.phone && w.phone.startsWith('CUSTOM_TRADE:')) {
      setEditTrade('OTHERS')
      setEditCustomTrade(w.phone.replace('CUSTOM_TRADE:', ''))
    } else {
      setEditTrade(w.trade)
      setEditCustomTrade('')
    }
  }

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || !newSiteId) return
    if (newTrade === 'OTHERS' && !newCustomTrade.trim()) {
      alert('Please enter custom trade name')
      return
    }
    setAdding(true)
    try {
      const res = await addMobileWorkerAction({
        name: newName,
        trade: newTrade,
        customTrade: newCustomTrade,
        dailyRate: Number(newWage) || 650,
        siteId: newSiteId
      })
      if (res.success && res.worker) {
        const selSite = sites.find(s => s.id === newSiteId)
        const nw: Worker = {
          id: res.worker.id,
          name: res.worker.name,
          trade: res.worker.trade,
          phone: res.worker.phone,
          dailyWage: Number(res.worker.dailyWage || 650),
          siteId: res.worker.siteId,
          site: selSite ? { id: selSite.id, name: selSite.name } : { id: 's-1', name: 'Assigned Site' }
        }
        setWorkers(prev => [nw, ...prev])
        setAttendance(prev => ({ ...prev, [res.worker.id]: 'PRESENT' }))
        setAdvances(prev => ({ ...prev, [res.worker.id]: 0 }))
        setShowAddModal(false)
        setNewName('')
        setNewCustomTrade('')
      }
    } catch (err: any) {
      alert(err.message || 'Failed to add worker')
    } finally {
      setAdding(false)
    }
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingWorker || !editName.trim() || !editSiteId) return
    if (editTrade === 'OTHERS' && !editCustomTrade.trim()) {
      alert('Please enter custom trade name')
      return
    }
    setUpdating(true)
    try {
      const res = await updateWorkerAction({
        id: editingWorker.id,
        name: editName,
        trade: editTrade,
        customTrade: editCustomTrade,
        dailyWage: Number(editWage) || 650,
        siteId: editSiteId,
        advance: Number(editAdv) || 0
      })
      if (res.success && res.worker) {
        const selSite = sites.find(s => s.id === editSiteId)
        setWorkers(prev => prev.map(w => {
          if (w.id === editingWorker.id) {
            return {
              ...w,
              name: res.worker.name,
              trade: res.worker.trade,
              phone: res.worker.phone,
              dailyWage: Number(res.worker.dailyWage || 650),
              siteId: res.worker.siteId,
              site: selSite ? { id: selSite.id, name: selSite.name } : w.site
            }
          }
          return w
        }))
        setAdvances(prev => ({ ...prev, [editingWorker.id]: Number(editAdv) || 0 }))
        setEditingWorker(null)
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update worker')
    } finally {
      setUpdating(false)
    }
  }

  const handleSaveAll = async () => {
    setIsSaving(true)
    try {
      const payload = workers.map(w => ({
        labourId: w.id,
        siteId: w.siteId || 's-1',
        status: attendance[w.id] || 'PRESENT',
        advance: advances[w.id] || 0
      }))
      const res = await saveMobileAttendanceAction(payload)
      if (res.success) {
        setSavedSuccess(true)
        setTimeout(() => setSavedSuccess(false), 4000)
      }
    } catch (err: any) {
      alert(err.message || 'Failed to save register')
    } finally {
      setIsSaving(false)
    }
  }

  const filteredList = workers.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesTrade = selectedTrade === 'ALL' || getDisplayTrade(w) === selectedTrade || w.trade === selectedTrade
    return matchesSearch && matchesTrade
  })

  const totalPresent = workers.filter(w => attendance[w.id] === 'PRESENT').length
  const totalHalfDay = workers.filter(w => attendance[w.id] === 'HALF_DAY').length
  const totalAbsent = workers.filter(w => attendance[w.id] === 'ABSENT').length
  const totalAdvanceSum = workers.reduce((sum, w) => sum + (advances[w.id] || 0), 0)

  const totalWagePayable = workers.reduce((sum, w) => {
    const st = attendance[w.id]
    const wage = Number(w.dailyWage) || 0
    const ot = overtime[w.id] || 0
    const otRate = wage / 8
    let earned = 0
    if (st === 'PRESENT') earned = wage + (ot * otRate)
    else if (st === 'HALF_DAY') earned = (wage / 2) + (ot * otRate)
    return sum + earned
  }, 0)

  const uniqueTrades = Array.from(new Set(workers.map(w => getDisplayTrade(w))))

  return (
    <div className="space-y-6">
      {/* Top Telemetry Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 select-none">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl p-5 shadow-md shadow-emerald-500/10 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-100 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Present Headcount</span>
            <UserCheck className="w-5 h-5" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight">{totalPresent}</span>
            <span className="text-xs text-emerald-100 font-medium">+ {totalHalfDay} Half Day</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-2xl p-5 shadow-md shadow-amber-500/10 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-100 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Advances Issued</span>
            <Wallet className="w-5 h-5" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight">₹{totalAdvanceSum.toLocaleString('en-IN')}</span>
            <span className="text-xs text-amber-100 font-medium">Today</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-600 to-[#e85b0d]700 text-white rounded-2xl p-5 shadow-md shadow-blue-500/10 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-blue-100 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Estimated Payroll</span>
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight">₹{Math.round(totalWagePayable).toLocaleString('en-IN')}</span>
            <span className="text-xs text-blue-100 font-medium">Wages + OT</span>
          </div>
        </div>

        <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-md relative overflow-hidden flex flex-col justify-between border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Roster Actions</span>
            <HardHat className="w-5 h-5 text-blue-400" />
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full py-2.5 bg-[#fc6e20] hover:bg-[#fc6e20] active:scale-95 text-white text-xs font-black rounded-xl shadow transition-all border-none cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Plus size={16} strokeWidth={3} />
            <span>Add New Employee</span>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search worker by name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setSelectedTrade('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer whitespace-nowrap ${
                selectedTrade === 'ALL'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent shadow'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              All Trades
            </button>
            {uniqueTrades.map(trade => (
              <button
                key={trade}
                onClick={() => setSelectedTrade(trade)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer whitespace-nowrap ${
                  selectedTrade === trade
                    ? 'bg-[#fc6e20] text-white border-transparent shadow'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                }`}
              >
                {trade}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSaveAll}
          disabled={isSaving}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md shadow-emerald-600/20 transition-all border-none cursor-pointer flex items-center justify-center gap-2 flex-shrink-0 self-end sm:self-auto"
        >
          {isSaving ? <span>Saving Register...</span> : (
            <>
              <Save size={16} />
              <span>{savedSuccess ? '✓ Saved Successfully' : 'Save Muster Roll'}</span>
            </>
          )}
        </button>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[850px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs font-black uppercase tracking-wider">
                <th className="py-3.5 px-4">Employee Details</th>
                <th className="py-3.5 px-4">Trade Category</th>
                <th className="py-3.5 px-4">Assigned Site</th>
                <th className="py-3.5 px-4">Daily Wage</th>
                <th className="py-3.5 px-4 text-center">Attendance Status</th>
                <th className="py-3.5 px-4 text-center">OT (Hrs)</th>
                <th className="py-3.5 px-4">Today&apos;s Advance</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              {filteredList.map(worker => {
                const st = attendance[worker.id]
                const ot = overtime[worker.id] || 0
                const adv = advances[worker.id] || 0
                const displayTrade = getDisplayTrade(worker)

                return (
                  <tr key={worker.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-4 px-4 font-extrabold text-slate-900 dark:text-slate-100">
                      {worker.name}
                    </td>
                    <td className="py-4 px-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-black bg-[#fff7ed] dark:bg-blue-950/60 text-[#e85b0d] dark:text-blue-300 border border-blue-200/60 dark:border-blue-800 tracking-wider">
                        {displayTrade}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-xs font-bold text-slate-600 dark:text-slate-300">
                      <div className="flex items-center gap-1.5 truncate max-w-[180px]">
                        <Building2 size={13} className="text-slate-400 flex-shrink-0" />
                        <span className="truncate">{worker.site?.name || 'Main Project'}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                      ₹{worker.dailyWage}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <div className="inline-flex rounded-xl p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 select-none">
                        <button
                          onClick={() => handleStatusChange(worker.id, 'PRESENT')}
                          className={`px-3 py-1 rounded-lg text-xs font-black transition-all border-none cursor-pointer ${
                            st === 'PRESENT' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                        >
                          P
                        </button>
                        <button
                          onClick={() => handleStatusChange(worker.id, 'HALF_DAY')}
                          className={`px-3 py-1 rounded-lg text-xs font-black transition-all border-none cursor-pointer ${
                            st === 'HALF_DAY' ? 'bg-amber-500 text-white shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                        >
                          ½
                        </button>
                        <button
                          onClick={() => handleStatusChange(worker.id, 'ABSENT')}
                          className={`px-3 py-1 rounded-lg text-xs font-black transition-all border-none cursor-pointer ${
                            st === 'ABSENT' ? 'bg-rose-600 text-white shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                        >
                          A
                        </button>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <input
                        type="number"
                        min="0"
                        max="12"
                        value={ot}
                        disabled={st === 'ABSENT'}
                        onChange={e => handleOvertimeChange(worker.id, Number(e.target.value) || 0)}
                        className="w-16 py-1.5 px-2 text-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[#fc6e20]"
                      />
                    </td>
                    <td className="py-4 px-4">
                      <div className="relative max-w-[110px]">
                        <span className="text-slate-400 font-bold absolute left-2.5 top-2 text-xs">₹</span>
                        <input
                          type="number"
                          placeholder="0"
                          value={adv || ''}
                          onChange={e => handleAdvanceChange(worker.id, e.target.value)}
                          className="w-full pl-6 pr-2 py-1.5 bg-amber-500/10 dark:bg-amber-500/15 border border-amber-300 dark:border-amber-700/60 rounded-xl text-xs font-mono font-black text-amber-800 dark:text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <button
                        onClick={() => handleOpenEdit(worker)}
                        className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-200 dark:border-slate-700 cursor-pointer inline-flex items-center gap-1 active:scale-95"
                      >
                        <Edit3 size={12} />
                        <span>Edit</span>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 select-none">
          <form onSubmit={handleAddSubmit} className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-black text-base">
                <HardHat className="text-[#fc6e20]" size={20} />
                <span>Enroll New Field Employee</span>
              </div>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 border-none bg-transparent cursor-pointer p-1">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1 uppercase tracking-wider">Worker Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Murugan M"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] box-border"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1 uppercase tracking-wider">Trade Category</label>
                  <select
                    value={newTrade}
                    onChange={e => setNewTrade(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] box-border"
                  >
                    {STANDARD_TRADES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                    <option value="OTHERS">✨ OTHERS (Custom)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1 uppercase tracking-wider">Daily Wage (₹)</label>
                  <input
                    type="number"
                    required
                    value={newWage}
                    onChange={e => setNewWage(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] box-border"
                  />
                </div>
              </div>

              {newTrade === 'OTHERS' && (
                <div>
                  <label className="text-xs font-black text-amber-600 dark:text-amber-400 block mb-1 uppercase tracking-wider">Type Custom Trade Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Glass Fitter, Crane Operator"
                    value={newCustomTrade}
                    onChange={e => setNewCustomTrade(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xl text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 box-border"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1 uppercase tracking-wider">Assigned Site</label>
                <select
                  value={newSiteId}
                  onChange={e => setNewSiteId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] box-border"
                >
                  {sites.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                  {sites.length === 0 && <option value="s-1">Main Project Site</option>}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs border-none cursor-pointer">
                Cancel
              </button>
              <button type="submit" disabled={adding} className="px-5 py-2.5 rounded-xl bg-[#fc6e20] hover:bg-[#fc6e20] active:scale-95 disabled:opacity-50 text-white font-black text-xs border-none cursor-pointer shadow-md shadow-blue-600/25">
                {adding ? 'Saving...' : 'Enroll Worker'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Worker Modal */}
      {editingWorker && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 select-none">
          <form onSubmit={handleEditSubmit} className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-black text-base">
                <Edit3 className="text-[#fc6e20]" size={20} />
                <span>Modify {editingWorker.name}</span>
              </div>
              <button type="button" onClick={() => setEditingWorker(null)} className="text-slate-400 hover:text-slate-600 border-none bg-transparent cursor-pointer p-1">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1 uppercase tracking-wider">Worker Full Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] box-border"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1 uppercase tracking-wider">Trade Category</label>
                  <select
                    value={editTrade}
                    onChange={e => setEditTrade(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] box-border"
                  >
                    {STANDARD_TRADES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                    <option value="OTHERS">✨ OTHERS (Custom)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1 uppercase tracking-wider">Daily Wage (₹)</label>
                  <input
                    type="number"
                    required
                    value={editWage}
                    onChange={e => setEditWage(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] box-border"
                  />
                </div>
              </div>

              {editTrade === 'OTHERS' && (
                <div>
                  <label className="text-xs font-black text-amber-600 dark:text-amber-400 block mb-1 uppercase tracking-wider">Type Custom Trade Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Glass Fitter, Scaffolder"
                    value={editCustomTrade}
                    onChange={e => setEditCustomTrade(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xl text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 box-border"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black text-slate-700 dark:text-slate-300 block mb-1 uppercase tracking-wider">Assigned Site</label>
                  <select
                    value={editSiteId}
                    onChange={e => setEditSiteId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] box-border"
                  >
                    {sites.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                    {sites.length === 0 && <option value="s-1">Main Project Site</option>}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-black text-amber-600 dark:text-amber-400 block mb-1 uppercase tracking-wider">Today&apos;s Advance (₹)</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={editAdv}
                    onChange={e => setEditAdv(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xl text-sm font-mono font-black text-amber-800 dark:text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500 box-border"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button type="button" onClick={() => setEditingWorker(null)} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs border-none cursor-pointer">
                Cancel
              </button>
              <button type="submit" disabled={updating} className="px-5 py-2.5 rounded-xl bg-[#fc6e20] hover:bg-[#fc6e20] active:scale-95 disabled:opacity-50 text-white font-black text-xs border-none cursor-pointer shadow-md shadow-blue-600/25">
                {updating ? 'Updating...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
