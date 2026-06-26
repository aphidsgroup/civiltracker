import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { EXPENSE_CATEGORIES, PAYMENT_MODES } from '@/lib/constants'
import { ExpenseCategory, PaymentMode } from '@prisma/client'
import { Check } from 'lucide-react'

export default async function NewExpensePage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  const sites = await prisma.site.findMany({
    where: { companyId: session.user.companyId, deletedAt: null },
    orderBy: { name: 'asc' }
  })

  async function createExpense(formData: FormData) {
    'use server'
    const session = await auth()
    if (!session?.user?.companyId) throw new Error('Unauthorized')

    const siteId = formData.get('siteId') as string
    const category = formData.get('category') as ExpenseCategory
    const paymentMode = formData.get('paymentMode') as PaymentMode
    const amount = Number(formData.get('amount'))
    const description = formData.get('description') as string
    const date = new Date(formData.get('date') as string)
    const paidTo = formData.get('paidTo') as string
    
    // Create the expense
    await prisma.expense.create({
      data: {
        companyId: session.user.companyId,
        siteId,
        createdById: session.user.id,
        category,
        paymentMode,
        amount,
        description,
        billDate: date,
        paidTo,
        approvalStatus: 'PENDING',
      }
    })

    // Also update site spent amount
    await prisma.site.update({
      where: { id: siteId },
      data: { spent: { increment: amount } }
    })

    redirect('/dashboard') // In reality should redirect to /expenses which doesn't exist yet
  }

  return (
    <>
      <div className="flex items-center justify-between pb-6 border-b border-slate-200 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Record Expense</h1>
      </div>
      
      <div className="max-w-2xl">
        <form action={createExpense} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col md:col-span-2">
              <label className="text-xs font-bold text-slate-500 mb-1.5">Project site</label>
              <select name="siteId" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent bg-white" required>
                <option value="">Select site...</option>
                {sites.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.location})</option>
                ))}
              </select>
            </div>
            
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-500 mb-1.5">Amount (₹)</label>
              <input name="amount" type="number" step="0.01" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent bg-white" placeholder="0.00" required />
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-500 mb-1.5">Date</label>
              <input name="date" type="date" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent bg-white" defaultValue={new Date().toISOString().split('T')[0]} required />
            </div>
            
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-500 mb-1.5">Category</label>
              <select name="category" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent bg-white" required>
                {EXPENSE_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-500 mb-1.5">Payment mode</label>
              <select name="paymentMode" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent bg-white" required>
                {PAYMENT_MODES.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col md:col-span-2">
              <label className="text-xs font-bold text-slate-500 mb-1.5">Paid to</label>
              <input name="paidTo" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent bg-white" placeholder="Vendor or person name" required />
            </div>
            
            <div className="flex flex-col md:col-span-2">
              <label className="text-xs font-bold text-slate-500 mb-1.5">Description</label>
              <textarea name="description" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#fc6e20] focus:border-transparent bg-white min-h-[100px]" placeholder="Expense details..."></textarea>
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <Link href="/dashboard" className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors">Cancel</Link>
            <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-[#fc6e20] rounded-lg hover:bg-[#e85b0d] cursor-pointer transition-colors shadow-sm">
              <Check className="w-4 h-4" />
              Record Expense
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
