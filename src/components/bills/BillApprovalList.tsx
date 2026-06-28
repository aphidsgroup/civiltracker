'use client'

import { useState } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Check, X, Paperclip, CheckCircle2, Loader2 } from 'lucide-react'

type Bill = {
  id: string
  description: string
  amount: unknown
  category: string
  paymentMode: string
  approvalStatus: string
  paidTo: string | null
  billNumber: string | null
  billDate: Date | null
  createdAt: Date
  site: { id: string; name: string }
  createdBy: { name: string }
  billAttachments: { secureUrl: string }[]
}

const CATEGORY_LABELS: Record<string, string> = {
  MATERIAL: 'Material', LABOUR: 'Labour', SUBCONTRACTOR: 'Subcontractor',
  TRANSPORT: 'Transport', TOOLS_EQUIPMENT: 'Tools & Equip', SITE_PETTY_CASH: 'Petty Cash',
  DIESEL: 'Diesel', OFFICE_ADMIN: 'Office/Admin', CLIENT_VARIATION: 'Variation', MISCELLANEOUS: 'Misc',
}

export default function BillApprovalList({ bills }: { bills: Bill[] }) {
  const [loading, setLoading] = useState<string | null>(null)
  const [done, setDone] = useState<string[]>([])

  async function handleAction(id: string, action: 'approve' | 'reject') {
    setLoading(id)
    try {
      const res = await fetch(`/api/expenses/${id}/${action}`, { method: 'POST' })
      if (res.ok) setDone(prev => [...prev, id])
    } catch {}
    setLoading(null)
  }

  const visible = bills.filter(b => !done.includes(b.id))

  if (visible.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center shadow-sm flex flex-col items-center justify-center">
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-full mb-4">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <div className="font-bold text-base text-slate-900 dark:text-slate-100 mb-1">All caught up!</div>
        <div className="text-sm text-slate-500 dark:text-slate-400">No bills pending approval</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3.5">
      {visible.map(bill => (
        <div key={bill.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#fff7ed] text-[#e85b0d] dark:bg-blue-900/30 dark:text-blue-400">
                  {CATEGORY_LABELS[bill.category] ?? bill.category}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {bill.site.name}
                </span>
                {bill.billNumber && <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">#{bill.billNumber}</span>}
              </div>
              <div className="font-bold text-base text-slate-900 dark:text-slate-100 mb-1">{bill.description}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                {bill.paidTo && <span>To: <strong className="text-slate-800 dark:text-slate-200">{bill.paidTo}</strong> · </span>}
                Added by {bill.createdBy.name} · {formatDate(bill.createdAt)}
              </div>
              {bill.billAttachments.length > 0 && (
                <div className="mt-2.5 flex gap-2 flex-wrap">
                  {bill.billAttachments.map((a, i) => (
                    <a key={i} href={a.secureUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#fc6e20] dark:text-blue-400 font-bold hover:underline">
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>View Bill {i + 1}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
            <div className="text-left sm:text-right flex-shrink-0 w-full sm:w-auto">
              <div className="text-xl font-extrabold text-slate-900 dark:text-slate-100 mb-3">{formatCurrency(Number(bill.amount))}</div>
              {bill.approvalStatus === 'PENDING' ? (
                <div className="flex gap-2 justify-start sm:justify-end">
                  <button
                    onClick={() => handleAction(bill.id, 'reject')}
                    disabled={loading === bill.id}
                    className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 font-semibold text-xs transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    {loading === bill.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    <span>Reject</span>
                  </button>
                  <button
                    onClick={() => handleAction(bill.id, 'approve')}
                    disabled={loading === bill.id}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors inline-flex items-center gap-1 disabled:opacity-50 shadow-sm"
                  >
                    {loading === bill.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>Approve</span>
                  </button>
                </div>
              ) : (
                <div className="flex justify-start sm:justify-end">
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold tracking-wide uppercase ${
                    bill.approvalStatus === 'APPROVED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                    bill.approvalStatus === 'REJECTED' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' :
                    bill.approvalStatus === 'PAID' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}>
                    {bill.approvalStatus}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
