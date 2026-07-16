import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import ExpenseTableClient from './ExpenseTableClient'

export const dynamic = 'force-dynamic'

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ limit?: string; siteId?: string }> }) {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user
  const { limit, siteId } = await searchParams
  const take = limit ? parseInt(limit, 10) : 50

  const siteFilter = siteId ? { siteId } : {}

  const expenses = await prisma.expense.findMany({
    where: { companyId, deletedAt: null, ...siteFilter },
    include: { site: { select: { name: true } }, createdBy: { select: { name: true, id: true } } },
    orderBy: { createdAt: 'desc' },
    take,
  })

  const sites = await prisma.site.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const pending = expenses.filter(e => e.approvalStatus === 'PENDING').length
  const approved = expenses.filter(e => ['APPROVED', 'PAID'].includes(e.approvalStatus)).reduce((s, e) => s + Number(e.amount), 0)

  const canEdit = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ACCOUNTANT', 'SITE_ENGINEER', 'PROJECT_MANAGER'].includes(session.user.role)

  return (
    <div className="flex flex-col gap-5.5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold m-0 mb-1 tracking-tight text-slate-900">Expenses &amp; Bills</h1>
          <p className="text-slate-500 text-xs m-0">{expenses.length} records · {pending} pending approval</p>
        </div>
        <Link href="/mobile/add/expense" className="inline-flex items-center gap-1.5 bg-[#fc6e20] text-white rounded-lg px-4 py-2.5 text-sm font-bold hover:bg-[#e85b0d] transition-colors shadow-sm no-underline">
          <Plus className="w-4 h-4" /> Add Expense
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {[
          { label: 'Total Recorded', value: formatCurrency(total), color: 'text-[#fc6e20]' },
          { label: 'Approved / Paid', value: formatCurrency(approved), color: 'text-emerald-600' },
          { label: 'Pending Approval', value: String(pending) + ' bills', color: 'text-amber-600' },
        ].map(c => (
          <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-[10.5px] text-slate-500 font-bold mb-2 uppercase tracking-wider">{c.label}</div>
            <div className={`text-2xl font-extrabold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Site filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/expenses" className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${!siteId ? 'bg-[#fc6e20] text-white border-[#fc6e20]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
          All Sites
        </Link>
        {sites.map(s => (
          <Link key={s.id} href={`/expenses?siteId=${s.id}`} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${siteId === s.id ? 'bg-[#fc6e20] text-white border-[#fc6e20]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            {s.name}
          </Link>
        ))}
      </div>

      {/* Table with edit/delete */}
      <ExpenseTableClient
        expenses={expenses.map(e => ({
          id: e.id,
          description: e.description,
          billNumber: e.billNumber,
          siteName: e.site.name,
          category: e.category,
          amount: Number(e.amount),
          date: (e.billDate ?? e.createdAt).toISOString(),
          createdByName: e.createdBy.name,
          createdById: e.createdBy.id,
          approvalStatus: e.approvalStatus,
          paymentMode: e.paymentMode,
          paidTo: e.paidTo,
          notes: e.notes,
        }))}
        currentUserId={session.user.id}
        currentUserRole={session.user.role}
        canEdit={canEdit}
        hasMore={expenses.length === take}
        loadMoreHref={`/expenses?limit=${take + 50}${siteId ? `&siteId=${siteId}` : ''}`}
      />
    </div>
  )
}
