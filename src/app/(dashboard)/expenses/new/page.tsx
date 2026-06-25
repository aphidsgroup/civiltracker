import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { EXPENSE_CATEGORIES, PAYMENT_MODES } from '@/lib/constants'
import { ExpenseCategory, PaymentMode } from '@prisma/client'

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
      <div className="topbar">
        <div className="title">Record Expense</div>
      </div>
      
      <div style={{ padding: '24px' }}>
        <form action={createExpense} className="formcard">
          <div className="fgrid">
            <div className="field span2">
              <label className="flabel">Project site</label>
              <select name="siteId" className="inp" required>
                <option value="">Select site...</option>
                {sites.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.location})</option>
                ))}
              </select>
            </div>
            
            <div className="field">
              <label className="flabel">Amount (₹)</label>
              <input name="amount" type="number" step="0.01" className="inp" placeholder="0.00" required />
            </div>
            <div className="field">
              <label className="flabel">Date</label>
              <input name="date" type="date" className="inp" defaultValue={new Date().toISOString().split('T')[0]} required />
            </div>
            
            <div className="field">
              <label className="flabel">Category</label>
              <select name="category" className="inp" required>
                {EXPENSE_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="flabel">Payment mode</label>
              <select name="paymentMode" className="inp" required>
                {PAYMENT_MODES.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div className="field span2">
              <label className="flabel">Paid to</label>
              <input name="paidTo" className="inp" placeholder="Vendor or person name" required />
            </div>
            
            <div className="field span2">
              <label className="flabel">Description</label>
              <textarea name="description" className="ct-textarea" placeholder="Expense details..."></textarea>
            </div>
          </div>
          
          <div className="formfoot">
            <Link href="/dashboard" className="btnG" style={{ textDecoration: 'none' }}>Cancel</Link>
            <button type="submit" className="btnP" style={{ border: 'none', fontFamily: 'inherit' }}>
              <svg className="svg18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10"/></svg>
              Record Expense
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
