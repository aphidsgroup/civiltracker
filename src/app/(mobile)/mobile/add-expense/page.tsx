import { requireUser } from '@/lib/auth/require-user'
import prisma from '@/lib/prisma'
import { createExpenseAction } from '@/actions/expense'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Receipt, Tag, Building2, User, CreditCard, FileText, Send, ArrowLeft, AlertCircle } from 'lucide-react'
import type { ExpenseCategory, PaymentMode } from '@prisma/client'

export default async function MobileAddExpensePage() {
  const user = await requireUser()
  
  if (!user.companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 text-center bg-[#f2f5f8]">
        <AlertCircle className="w-12 h-12 text-amber-500 mb-3 mx-auto" />
        <h2 className="text-base font-extrabold text-[#16273a]">No Company Workspace</h2>
        <p className="text-xs text-[#647387] mt-1">You need an active company context to log expenses.</p>
      </div>
    )
  }

  const sites = await prisma.site.findMany({
    where: { companyId: user.companyId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  })

  async function submitExpense(formData: FormData) {
    'use server'
    const siteId = formData.get('siteId') as string
    const amountStr = formData.get('amount') as string
    const amount = parseFloat(amountStr)
    const category = formData.get('category') as ExpenseCategory
    const paymentMode = formData.get('paymentMode') as PaymentMode
    const paidTo = formData.get('paidTo') as string
    const notes = formData.get('notes') as string

    if (!siteId || isNaN(amount) || amount <= 0) return

    await createExpenseAction({
      siteId,
      amount,
      category: category || 'SITE_PETTY_CASH',
      paymentMode: paymentMode || 'CASH',
      paidTo: paidTo || undefined,
      notes: notes || undefined
    })

    redirect('/mobile/home')
  }

  return (
    <div className="min-h-screen bg-[#f2f5f8] pb-28">
      {/* APPBAR HEADER */}
      <div className="bg-gradient-to-br from-[#0d3a63] to-[#1a64a6] text-white px-4 pt-4 pb-8 shadow-md rounded-b-[24px]">
        <div className="flex items-center justify-between mb-4">
          <Link href="/mobile/add" className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center border border-white/15 text-white active:scale-95 transition-transform">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-2 bg-white/15 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase text-amber-300">
            <Receipt size={14} />
            <span>Quick Log</span>
          </div>
          <div className="w-9" /> {/* Spacer for centering */}
        </div>
        <h1 className="text-[24px] font-black tracking-tight text-center">Record Petty Cash</h1>
        <p className="text-xs text-white/80 font-medium text-center mt-0.5">Instant site expenditure logging</p>
      </div>

      {/* FORM CARD */}
      <div className="max-w-lg mx-auto px-4 -mt-4">
        <form action={submitExpense} className="bg-white p-5 rounded-[24px] border border-[#e4eaf0] shadow-sm flex flex-col gap-4">
          {/* AMOUNT INPUT */}
          <div className="bg-[#f8fafc] p-4 rounded-[18px] border border-[#e2e8f0]">
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-[#647387] mb-1">
              Amount Spent (₹) <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center">
              <span className="text-2xl font-black text-[#0d3a63] mr-2">₹</span>
              <input
                type="number"
                step="0.01"
                name="amount"
                required
                placeholder="0.00"
                className="w-full text-3xl font-black text-[#16273a] bg-transparent focus:outline-none placeholder:text-[#cbd5e1]"
              />
            </div>
          </div>

          {/* SITE SELECTION */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#647387] mb-1.5">
              <Building2 size={14} className="text-[#13558e]" />
              <span>Project Site</span> <span className="text-red-500">*</span>
            </label>
            <select
              name="siteId"
              required
              className="w-full px-4 py-3 bg-white border border-[#e4eaf0] rounded-[16px] text-sm font-bold text-[#16273a] focus:outline-none focus:ring-2 focus:ring-[#13558e] shadow-sm"
            >
              {sites.length === 0 ? (
                <option value="">No sites found</option>
              ) : (
                sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* CATEGORY & PAYMENT MODE GRID */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#647387] mb-1.5">
                <Tag size={14} className="text-emerald-600" />
                <span>Category</span>
              </label>
              <select
                name="category"
                defaultValue="SITE_PETTY_CASH"
                className="w-full px-3.5 py-3 bg-white border border-[#e4eaf0] rounded-[16px] text-xs font-bold text-[#16273a] focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              >
                <option value="SITE_PETTY_CASH">Petty Cash</option>
                <option value="MATERIAL">Material</option>
                <option value="LABOUR">Labour Wage</option>
                <option value="TRANSPORT">Transport</option>
                <option value="TOOLS_EQUIPMENT">Tools & Equip</option>
                <option value="DIESEL">Diesel / Fuel</option>
                <option value="MISCELLANEOUS">Misc</option>
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#647387] mb-1.5">
                <CreditCard size={14} className="text-violet-600" />
                <span>Mode</span>
              </label>
              <select
                name="paymentMode"
                defaultValue="CASH"
                className="w-full px-3.5 py-3 bg-white border border-[#e4eaf0] rounded-[16px] text-xs font-bold text-[#16273a] focus:outline-none focus:ring-2 focus:ring-violet-500 shadow-sm"
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI / GPay</option>
                <option value="BANK_TRANSFER">Bank Xfer</option>
                <option value="CREDIT">Credit</option>
              </select>
            </div>
          </div>

          {/* VENDOR NAME */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#647387] mb-1.5">
              <User size={14} className="text-amber-600" />
              <span>Vendor / Recipient</span>
            </label>
            <input
              type="text"
              name="paidTo"
              placeholder="e.g. Local Hardware Store"
              className="w-full px-4 py-3 bg-white border border-[#e4eaf0] rounded-[16px] text-sm font-semibold text-[#16273a] focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-[#94a3b8] shadow-sm"
            />
          </div>

          {/* NOTES */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#647387] mb-1.5">
              <FileText size={14} className="text-blue-600" />
              <span>Description / Notes</span>
            </label>
            <textarea
              name="notes"
              rows={2}
              placeholder="Details about items purchased..."
              className="w-full px-4 py-3 bg-white border border-[#e4eaf0] rounded-[16px] text-sm text-[#16273a] focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-[#94a3b8] shadow-sm resize-none"
            />
          </div>

          {/* SUBMIT BUTTON */}
          <button
            type="submit"
            className="w-full mt-3 py-4 px-6 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 active:scale-[0.98] text-white font-black rounded-[18px] text-base shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center gap-2"
          >
            <Send size={18} />
            <span>Submit Expense</span>
          </button>
        </form>
      </div>
    </div>
  )
}
