'use client'

import { useState } from 'react'
import { raiseInvoice } from '@/actions/invoices'
import { X, IndianRupee, Loader2, CheckCircle2 } from 'lucide-react'

interface Props {
  client: { id: string; name: string; siteId?: string | null }
}

export function RaiseInvoiceButton({ client }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData(e.currentTarget)
      fd.set('clientId', client.id)
      if (client.siteId) fd.set('siteId', client.siteId)
      const result = await raiseInvoice(fd)
      setSuccess(result.invoiceNumber)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to raise invoice')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setSuccess(null); setError(null) }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#fc6e20] hover:bg-[#e85b0d] text-white rounded-lg text-xs font-bold transition-colors"
      >
        <IndianRupee className="w-3.5 h-3.5" />
        Raise Payment
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-lg font-bold text-gray-900 mb-1">Raise Payment Demand</h2>
            <p className="text-xs text-gray-500 mb-5">Client: <strong>{client.name}</strong> · Invoice will appear in their portal immediately</p>

            {success ? (
              <div className="text-center py-6">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <div className="font-bold text-lg text-gray-900">Invoice Raised!</div>
                <div className="text-sm text-gray-500 mt-1">Invoice <strong>{success}</strong> has been sent to {client.name}&apos;s portal.</div>
                <button
                  onClick={() => setOpen(false)}
                  className="mt-5 w-full py-2.5 bg-slate-900 text-white font-bold rounded-xl text-sm"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Amount (₹) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">₹</span>
                    <input
                      name="amount"
                      type="number"
                      step="0.01"
                      min="1"
                      required
                      placeholder="0.00"
                      className="w-full pl-8 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#fc6e20]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Milestone / Description *</label>
                  <input
                    name="milestone"
                    type="text"
                    required
                    placeholder="e.g. Foundation completion advance, Slab casting payment..."
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#fc6e20]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Due Date</label>
                  <input
                    name="dueDate"
                    type="date"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#fc6e20]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Notes (optional)</label>
                  <textarea
                    name="notes"
                    rows={2}
                    placeholder="Any additional notes..."
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#fc6e20] resize-none"
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">{error}</div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-[#fc6e20] hover:bg-[#e85b0d] disabled:opacity-60 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <IndianRupee className="w-4 h-4" />}
                  {loading ? 'Raising Invoice...' : 'Raise Invoice'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
