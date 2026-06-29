import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // 1. Delete standalone leaves / activity logs
    await prisma.auditLog.deleteMany()
    await prisma.reportExport.deleteMany()
    await prisma.notification.deleteMany()
    await prisma.supportTicket.deleteMany()
    
    // 2. Approvals
    await prisma.approvalTimeline.deleteMany()
    await prisma.approvalComment.deleteMany()
    await prisma.approval.deleteMany()
    
    // 3. Finance & Client
    await prisma.invoice.deleteMany()
    await prisma.payment.deleteMany()
    
    // 4. Documents & Purchases
    await prisma.document.deleteMany()
    await prisma.purchaseOrder.deleteMany()
    await prisma.purchaseRequest.deleteMany()
    await prisma.bOQItem.deleteMany()
    
    // 5. Site Ops
    await prisma.task.deleteMany()
    await prisma.sitePhoto.deleteMany()
    await prisma.dailyProgressReport.deleteMany()
    await prisma.contractorAttendance.deleteMany()
    
    // 6. Materials & Labour
    await prisma.materialTransaction.deleteMany()
    await prisma.material.deleteMany()
    
    await prisma.salaryRunItem.deleteMany()
    await prisma.salaryRun.deleteMany()
    
    await prisma.labourAttendance.deleteMany()
    await prisma.labour.deleteMany()
    
    // 7. Expenses
    await prisma.billAttachment.deleteMany()
    await prisma.expense.deleteMany()
    await prisma.mediaAsset.deleteMany()
    
    // 8. Core Relations
    await prisma.vendor.deleteMany()
    await prisma.client.deleteMany()
    await prisma.subcontractor.deleteMany()
    
    // 9. Site and Company Core
    await prisma.site.deleteMany()
    await prisma.companyMember.deleteMany()
    await prisma.companySubscription.deleteMany()
    await prisma.company.deleteMany()
    
    // 10. Delete all users EXCEPT super admin
    await prisma.user.deleteMany({
      where: {
        role: { not: 'SUPER_ADMIN' }
      }
    })

    return NextResponse.json({ success: true, message: 'Database wiped successfully.' })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
