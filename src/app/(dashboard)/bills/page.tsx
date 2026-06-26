import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import BillApprovalList from '@/components/bills/BillApprovalList'

export default async function BillsPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const pendingBills = await prisma.expense.findMany({
    where: { companyId, approvalStatus: 'PENDING', deletedAt: null },
    include: { site: { select: { name: true, id: true } }, createdBy: { select: { name: true } }, billAttachments: true },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="flex flex-col gap-5.5">
      <div>
        <h1 className="text-2xl font-extrabold m-0 mb-1 tracking-tight text-slate-900">Bill Approval</h1>
        <p className="text-slate-500 text-xs m-0">{pendingBills.length} bills awaiting approval</p>
      </div>
      <BillApprovalList bills={pendingBills} />
    </div>
  )
}
