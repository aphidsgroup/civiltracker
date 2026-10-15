'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Pencil, Trash2, X, Check, Loader2 } from 'lucide-react'

type Expense = {
  id: string
  description: string | null
  billNumber: string | null
  siteName: string
  category: string
  amount: number
  date: string
  createdByName: string
  createdById: string
  approvalStatus: string
  paymentMode: string
  paidTo: string | null
  notes: string | null
}

const CATEGORY_LABELS: Record<string, string> = {
  MATERIAL: 'Material', LABOUR: 'Labour', SUBCONTRACTOR: 'Subcontractor',
  TRANSPORT: 'Transport', TOOLS_EQUIPMENT: 'Tools & Equip', SITE_PETTY_CASH: 'Petty Cash',
  DIESEL: 'Diesel', OFFICE_ADMIN: 'Office/Admin', CLIENT_VARIATION: 'Variation', MISCELLANEOUS: 'Misc',
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  PAID: 'bg-blue-100 text-blue-800',
  REJECTED: 'bg-red-100 text-red-800',
}

const CATEGORIES = [
  'MATERIAL','LABOUR','SUBCONTRACTOR','TRANSPORT','TOOLS_EQUIPMENT',
  'SITE_PETTY_CASH','DIESEL','OFFICE_ADMIN','CLIENT_VARIATION','MISCELLANEOUS',
]
const PAYMENT_MODES = ['CASH','UPI','BANK_TRANSFER','CREDIT','CHEQUE']

