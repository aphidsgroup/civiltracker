import type { ApprovalEntityType, Prisma } from '@prisma/client'

/**
 * PURCHASE_ORDER is the only deliberately company-level approval entity. Every other
 * entity type keeps its records under a single site, so its approval must carry that
 * site: without one the entity lookup and every linked write silently widen to a
 * company-only match that resolves a record on any site of the company.
 *
 * This module is the single definition of that rule. The server actions and the REST
 * handlers both import it so the API cannot drift back into its own, laxer copy.
 */
const COMPANY_LEVEL_APPROVAL_ENTITY_TYPES: ApprovalEntityType[] = ['PURCHASE_ORDER']

const COMPANY_LEVEL_LOOKUP: ReadonlySet<ApprovalEntityType> = new Set(COMPANY_LEVEL_APPROVAL_ENTITY_TYPES)

export function approvalRequiresSite(entityType: ApprovalEntityType) {
  return !COMPANY_LEVEL_LOOKUP.has(entityType)
}

export type ApprovalSiteBinding = {
  id: string
  entityType: ApprovalEntityType
  siteId: string | null
}

/**
 * True only for rows whose site binding matches their entity type. Rows written before
 * the binding rule — or written straight to the database — can still carry
 * siteId = null on a site-bound entity type, which turns every read and transition
 * into a company-wide match.
 */
export function hasValidApprovalSiteBinding(approval: ApprovalSiteBinding) {
  return Boolean(approval.siteId) || !approvalRequiresSite(approval.entityType)
}

/**
 * Fail-closed guard for approval rows that already exist in the database. Every path
 * that resolves or mutates a linked entity calls this first, so a malformed row is
 * refused before entity resolution, transition, timeline, audit, budget sync or any
 * linked write.
 */
export function assertApprovalSiteBinding(approval: ApprovalSiteBinding) {
  if (hasValidApprovalSiteBinding(approval)) return
  throw new Error(
    `Forbidden: ${approval.entityType} approval ${approval.id} carries no site binding and cannot be read or actioned`
  )
}

/**
 * Query-level counterpart of the guard above, and the single live-site rule: every
 * list, count, detail, comment and transition query composes this predicate, so a row
 * is only ever admitted when
 *
 *  - it is a company-level entity type carrying no site at all, or
 *  - the site it carries still exists and is not soft deleted.
 *
 * A malformed site-null row on a site-bound type matches neither branch, and neither
 * does an approval — PURCHASE_ORDER included — pinned to a deleted site. Both are
 * excluded by the query rather than fetched and then discarded. Both branches are
 * positive conditions, so a NULL `siteId` cannot slip through SQL three-valued logic.
 *
 * Treated as immutable — it is spread into a `where`, never mutated in place.
 */
export const APPROVAL_SITE_SCOPE_FILTER: Prisma.ApprovalWhereInput = {
  OR: [
    { siteId: null, entityType: { in: COMPANY_LEVEL_APPROVAL_ENTITY_TYPES } },
    { site: { is: { deletedAt: null } } },
  ],
}
