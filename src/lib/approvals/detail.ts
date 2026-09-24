import prisma from '@/lib/prisma'
import {
  approvalRequiresSite,
  hasValidApprovalSiteBinding,
  WELL_FORMED_APPROVAL_SITE_FILTER,
} from '@/lib/approvals/site-binding'
import type { ApprovalSiteBinding } from '@/lib/approvals/site-binding'
import type { ApprovalEntityType } from '@prisma/client'
import type { SessionUser } from '@/types'

/**
 * The single answer every refused detail read gives: a missing approval, a malformed
 * row and an approval whose linked entity cannot be reached are indistinguishable.
 */
export const APPROVAL_DETAIL_NOT_FOUND = 'Approval not found or access denied'

/**
 * Resolves the entity an approval points at strictly inside the approval tenant:
 * always by company, and by site whenever the approval/request is site bound.
 * Returns null when the entity does not exist inside that scope.
 */
export async function findLinkedApprovalEntity(
  entityType: ApprovalEntityType,
  entityId: string,
  scope: { companyId: string; siteId?: string | null }
) {
  const tenantScope = { id: entityId, companyId: scope.companyId }
  const siteScope = scope.siteId ? { siteId: scope.siteId } : {}

  switch (entityType) {
    case 'EXPENSE':
    case 'BILL':
      return prisma.expense.findFirst({
        where: { ...tenantScope, deletedAt: null, ...siteScope },
        include: { billAttachments: true },
      })
    case 'DPR':
      return prisma.dailyProgressReport.findFirst({
        where: { ...tenantScope, ...siteScope },
      })
    case 'MATERIAL_REQUEST':
      return prisma.material.findFirst({
        where: { ...tenantScope, ...siteScope },
      })
    case 'SALARY_RUN':
      return prisma.salaryRun.findFirst({
        where: { ...tenantScope, ...siteScope },
        include: { items: true },
      })
    case 'DOCUMENT':
      return prisma.document.findFirst({
        where: { ...tenantScope, ...siteScope },
      })
    case 'PURCHASE_ORDER':
      return prisma.purchaseOrder.findFirst({
        where: tenantScope,
      })
    default:
      return null
  }
}

async function findApprovalDetailRow(user: SessionUser, id: string) {
  const companyFilter = user.role === 'SUPER_ADMIN' ? {} : { companyId: user.companyId! }

  return prisma.approval.findFirst({
    where: {
      id,
      ...companyFilter,
      deletedAt: null,
      // A site-bound approval without a site is excluded by the query itself: it can
      // never be actioned, so it must not be detailed either.
      ...WELL_FORMED_APPROVAL_SITE_FILTER,
    },
    include: {
      site: { select: { name: true, location: true } },
      requestedBy: { select: { name: true, email: true, role: true, avatar: true } },
      reviewedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      rejectedBy: { select: { name: true } },
      comments: {
        include: { user: { select: { name: true, avatar: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
      timelines: {
        include: { actor: { select: { name: true, role: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
}

type ApprovalDetailRow = NonNullable<Awaited<ReturnType<typeof findApprovalDetailRow>>>

export type ApprovalDetailResolution =
  | {
      status: 'found'
      approval: ApprovalDetailRow
      entityData: NonNullable<Awaited<ReturnType<typeof findLinkedApprovalEntity>>>
    }
  | { status: 'not_found' }
  | { status: 'malformed'; binding: ApprovalSiteBinding }

/**
 * Entity-bound approval detail read shared by the server action and the REST handler.
 *
 * The caller has already passed its approvals.view gate; this owns everything after it.
 * An approval is only detailed once the entity it points at has been re-resolved under
 * the approval's exact binding — its company always, its site for every type except the
 * company-level PURCHASE_ORDER. A row whose entity is missing, owned by another company
 * or sitting on another site of the same company is `not_found`, so its title,
 * description, comments, timeline and attachments never leave this function.
 *
 * A malformed site binding is reported separately only so the action can keep its
 * existing refusal; no entity lookup is attempted for it.
 */
export async function resolveEntityBoundApprovalDetail(
  user: SessionUser,
  id: string
): Promise<ApprovalDetailResolution> {
  const approval = await findApprovalDetailRow(user, id)
  if (!approval) return { status: 'not_found' }

  if (!hasValidApprovalSiteBinding(approval)) {
    return {
      status: 'malformed',
      binding: { id: approval.id, entityType: approval.entityType, siteId: approval.siteId },
    }
  }

  // Structurally refuses the company-wide widening rather than relying on the binding
  // check above: a site-bound type is only ever looked up on the approval site.
  const requiresSite = approvalRequiresSite(approval.entityType)
  if (requiresSite && !approval.siteId) return { status: 'not_found' }

  const entityData = await findLinkedApprovalEntity(approval.entityType, approval.entityId, {
    companyId: approval.companyId,
    siteId: requiresSite ? approval.siteId : null,
  })
  if (!entityData) return { status: 'not_found' }

  return { status: 'found', approval, entityData }
}
