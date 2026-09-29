'use server'

import { revalidatePath } from 'next/cache'
import { createApprovalRequestRecord } from '@/lib/approvals/submit'
import { requireAssignedScopeMutation } from '@/lib/auth/site-mutation'
import { prisma } from '@/lib/prisma'

/*
 * Files a DPR. The live principal must hold `dpr.create` with the DPR module enabled on
 * its live company, and the site must be an ACTIVE, live site of that company within the
 * principal's `assignedSiteScope` — the same sites the mobile DPR picker lists, so a
 * SITE_ENGINEER or SUPERVISOR files only on the sites it is assigned to.
 */
export async function createDpr(formData: FormData) {
  const { user, scope } = await requireAssignedScopeMutation('dpr.create', 'DPR')

  const siteId = formData.get('siteId') as string
  const workDone = formData.get('workDone') as string
  const labourCount = parseInt(formData.get('labourCount') as string) || 0
  const delayReason = formData.get('delayReason') as string
  const dateStr = formData.get('date') as string
  const date = dateStr ? new Date(dateStr) : new Date()

  if (!siteId || typeof siteId !== 'string' || !workDone?.trim() || Number.isNaN(date.getTime())) {
    throw new Error('Invalid DPR submission')
  }

  const site = await prisma.site.findFirst({
    where: { id: siteId, ...scope, status: 'ACTIVE' },
    select: { id: true },
  })
  if (!site) throw new Error('FORBIDDEN: Site not found or access denied')

  const companyId = user.companyId

  // DPR, approval and its initial timeline entry commit together, so a failed approval
  // write can never leave a DPR with no approval pointing at it. The approval is written
  // on the internal writer, not the public action: `dpr.create` above is what authorizes
  // this flow, and a SUPERVISOR — who files DPRs but holds no approvals.view — must still
  // be able to submit the report it just created.
  const dpr = await prisma.$transaction(async (tx) => {
    const created = await tx.dailyProgressReport.create({
      data: {
        companyId,
        siteId: site.id,
        workDone: workDone.trim(),
        labourCount,
        delayReason: delayReason || null,
        date,
        createdById: user.id,
      },
    })

    await createApprovalRequestRecord(tx, user, {
      companyId,
      siteId: site.id,
      entityType: 'DPR',
      entityId: created.id,
      title: `DPR: ${workDone.trim().substring(0, 35)}...`,
      description: `Work completed: ${workDone.trim()}\nLabour count: ${labourCount}\nDelay rationale: ${delayReason || 'None'}`,
      priority: 'NORMAL',
      approvalType: 'OPERATIONAL',
    })

    return created
  })

  revalidatePath('/approvals')
  revalidatePath('/mobile/approvals')

  return { success: true, dprId: dpr.id }
}