export default function ExpenseTableClient({
  expenses,
  currentUserId,
  currentUserRole,
  canEdit,
  hasMore,
  loadMoreHref,
}: {
  expenses: Expense[]
  currentUserId: string
  currentUserRole: string
  canEdit: boolean
  hasMore: boolean
  loadMoreHref: string
}) {
  const router = useRouter()
  const [list, setList] = useState(expenses)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Expense>>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const isAdmin = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ACCOUNTANT'].includes(currentUserRole)

  function canModify(expense: Expense) {
    if (expense.approvalStatus !== 'PENDING') return false
    return isAdmin || expense.createdById === currentUserId
  }

  function startEdit(expense: Expense) {
    setEditingId(expense.id)
    setEditForm({
      amount: expense.amount,
      category: expense.category,
      paymentMode: expense.paymentMode,
      paidTo: expense.paidTo || '',
      description: expense.description || '',
      billNumber: expense.billNumber || '',
      notes: expense.notes || '',
    })
    setError(null)
  }

  async function saveEdit(id: string) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/expenses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Failed to save')
      }
      setList(prev => prev.map(e => e.id === id ? {
        ...e,
        amount: Number(editForm.amount ?? e.amount),
        category: editForm.category || e.category,
        paymentMode: editForm.paymentMode || e.paymentMode,
        paidTo: editForm.paidTo || null,
        description: editForm.description || e.description,
        billNumber: editForm.billNumber || null,
        notes: editForm.notes || null,
      } : e))
      setEditingId(null)
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    }
    setSaving(false)
  }

  async function deleteExpense(expense: Expense) {
    const label = expense.description || expense.paidTo || expense.billNumber || expense.id
    if (!window.confirm(`Delete expense "${label}"? This cannot be undone.`)) return
    setDeleting(expense.id)
    setError(null)
    try {
      const res = await fetch(`/api/expenses/${expense.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Failed to delete')
      }
      setList(prev => prev.filter(e => e.id !== expense.id))
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    }
    setDeleting(null)
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="p-4 sm:px-5 sm:py-4 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-sm font-extrabold m-0 text-slate-800">Expense Records</h2>
        <span className="text-xs text-slate-500">{list.length} records</span>
      </div>

      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <X className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Description</th>
              <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Site</th>
              <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Category</th>
              <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Amount</th>
              <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Date</th>
              <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">By</th>
              <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Status</th>
              {canEdit && <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map(e => (
              <>
                <tr key={e.id} className="hover:bg-slate-50/50 transition-colors">
                  {editingId === e.id ? (
                    <>
                      <td className="px-4 py-2" colSpan={6}>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            className="border border-slate-300 rounded px-2 py-1 text-xs col-span-2"
                            placeholder="Description"
                            value={editForm.description || ''}
                            onChange={ev => setEditForm(p => ({ ...p, description: ev.target.value }))}
                          />
                          <div className="flex items-center gap-1 col-span-2 sm:col-span-1">
                            <span className="text-xs font-bold text-slate-500">₹</span>
                            <input
                              type="number" min="0" step="0.01"
                              className="border border-slate-300 rounded px-2 py-1 text-xs w-full"
                              value={editForm.amount || ''}
                              onChange={ev => setEditForm(p => ({ ...p, amount: parseFloat(ev.target.value) }))}
                            />
                          </div>
                          <select
                            className="border border-slate-300 rounded px-2 py-1 text-xs"
                            value={editForm.category || ''}
                            onChange={ev => setEditForm(p => ({ ...p, category: ev.target.value }))}
                          >
                            {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>)}
                          </select>
                          <select
                            className="border border-slate-300 rounded px-2 py-1 text-xs"
                            value={editForm.paymentMode || ''}
                            onChange={ev => setEditForm(p => ({ ...p, paymentMode: ev.target.value }))}
                          >
                            {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                          <input
                            className="border border-slate-300 rounded px-2 py-1 text-xs"
                            placeholder="Paid to"
                            value={editForm.paidTo || ''}
                            onChange={ev => setEditForm(p => ({ ...p, paidTo: ev.target.value }))}
                          />
                          <input
                            className="border border-slate-300 rounded px-2 py-1 text-xs"
                            placeholder="Bill #"
                            value={editForm.billNumber || ''}
                            onChange={ev => setEditForm(p => ({ ...p, billNumber: ev.target.value }))}
                          />
                          <input
                            className="border border-slate-300 rounded px-2 py-1 text-xs col-span-2"
                            placeholder="Notes"
                            value={editForm.notes || ''}
                            onChange={ev => setEditForm(p => ({ ...p, notes: ev.target.value }))}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[e.approvalStatus] ?? 'bg-slate-100 text-slate-700'}`}>
                          {e.approvalStatus}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            <button
                              onClick={() => saveEdit(e.id)}
                              disabled={saving}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                            >
                              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                              Save
                            </button>
                            <button
                              onClick={() => { setEditingId(null); setError(null) }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors"
                            >
                              <X className="w-3 h-3" /> Cancel
                            </button>
                          </div>
                        </td>
                      )}
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap">{e.description}</div>
                        {e.billNumber && <div className="text-[11px] text-slate-500 font-medium">#{e.billNumber}</div>}
                        {e.paidTo && <div className="text-[11px] text-slate-400">To: {e.paidTo}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-semibold">{e.siteName}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#fff7ed] text-[#e85b0d]">
                          {CATEGORY_LABELS[e.category] ?? e.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-extrabold text-slate-900">{formatCurrency(e.amount)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-semibold">{formatDate(new Date(e.date))}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-semibold">{e.createdByName}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[e.approvalStatus] ?? 'bg-slate-100 text-slate-700'}`}>
                          {e.approvalStatus}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          {canModify(e) ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => startEdit(e)}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 text-xs font-bold rounded-lg transition-colors"
                                title="Edit expense"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => deleteExpense(e)}
                                disabled={deleting === e.id}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-600 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                                title="Delete expense"
                              >
                                {deleting === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              {e.approvalStatus !== 'PENDING' ? e.approvalStatus.toLowerCase() : '—'}
                            </span>
                          )}
                        </td>
                      )}
                    </>
                  )}
                </tr>
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden divide-y divide-slate-100">
        {list.map(e => (
          <div key={e.id} className="p-4">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-slate-900 truncate">{e.description}</div>
                <div className="text-xs text-slate-500 mt-0.5">{e.siteName} · {formatDate(new Date(e.date))}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-base font-extrabold text-slate-900">{formatCurrency(e.amount)}</div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold mt-1 ${STATUS_COLORS[e.approvalStatus] ?? 'bg-slate-100 text-slate-700'}`}>
                  {e.approvalStatus}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#fff7ed] text-[#e85b0d]">
                {CATEGORY_LABELS[e.category] ?? e.category}
              </span>
              <span className="text-[11px] text-slate-400">{e.paymentMode}</span>
              {e.paidTo && <span className="text-[11px] text-slate-400">· {e.paidTo}</span>}
            </div>

            {/* Expand to edit on mobile */}
            {canEdit && canModify(e) && (
              <div className="mt-2">
                {expandedId === e.id && editingId === e.id ? (
                  <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                    <input
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                      placeholder="Description"
                      value={editForm.description || ''}
                      onChange={ev => setEditForm(p => ({ ...p, description: ev.target.value }))}
                    />
                    <div className="flex gap-2">
                      <input
                        type="number" min="0"
                        className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs"
                        placeholder="Amount"
                        value={editForm.amount || ''}
                        onChange={ev => setEditForm(p => ({ ...p, amount: parseFloat(ev.target.value) }))}
                      />
                      <select
                        className="flex-1 border border-slate-300 rounded-lg px-2 py-2 text-xs"
                        value={editForm.category || ''}
                        onChange={ev => setEditForm(p => ({ ...p, category: ev.target.value }))}
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>)}
                      </select>
                    </div>
                    <input
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                      placeholder="Paid to"
                      value={editForm.paidTo || ''}
                      onChange={ev => setEditForm(p => ({ ...p, paidTo: ev.target.value }))}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(e.id)}
                        disabled={saving}
                        className="flex-1 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1"
                      >
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                      </button>
                      <button
                        onClick={() => { setEditingId(null); setExpandedId(null) }}
                        className="flex-1 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg flex items-center justify-center gap-1"
                      >
                        <X className="w-3 h-3" /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => { setExpandedId(e.id); startEdit(e) }}
                      className="flex-1 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => deleteExpense(e)}
                      disabled={deleting === e.id}
                      className="flex-1 py-1.5 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                    >
                      {deleting === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="p-4 flex justify-center border-t border-slate-200 bg-slate-50">
          <a href={loadMoreHref} className="text-sm font-bold text-[#fc6e20] hover:underline">
            Load More Records
          </a>
        </div>
      )}
    </div>
  )
}
