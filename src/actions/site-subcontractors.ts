'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { auditLogData } from '@/lib/audit-data'
import { requireAssignedSiteMutation, requireSiteMutation } from '@/lib/auth/site-mutation'
import {
  editSubcontractor,
  parseSubcontractorEdit,
  parseSubcontractorPayment,
  paySubcontractor,
} from '@/lib/subcontractor-financials'

/*
 * Site subcontractor page actions. Each is bound to the page's site id, which arrives
 * from the client and is re-authorized here: the live permission + MATERIALS, then a
 * live site of exactly the live company (for edits and payments, one the principal is
 * assigned to), then a subcontractor of that company that is unassigned or assigned to
 * that site. Edits need `materials.update`; recording a payment needs `payments.manage`.
 */

const SUB_NOT_FOUND = 'FORBIDDEN: Subcontractor not found or access denied'

function siteSubcontractorWhere(id: string, companyId: string, siteId: string) {
  return { id, companyId, OR: [{ siteId: null }, { siteId }] }
}

/** Active subcontractors of the live company that are company-wide or on the bound site. */
function activeSiteSubcontractorWhere(companyId: string, siteId: string): Prisma.SubcontractorWhereInput {
  return { companyId, isActive: true, OR: [{ siteId: null }, { siteId }] }
}

/*
 * Edits a subcontractor of the bound, assigned site. A financial change needs the name
 * typed back and a reason; the re-read, guarded write and audit share one transaction.
 */
export async function updateSiteSubcontractor(siteId: string, formData: FormData) {
  const { user, site } = await requireAssignedSiteMutation(siteId, 'materials.update', 'MATERIALS')
  const edit = parseSubcontractorEdit(formData)

  await prisma.$transaction((tx) => editSubcontractor(tx, user, activeSiteSubcontractorWhere(user.companyId, site.id), edit))
  revalidatePath(`/sites/${site.id}/subcontractors`)
}

/*
 * Records a payment on a subcontractor of the bound, assigned site as an advance
 * increment, with the name typed back and a reason; audited in the same transaction.
 */
export async function markSiteSubcontractorPaid(siteId: string, formData: FormData) {
  const { user, site } = await requireAssignedSiteMutation(siteId, 'payments.manage', 'MATERIALS')
  const payment = parseSubcontractorPayment(formData)

  await prisma.$transaction((tx) => paySubcontractor(tx, user, activeSiteSubcontractorWhere(user.companyId, site.id), payment))
  revalidatePath(`/sites/${site.id}/subcontractors`)
}

export async function deactivateSiteSubcontractor(siteId: string, formData: FormData) {
  const { user, site } = await requireSiteMutation(siteId, 'materials.update', 'MATERIALS')
  const id = formData.get('id') as string
  const typed = (formData.get('dangerConfirmText') as string | null)?.trim()

  const where = siteSubcontractorWhere(id, user.companyId, site.id)

  // The re-read, guarded write and audit record share one transaction: an audit failure
  // rolls the deactivation back.
  await prisma.$transaction(async (tx) => {
    const sub = await tx.subcontractor.findFirst({
      where,
      select: { id: true, name: true, trade: true, status: true, isActive: true, raBilled: true, advance: true, retention: true },
    })
    if (!sub) throw new Error(SUB_NOT_FOUND)
    if (typed !== sub.name.trim()) {
      throw new Error('Remove confirmation text did not match the subcontractor name.')
    }

    const result = await tx.subcontractor.updateMany({ where, data: { isActive: false } })
    if (result.count !== 1) throw new Error(SUB_NOT_FOUND)

    await tx.auditLog.create({
      data: auditLogData({
        userId: user.id,
        companyId: user.companyId,
        action: 'UPDATE',
        module: 'SUBCONTRACTOR',
        recordId: sub.id,
        description: `${user.name ?? user.email} deactivated subcontractor "${sub.name}"`,
        before: { isActive: sub.isActive, trade: sub.trade, status: sub.status, raBilled: Number(sub.raBilled), advance: Number(sub.advance), retention: Number(sub.retention), name: sub.name },
        after: { isActive: false, trade: sub.trade, status: sub.status, raBilled: Number(sub.raBilled), advance: Number(sub.advance), retention: Number(sub.retention), name: sub.name },
      }),
    })
  })

  revalidatePath(`/sites/${site.id}/subcontractors`)
}
