'use client'

import { useState } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'

type Bill = {
  id: string
  description: string
  amount: unknown
  category: string
  paymentMode: string
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
      <div className="ct-card" style={{ padding: '48px', textAlign: 'center' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>All caught up!</div>
        <div style={{ color: 'var(--mut)', fontSize: '13px' }}>No bills pending approval</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {visible.map(bill => (
        <div key={bill.id} className="ct-card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                <span className="chip chip-blue" style={{ fontSize: '10px' }}>{CATEGORY_LABELS[bill.category] ?? bill.category}</span>
                <span className="chip chip-mut" style={{ fontSize: '10px' }}>{bill.site.name}</span>
                {bill.billNumber && <span style={{ fontSize: '11px', color: 'var(--mut)', fontWeight: 600 }}>#{bill.billNumber}</span>}
              </div>
              <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>{bill.description}</div>
              <div style={{ fontSize: '12px', color: 'var(--mut)', fontWeight: 500 }}>
                {bill.paidTo && <span>To: <strong style={{ color: 'var(--ink)' }}>{bill.paidTo}</strong> · </span>}
                Added by {bill.createdBy.name} · {formatDate(bill.createdAt)}
              </div>
              {bill.billAttachments.length > 0 && (
                <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {bill.billAttachments.map((a, i) => (
                    <a key={i} href={a.secureUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11.5px', color: 'var(--p)', fontWeight: 700, textDecoration: 'none' }}>📎 View Bill {i + 1}</a>
                  ))}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ink)', marginBottom: '12px' }}>{formatCurrency(Number(bill.amount))}</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleAction(bill.id, 'reject')}
                  disabled={loading === bill.id}
                  className="btn-reject"
                  style={{ fontSize: '12px', padding: '8px 12px' }}
                >
                  ✕ Reject
                </button>
                <button
                  onClick={() => handleAction(bill.id, 'approve')}
                  disabled={loading === bill.id}
                  className="btn-approve"
                  style={{ fontSize: '12px', padding: '8px 12px' }}
                >
                  {loading === bill.id ? '...' : '✓ Approve'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
