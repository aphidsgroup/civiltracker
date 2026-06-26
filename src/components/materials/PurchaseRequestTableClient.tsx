'use client'

import React, { useState } from 'react'
import { Check, X, Clock, AlertCircle, Sparkles, Building2, Tag, ShieldCheck, Filter, Search, CheckCircle2, XCircle } from 'lucide-react'

interface PurchaseRequestItem {
  id: string
  description: string
  quantity: any
  unit: string | null
  urgency: string
  status: string
  notes?: string | null
  site?: { name: string } | null
  createdAt?: Date | string
}

interface PurchaseRequestTableClientProps {
  initialRequests: PurchaseRequestItem[]
}

export default function PurchaseRequestTableClient({ initialRequests }: PurchaseRequestTableClientProps) {
  const displayList: PurchaseRequestItem[] = initialRequests.length > 0 ? initialRequests : [
    { id: 'pr-1', description: '53 Grade OPC Cement (Ultratech)', quantity: 350, unit: 'Bags', urgency: 'Urgent', status: 'PENDING', site: { name: 'Metro Heights Tower B' }, notes: 'Required for Slab 4 concrete pouring scheduled tomorrow.' },
    { id: 'pr-2', description: 'Fe500D TMT Rebars (12mm)', quantity: 4.5, unit: 'MT', urgency: 'High', status: 'PENDING', site: { name: 'Apex Commercial Hub' }, notes: 'Steel reinforcement stock running critically low.' },
    { id: 'pr-3', description: 'Coarse River Sand (Filtered)', quantity: 800, unit: 'Cu.Ft', urgency: 'Normal', status: 'PENDING', site: { name: 'Green Valley Villas' }, notes: 'Plastering work stage 2.' },
    { id: 'pr-4', description: 'Waterproofing Chemical (Dr. Fixit 302)', quantity: 50, unit: 'Liters', urgency: 'Normal', status: 'APPROVED', site: { name: 'Metro Heights Tower A' }, notes: 'Basement retaining wall treatment.' },
    { id: 'pr-5', description: 'Red Clay Bricks (Standard Size)', quantity: 12000, unit: 'Nos', urgency: 'Low', status: 'REJECTED', site: { name: 'Green Valley Villas' }, notes: 'Rate quoted by local vendor was above standard budget.' },
  ]

  const [requests, setRequests] = useState<PurchaseRequestItem[]>(displayList)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const handleAction = (id: string, newStatus: 'APPROVED' | 'REJECTED') => {
    setRequests(prev => prev.map(item => item.id === id ? { ...item, status: newStatus } : item))
    setToastMessage(`Request #${id.slice(-4).toUpperCase()} successfully ${newStatus.toLowerCase()}!`)
    setTimeout(() => setToastMessage(null), 3500)
  }

  const getUrgencyChip = (urgency: string) => {
    const u = urgency.toLowerCase()
    if (u === 'urgent') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800 animate-pulse">
          <AlertCircle className="w-3.5 h-3.5 text-rose-600" /> Urgent
        </span>
      )
    }
    if (u === 'high') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
          <Clock className="w-3.5 h-3.5 text-amber-600" /> High
        </span>
      )
    }
    if (u === 'normal') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-[#fff7ed] text-[#e85b0d] dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          Normal
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
        Low
      </span>
    )
  }

  const getStatusChip = (status: string) => {
    if (status === 'APPROVED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Approved
        </span>
      )
    }
    if (status === 'REJECTED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
          <XCircle className="w-3.5 h-3.5 text-rose-600" /> Rejected
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
        <Clock className="w-3.5 h-3.5 text-amber-600 animate-spin" /> Pending Review
      </span>
    )
  }

  const filteredRequests = requests.filter(req => {
    const matchesSearch = req.description.toLowerCase().includes(searchQuery.toLowerCase()) || (req.site?.name && req.site.name.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesStatus = statusFilter === 'ALL' || req.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const pendingCount = requests.filter(r => r.status === 'PENDING').length
  const urgentCount = requests.filter(r => r.urgency.toLowerCase() === 'urgent' && r.status === 'PENDING').length

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Total Requisitions</div>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">{requests.length}</div>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#fff7ed] dark:bg-blue-950/50 text-[#fc6e20] dark:text-blue-400">
            <Tag className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center justify-between relative overflow-hidden">
          {pendingCount > 0 && <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />}
          <div>
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Awaiting Approval</div>
            <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-400">{pendingCount}</div>
          </div>
          <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-rose-500 to-red-600 text-white rounded-2xl p-5 shadow-md shadow-rose-500/10 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-rose-100 mb-1">Urgent Requisitions</div>
            <div className="text-3xl font-extrabold text-white">{urgentCount}</div>
          </div>
          <div className="p-3.5 rounded-2xl bg-white/10 text-white backdrop-blur-sm">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter & Toast Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search material or site..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#fc6e20] text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          {toastMessage && (
            <span className="text-xs font-bold text-[#fc6e20] dark:text-blue-400 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#fff7ed] dark:bg-blue-950/50 rounded-xl border border-blue-200 dark:border-blue-800">
              <Sparkles className="w-3.5 h-3.5" /> {toastMessage}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                  statusFilter === st
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-transparent shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                {st === 'ALL' ? 'All' : st.charAt(0) + st.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold bg-slate-50 dark:bg-slate-950/40">
                <th className="py-4 px-6">Urgency</th>
                <th className="py-4 px-6">Quantity</th>
                <th className="py-4 px-6">Material Description</th>
                <th className="py-4 px-6">Project Site</th>
                <th className="py-4 px-6 text-center">Status</th>
                <th className="py-4 px-6 text-right">Approve / Reject</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              {filteredRequests.map(req => (
                <tr key={req.id} className="hover:bg-slate-50/75 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-4 px-6 whitespace-nowrap">
                    {getUrgencyChip(req.urgency)}
                  </td>
                  <td className="py-4 px-6 whitespace-nowrap">
                    <span className="text-base font-extrabold text-slate-900 dark:text-slate-100">{Number(req.quantity)}</span>{' '}
                    <span className="text-xs font-bold text-slate-500 uppercase">{req.unit || 'Units'}</span>
                  </td>
                  <td className="py-4 px-6">
                    <div className="font-extrabold text-slate-900 dark:text-slate-100">{req.description}</div>
                    {req.notes && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">{req.notes}</div>}
                  </td>
                  <td className="py-4 px-6 whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>{req.site?.name || 'Central Store'}</span>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-center whitespace-nowrap">
                    {getStatusChip(req.status)}
                  </td>
                  <td className="py-4 px-6 text-right whitespace-nowrap">
                    {req.status === 'PENDING' ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleAction(req.id, 'APPROVED')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm shadow-emerald-600/20 cursor-pointer border-none"
                          title="Approve Requisition"
                        >
                          <Check className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => handleAction(req.id, 'REJECTED')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold transition-all cursor-pointer"
                          title="Reject Requisition"
                        >
                          <X className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400 italic">No further actions</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    No purchase requisitions matching your filter.
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
