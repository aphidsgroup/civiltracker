import { prisma } from '@/lib/prisma'
import { Prisma, ApprovalStatus } from '@prisma/client'
import { redirect } from 'next/navigation'
import { assignedSiteWhere, exitDeniedPage, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'
import Link from 'next/link'
import BillApprovalList from '@/components/bills/BillApprovalList'

export const dynamic = 'force-dynamic'

const TABS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'PAID'] as const

export default async function SiteBillsPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params
  const gate = await resolveTenantPageAccess({ grants: [{ permission: 'bills.view', module: 'BILLS' }] })
  if (gate.status === 'denied') exitDeniedPage(gate, `/sites/${id}/bills`)
  const { companyId } = gate.access

  const { tab } = await searchParams
  const activeTab = TABS.find((t) => t === tab) ?? 'PENDING'

  // The page reads nothing until the id names a live site of exactly this company that the
  // principal may see; the layout's own lookup renders in parallel and is not a guard.
  const site = await prisma.site.findFirst({ where: { id, ...(await assignedSiteWhere(gate.access)) }, select: { id: true } })
  if (!site) redirect('/sites')
  const siteId = site.id

  const whereClause: Prisma.ExpenseWhereInput = { companyId, siteId, deletedAt: null }
  if (activeTab !== 'ALL') {
    whereClause.approvalStatus = activeTab as ApprovalStatus
  }

  const bills = await prisma.expense.findMany({
    where: whereClause,
    include: { site: { select: { name: true, id: true } }, createdBy: { select: { name: true } }, billAttachments: true },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="flex flex-col gap-5.5 mt-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between border-b border-slate-200 pb-4 gap-4">
        <div>
          <h2 className="text-xl font-extrabold m-0 mb-1 tracking-tight text-slate-900">Site Bills</h2>
          <p className="text-slate-500 text-xs m-0">{bills.length} bills found for this site</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-lg overflow-x-auto w-full sm:w-auto">
          {TABS.map(t => (
            <Link key={t} href={`/sites/${siteId}/bills?tab=${t}`} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${activeTab === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
              {t}
            </Link>
          ))}
        </div>
      </div>
      <BillApprovalList bills={bills} />
    </div>
  )
}
