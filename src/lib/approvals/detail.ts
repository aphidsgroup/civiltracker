import prisma from '@/lib/prisma'
import {
  APPROVAL_SITE_SCOPE_FILTER,
  approvalRequiresSite,
  hasValidApprovalSiteBinding,
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

/** The stored binding of an approval row and what it claims to point at. */
export type LinkedApprovalRef = {
  id: string
  companyId: string
  siteId: string | null
  entityType: ApprovalEntityType
  entityId: string
}

type LinkedEntityRef = { id: string; companyId: string; siteId?: string | null }

/**
 * Batched counterpart of `findLinkedApprovalEntity`: one query per entity type, never
 * one per approval. Only the binding columns are selected — this decides which rows are
 * admitted, it never reads entity data.
 */
function findLinkedEntityRefs(
  entityType: ApprovalEntityType,
  entityIds: string[],
  companyIds: string[]
): Promise<LinkedEntityRef[]> {
  const where = { id: { in: entityIds }, companyId: { in: companyIds } }
  const select = { id: true, companyId: true, siteId: true }

  switch (entityType) {
    case 'EXPENSE':
    case 'BILL':
      return prisma.expense.findMany({ where: { ...where, deletedAt: null }, select })
    case 'DPR':
      return prisma.dailyProgressReport.findMany({ where, select })
    case 'MATERIAL_REQUEST':
      return prisma.material.findMany({ where, select })
    case 'SALARY_RUN':
      return prisma.salaryRun.findMany({ where, select })
    case 'DOCUMENT':
      return prisma.document.findMany({ where, select })
    case 'PURCHASE_ORDER':
      // Company-level by design: a purchase order carries no site.
      return prisma.purchaseOrder.findMany({ where, select: { id: true, companyId: true } })
    default:
      return Promise.resolve([])
  }
}

function linkKey(entityType: ApprovalEntityType, entityId: string, companyId: string, siteId: string | null) {
  return JSON.stringify([entityType, entityId, companyId, siteId])
}

/**
 * Keeps only the approvals whose linked entity resolves under the approval's exact
 * binding — the same rule `resolveEntityBoundApprovalDetail` applies to a single row:
 * its company always, its site for every type except the company-level PURCHASE_ORDER.
 *
 * `Approval.entityId` is polymorphic, so there is no Prisma relation to filter through
 * and the check cannot live in the approval query itself. Instead the candidates are
 * grouped by type and each group is resolved with a single `findMany`, then matched on
 * (type, id, company, site) in memory. A missing, cross-company, wrong-site or
 * soft-deleted entity — and an entity type no delegate owns — never matches, so such a
 * row is neither listed nor counted. Input order is preserved.
 */
export async function filterApprovalsWithLinkedEntity<T extends LinkedApprovalRef>(approvals: T[]): Promise<T[]> {
  const candidates = approvals.filter(
    (approval) => hasValidApprovalSiteBinding(approval) && approval.entityId && approval.companyId
  )

  const byType = new Map<ApprovalEntityType, T[]>()
  for (const approval of candidates) {
    const group = byType.get(approval.entityType) ?? []
    group.push(approval)
    byType.set(approval.entityType, group)
  }

  const reachable = new Set<string>()
  await Promise.all(
    [...byType].map(async ([entityType, group]) => {
      const entityIds = [...new Set(group.map((approval) => approval.entityId))]
      const companyIds = [...new Set(group.map((approval) => approval.companyId))]
      const requiresSite = approvalRequiresSite(entityType)

      for (const entity of await findLinkedEntityRefs(entityType, entityIds, companyIds)) {
        // An entity without a site can never satisfy a site-bound approval.
        if (requiresSite && !entity.siteId) continue
        reachable.add(linkKey(entityType, entity.id, entity.companyId, requiresSite ? entity.siteId! : null))
      }
    })
  )

  return candidates.filter((approval) =>
    reachable.has(
      linkKey(
        approval.entityType,
        approval.entityId,
        approval.companyId,
        approvalRequiresSite(approval.entityType) ? approval.siteId : null
      )
    )
  )
}

async function findApprovalDetailRow(user: SessionUser, id: string) {
  const companyFilter = user.role === 'SUPER_ADMIN' ? {} : { companyId: user.companyId! }

  return prisma.approval.findFirst({
    where: {
      id,
      ...companyFilter,
      deletedAt: null,
      // A site-bound approval without a site, or one bound to a soft-deleted site, is
      // excluded by the query itself: it can never be actioned, so it must not be
      // detailed either.
      ...APPROVAL_SITE_SCOPE_FILTER,
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
