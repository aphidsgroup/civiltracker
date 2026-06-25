import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'

export default async function ExpensesPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const expenses = await prisma.expense.findMany({
    where: { companyId, deletedAt: null },
    include: { site: { select: { name: true } }, createdBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const statusColor: Record<string, string> = { PENDING: 'amber', APPROVED: 'green', PAID: 'blue', REJECTED: 'red', DRAFT: 'mut' }
  const categoryLabels: Record<string, string> = {
    MATERIAL: 'Material', LABOUR: 'Labour', SUBCONTRACTOR: 'Subcontractor',
    TRANSPORT: 'Transport', TOOLS_EQUIPMENT: 'Tools & Equip', SITE_PETTY_CASH: 'Petty Cash',
    DIESEL: 'Diesel', OFFICE_ADMIN: 'Office/Admin', CLIENT_VARIATION: 'Variation', MISCELLANEOUS: 'Misc',
  }

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const pending = expenses.filter(e => e.approvalStatus === 'PENDING').length
  const approved = expenses.filter(e => ['APPROVED', 'PAID'].includes(e.approvalStatus)).reduce((s, e) => s + Number(e.amount), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 3px', letterSpacing: '-0.02em' }}>Expenses & Bills</h1>
          <p style={{ color: 'var(--mut)', fontSize: '13px', margin: 0 }}>{expenses.length} records · {pending} pending approval</p>
        </div>
        <Link href="/mobile/add/expense" className="btn-primary" style={{ textDecoration: 'none' }}>+ Add Expense</Link>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        {[
          { label: 'Total Recorded', value: formatCurrency(total), color: 'var(--p)' },
          { label: 'Approved / Paid', value: formatCurrency(approved), color: 'var(--green)' },
          { label: 'Pending Approval', value: String(pending) + ' bills', color: 'var(--amber)' },
        ].map(c => (
          <div key={c.label} className="ct-card" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: '10.5px', color: 'var(--mut)', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="ct-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line)' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 800, margin: 0 }}>Expense Records</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="ct-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Site</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Date</th>
                <th>By</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(e => (
                <tr key={e.id}>
                  <td>
                    <div style={{ fontWeight: 700, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description}</div>
                    {e.billNumber && <div style={{ fontSize: '11px', color: 'var(--mut)', fontWeight: 500 }}>#{e.billNumber}</div>}
                  </td>
                  <td style={{ fontSize: '12.5px', color: 'var(--mut)', fontWeight: 600 }}>{e.site.name}</td>
                  <td><span className="chip chip-blue" style={{ fontSize: '10px' }}>{categoryLabels[e.category] ?? e.category}</span></td>
                  <td style={{ fontWeight: 800, fontSize: '14px' }}>{formatCurrency(Number(e.amount))}</td>
                  <td style={{ fontSize: '12px', color: 'var(--mut)', fontWeight: 500, whiteSpace: 'nowrap' }}>{formatDate(e.billDate ?? e.createdAt)}</td>
                  <td style={{ fontSize: '12px', color: 'var(--mut)', fontWeight: 600 }}>{e.createdBy.name}</td>
                  <td><span className={`chip chip-${statusColor[e.approvalStatus] ?? 'mut'}`}>{e.approvalStatus}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
