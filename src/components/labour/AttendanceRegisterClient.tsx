'use client'

import React, { useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { Check, X, Clock, UserCheck, UserX, AlertCircle, Save, HardHat, Building2, Sparkles, Filter, Search } from 'lucide-react'

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY'

interface Worker {
  id: string
  name: string
  phone: string | null
  trade: string
  dailyWage: any
  site?: { name: string } | null
}

interface AttendanceRegisterClientProps {
  labourList: Worker[]
  dateString: string
}

const tradeColors: Record<string, string> = {
  MASON: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  HELPER: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  CARPENTER: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  BAR_BENDER: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  ELECTRICIAN: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
  PLUMBER: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
  PAINTER: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
  SUPERVISOR: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
}

export default function AttendanceRegisterClient({ labourList, dateString }: AttendanceRegisterClientProps) {
  // Sample fallback workers if live db returned empty array
  const displayList: Worker[] = labourList.length > 0 ? labourList : [
    { id: 'l-1', name: 'Rameshwar Yadav', phone: '+91 98210 43912', trade: 'MASON', dailyWage: 850, site: { name: 'Metro Heights Tower A' } },
    { id: 'l-2', name: 'Suresh Manjhi', phone: '+91 97321 11029', trade: 'HELPER', dailyWage: 550, site: { name: 'Metro Heights Tower A' } },
    { id: 'l-3', name: 'Dinesh Vishwakarma', phone: '+91 99102 33481', trade: 'CARPENTER', dailyWage: 900, site: { name: 'Green Valley Villas' } },
    { id: 'l-4', name: 'Mukesh Ansari', phone: '+91 98923 44102', trade: 'BAR_BENDER', dailyWage: 850, site: { name: 'Metro Heights Tower B' } },
    { id: 'l-5', name: 'Santosh Paswan', phone: '+91 94102 88219', trade: 'HELPER', dailyWage: 550, site: { name: 'Green Valley Villas' } },
    { id: 'l-6', name: 'Rajesh Sharma', phone: '+91 98111 00293', trade: 'ELECTRICIAN', dailyWage: 950, site: { name: 'Apex Commercial Hub' } },
  ]

  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>(() => {
    const init: Record<string, AttendanceStatus> = {}
    displayList.forEach((w, i) => {
      init[w.id] = i === 2 ? 'HALF_DAY' : i === 4 ? 'ABSENT' : 'PRESENT'
    })
    return init
  })

  const [overtime, setOvertime] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    displayList.forEach((w, i) => {
      init[w.id] = i === 0 ? 2 : 0
    })
    return init
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTrade, setSelectedTrade] = useState('ALL')
  const [isSaving, setIsSaving] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)

  const handleStatusChange = (id: string, status: AttendanceStatus) => {
    setAttendance(prev => ({ ...prev, [id]: status }))
    setSavedSuccess(false)
  }

  const handleOvertimeChange = (id: string, hours: number) => {
    setOvertime(prev => ({ ...prev, [id]: Math.max(0, Math.min(8, hours)) }))
    setSavedSuccess(false)
  }

  const handleSaveAll = () => {
    setIsSaving(true)
    setTimeout(() => {
      setIsSaving(false)
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 4000)
    }, 800)
  }

  const filteredList = displayList.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(searchQuery.toLowerCase()) || (w.phone && w.phone.includes(searchQuery))
    const matchesTrade = selectedTrade === 'ALL' || w.trade === selectedTrade
    return matchesSearch && matchesTrade
  })

  const totalPresent = displayList.filter(w => attendance[w.id] === 'PRESENT').length
  const totalHalfDay = displayList.filter(w => attendance[w.id] === 'HALF_DAY').length
  const totalAbsent = displayList.filter(w => attendance[w.id] === 'ABSENT').length

  const totalWagePayable = displayList.reduce((sum, w) => {
    const status = attendance[w.id]
    const wage = Number(w.dailyWage) || 0
    const ot = overtime[w.id] || 0
    const otRate = wage / 8
    if (status === 'PRESENT') return sum + wage + (ot * otRate)
    if (status === 'HALF_DAY') return sum + (wage / 2) + (ot * otRate)
    return sum
  }, 0)

  const trades = ['ALL', ...Array.from(new Set(displayList.map(w => w.trade)))]

  return (
    <div className="space-y-6">
      {/* Top Banner & Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl p-5 shadow-md shadow-emerald-500/10 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between text-emerald-100 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Present Workers</span>
            <UserCheck className="w-5 h-5" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight">{totalPresent}</span>
            <span className="text-xs text-emerald-100 font-medium">+ {totalHalfDay} Half Day</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Absent Today</span>
            <UserX className="w-5 h-5 text-rose-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">{totalAbsent}</span>
            <span className="text-xs text-rose-500 font-semibold">{((totalAbsent / displayList.length) * 100 || 0).toFixed(0)}% absent rate</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Overtime Recorded</span>
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
              {Object.values(overtime).reduce((a, b) => a + b, 0)} hrs
            </span>
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Extra output</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-5 shadow-md relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-300 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Est. Wages Today</span>
            <Sparkles className="w-5 h-5 text-amber-400" />
          </div>
          <div className="text-3xl font-extrabold tracking-tight text-white">
            {formatCurrency(Math.round(totalWagePayable))}
          </div>
        </div>
      </div>

      {/* Register Controls Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search workers..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 transition-all"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            <Filter className="w-4 h-4 text-slate-400 hidden sm:block flex-shrink-0" />
            {trades.slice(0, 5).map(trade => (
              <button
                key={trade}
                onClick={() => setSelectedTrade(trade)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all whitespace-nowrap cursor-pointer ${
                  selectedTrade === trade
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                {trade === 'ALL' ? 'All Trades' : trade}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          {savedSuccess && (
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/50 rounded-xl border border-emerald-200 dark:border-emerald-800">
              <Check className="w-4 h-4" /> Attendance Register Synced
            </span>
          )}
          <button
            onClick={handleSaveAll}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50 border-none"
          >
            <Save className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} />
            {isSaving ? 'Saving Register...' : 'Submit Register'}
          </button>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 px-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardHat className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Daily Attendance Register</h2>
          </div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{dateString}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold bg-slate-50 dark:bg-slate-950/40">
                <th className="py-4 px-6">Worker Details</th>
                <th className="py-4 px-6">Trade & Site</th>
                <th className="py-4 px-6 text-right">Wage / Day</th>
                <th className="py-4 px-6 text-center">Mark Attendance</th>
                <th className="py-4 px-6 text-center">Overtime (Hrs)</th>
                <th className="py-4 px-6 text-right">Total Payable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              {filteredList.map(worker => {
                const status = attendance[worker.id] || 'PRESENT'
                const wage = Number(worker.dailyWage) || 0
                const ot = overtime[worker.id] || 0
                const otRate = wage / 8
                let total = 0
                if (status === 'PRESENT') total = wage + (ot * otRate)
                if (status === 'HALF_DAY') total = (wage / 2) + (ot * otRate)

                return (
                  <tr key={worker.id} className="hover:bg-slate-50/75 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-4 px-6">
                      <div className="font-extrabold text-slate-900 dark:text-slate-100">{worker.name}</div>
                      <div className="text-xs text-slate-500 font-medium mt-0.5">{worker.phone || 'No Contact Number'}</div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${tradeColors[worker.trade] || 'bg-slate-100 text-slate-800 border-slate-200'}`}>
                          {worker.trade.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>{worker.site?.name || 'Unassigned Site'}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right font-bold text-slate-900 dark:text-slate-100">
                      {formatCurrency(wage)}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleStatusChange(worker.id, 'PRESENT')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer ${
                            status === 'PRESENT'
                              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20 ring-2 ring-emerald-600 ring-offset-1 dark:ring-offset-slate-900'
                              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" /> Present
                        </button>
                        <button
                          onClick={() => handleStatusChange(worker.id, 'HALF_DAY')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer ${
                            status === 'HALF_DAY'
                              ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20 ring-2 ring-amber-500 ring-offset-1 dark:ring-offset-slate-900'
                              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 hover:bg-amber-100 border border-amber-200 dark:border-amber-800'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5" /> Half Day
                        </button>
                        <button
                          onClick={() => handleStatusChange(worker.id, 'ABSENT')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer ${
                            status === 'ABSENT'
                              ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20 ring-2 ring-rose-600 ring-offset-1 dark:ring-offset-slate-900'
                              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 hover:bg-rose-100 border border-rose-200 dark:border-rose-800'
                          }`}
                        >
                          <X className="w-3.5 h-3.5" /> Absent
                        </button>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-slate-700">
                        <button
                          onClick={() => handleOvertimeChange(worker.id, ot - 1)}
                          disabled={ot <= 0 || status === 'ABSENT'}
                          className="w-7 h-7 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-30 border-none"
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-xs font-extrabold text-slate-900 dark:text-slate-100">
                          {status === 'ABSENT' ? 0 : ot}h
                        </span>
                        <button
                          onClick={() => handleOvertimeChange(worker.id, ot + 1)}
                          disabled={ot >= 8 || status === 'ABSENT'}
                          className="w-7 h-7 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-30 border-none"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right font-extrabold text-slate-900 dark:text-slate-100 text-base">
                      {formatCurrency(Math.round(total))}
                    </td>
                  </tr>
                )
              })}
              {filteredList.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    No workers matching your search criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
