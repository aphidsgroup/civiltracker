import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import BillApprovalList from '@/components/bills/BillApprovalList'

export const dynamic = 'force-dynamic'

export default async function SiteBillsPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<{ tab?: string }> }) {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user
  
  const { id: siteId } = await params
  const { tab } = await searchParams
  const activeTab = tab || 'PENDING'

  const whereClause: any = { companyId, siteId, deletedAt: null }
  if (activeTab !== 'ALL') {
    whereClause.approvalStatus = activeTab
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
          {['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'PAID'].map(t => (
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
