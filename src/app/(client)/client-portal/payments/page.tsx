import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Receipt, Calendar, CheckCircle2, Clock, CreditCard, Download, ArrowUpRight } from 'lucide-react'

export default async function ClientPortalPaymentsPage() {
  const session = await auth()
  if (session?.user?.role !== 'CLIENT') redirect('/dashboard')

  const client = await prisma.client.findFirst({
    where: { id: session?.user?.id },
    include: {
      invoices: {
        orderBy: { createdAt: 'desc' }
      },
      payments: {
        orderBy: { createdAt: 'desc' }
      }
    }
  })

  const invoices = client?.invoices || []
  const payments = client?.payments || []

  const totalContract = Number(client?.contractValue || 0)
  const totalPaid = Number(client?.amountPaid || 0)
  const totalDue = Number(client?.amountDue || 0)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Financial Ledger & Invoices</h1>
          <p className="text-sm text-slate-500 mt-1">Track billing statements, payment receipts, and outstanding account balances</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Total Contract Value</span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">₹{totalContract.toLocaleString('en-IN')}</span>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm border-b-4 border-b-emerald-500">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Total Amount Paid</span>
          <span className="text-2xl font-black text-emerald-600 mt-1 block">₹{totalPaid.toLocaleString('en-IN')}</span>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm border-b-4 border-b-blue-600">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Outstanding Balance Due</span>
          <span className="text-2xl font-black text-blue-600 mt-1 block">₹{totalDue.toLocaleString('en-IN')}</span>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="font-bold text-slate-900 text-base">Milestone Invoices</h2>
          <span className="text-xs font-bold text-slate-500">{invoices.length} Statements</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 bg-slate-50">
                <th className="py-3.5 px-6">Invoice No</th>
                <th className="py-3.5 px-6">Milestone Description</th>
                <th className="py-3.5 px-6">Billed Amount</th>
                <th className="py-3.5 px-6">Due Date</th>
                <th className="py-3.5 px-6">Payment Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-medium">
              {invoices.map(inv => {
                const isPaid = inv.status === 'PAID'
                return (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-4 px-6 font-mono font-bold text-slate-800">#{inv.invoiceNumber}</td>
                    <td className="py-4 px-6 font-bold text-slate-900">{inv.milestone || 'Stage Billing'}</td>
                    <td className="py-4 px-6 font-extrabold text-slate-900">₹{Number(inv.amount).toLocaleString('en-IN')}</td>
                    <td className="py-4 px-6 text-xs text-slate-500">
                      {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-IN') : 'Upon receipt'}
                    </td>
                    <td className="py-4 px-6">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                        isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                )
              })}

              {invoices.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400 font-medium">
                    No billing statements issued yet.
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
