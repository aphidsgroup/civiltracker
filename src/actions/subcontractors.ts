'use server'

import type { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auditLogData } from '@/lib/audit-data'
import {
  bindOptionalSite,
  optionalText,
  parseNonNegativeAmount,
  requiredText,
  requireAssignedScopeMutation,
  requireTenantMutation,
} from '@/lib/auth/site-mutation'
import {
  SUBCONTRACTOR_NOT_FOUND,
  editSubcontractor,
  parseSubcontractorEdit,
  parseSubcontractorPayment,
  paySubcontractor,
} from '@/lib/subcontractor-financials'

/** A subcontractor of exactly `companyId` that is company-wide or on a live site. */
function boundSubcontractorWhere(id: string, companyId: string) {
  return { id, companyId, OR: [{ siteId: null }, { site: { companyId, deletedAt: null } }] }
}

/**
 * Active subcontractors of the live company that are company-wide or on a live site
 * within the principal's assigned-site scope.
 */
function activeScopedSubcontractorWhere(companyId: string, scope: Prisma.SiteWhereInput): Prisma.SubcontractorWhereInput {
  return { companyId, isActive: true, OR: [{ siteId: null }, { site: scope }] }
}

/*
 * Adds a subcontractor. Live `materials.update` + MATERIALS is checked before any read;
 * a chosen site must be a live site of exactly the live company, blank stays company-wide.
 */
export async function createSubcontractorAction(formData: FormData) {
  const user = await requireTenantMutation('materials.update', 'MATERIALS')
  const name = requiredText(formData.get('name'), 'Subcontractor name')
  const workOrderValue = parseNonNegativeAmount(formData.get('workOrderValue'), 'work order value', 0)
  const siteId = await bindOptionalSite(formData.get('siteId'), user.companyId)

  await prisma.subcontractor.create({
    data: {
      companyId: user.companyId,
      siteId,
      name,
      phone: optionalText(formData.get('phone')),
      trade: optionalText(formData.get('trade')),
      gst: optionalText(formData.get('gst')),
      workOrderValue,
      status: 'Active',
    },
  })

  redirect('/subcontractors')
}

/*
 * Edits a subcontractor. Live `materials.update` + MATERIALS and the assigned-site scope
 * are checked before any read; a financial change needs the name typed back and a reason.
 * The re-read, guarded write and audit share one transaction (see `editSubcontractor`).
 */
export async function updateSubcontractorAction(formData: FormData) {
  const { user, scope } = await requireAssignedScopeMutation('materials.update', 'MATERIALS')
  const edit = parseSubcontractorEdit(formData)

  await prisma.$transaction((tx) => editSubcontractor(tx, user, activeScopedSubcontractorWhere(user.companyId, scope), edit))
  revalidatePath('/subcontractors')
}

/*
 * Records a payment as an advance increment. Needs live `payments.manage` + MATERIALS, the
 * assigned-site scope, the name typed back and a reason; audited in the same transaction.
 */
export async function markSubcontractorPaidAction(formData: FormData) {
  const { user, scope } = await requireAssignedScopeMutation('payments.manage', 'MATERIALS')
  const payment = parseSubcontractorPayment(formData)

  await prisma.$transaction((tx) => paySubcontractor(tx, user, activeScopedSubcontractorWhere(user.companyId, scope), payment))
  revalidatePath('/subcontractors')
}

/*
 * Deactivates a subcontractor once its name is typed back; audited as the live principal.
 * The re-read, guarded write and audit record share one transaction.
 */
export async function deactivateSubcontractorAction(formData: FormData) {
  const user = await requireTenantMutation('materials.update', 'MATERIALS')
  const companyId = user.companyId
  const id = requiredText(formData.get('id'), 'Subcontractor')
  const typed = typeof formData.get('dangerConfirmText') === 'string' ? (formData.get('dangerConfirmText') as string).trim() : ''

  await prisma.$transaction(async (tx) => {
    const sub = await tx.subcontractor.findFirst({
      where: boundSubcontractorWhere(id, companyId),
      select: { id: true, name: true, trade: true, status: true, isActive: true, raBilled: true, advance: true, retention: true },
    })
    if (!sub) throw new Error(SUBCONTRACTOR_NOT_FOUND)
    if (typed !== sub.name.trim()) {
      throw new Error('Remove confirmation text did not match the subcontractor name.')
    }

    const result = await tx.subcontractor.updateMany({ where: boundSubcontractorWhere(sub.id, companyId), data: { isActive: false } })
    if (result.count !== 1) throw new Error(SUBCONTRACTOR_NOT_FOUND)

    const snapshot = { trade: sub.trade, status: sub.status, raBilled: Number(sub.raBilled), advance: Number(sub.advance), retention: Number(sub.retention), name: sub.name }
    await tx.auditLog.create({
      data: auditLogData({
        userId: user.id,
        companyId,
        action: 'UPDATE',
        module: 'SUBCONTRACTOR',
        recordId: sub.id,
        description: `${user.name ?? user.email} deactivated subcontractor "${sub.name}"`,
        before: { isActive: sub.isActive, ...snapshot },
        after: { isActive: false, ...snapshot },
      }),
    })
  })

  revalidatePath('/subcontractors')
}
