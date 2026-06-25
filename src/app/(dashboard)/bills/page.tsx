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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 3px', letterSpacing: '-0.02em' }}>Bill Approval</h1>
        <p style={{ color: 'var(--mut)', fontSize: '13px', margin: 0 }}>{pendingBills.length} bills awaiting approval</p>
      </div>
      <BillApprovalList bills={pendingBills} />
    </div>
  )
}
