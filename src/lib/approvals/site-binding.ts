import type { ApprovalEntityType, Prisma } from '@prisma/client'

/**
 * PURCHASE_ORDER is the only deliberately company-level approval entity. Every other
 * entity type keeps its records under a single site, so its approval must carry that
 * site: without one the entity lookup and every linked write silently widen to a
 * company-only match that resolves a record on any site of the company.
 *
 * Every other entity type must additionally sit on a live site of the approval's own
 * company: `Approval.companyId` and `Approval.siteId` are independent columns, so a row
 * can name company A and a site of company B.
 *
 * This module is the single definition of those rules. The server actions and the REST
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
 * Query-level counterpart of the guards in this module: every list, count, detail,
 * comment and transition query composes this predicate, so a row is only ever admitted
 * when
 *
 *  - it is a company-level entity type carrying no site at all, or
 *  - the site it carries still exists, is not soft deleted and — whenever the approval
 *    company is known to the caller — belongs to exactly that company.
 *
 * A malformed site-null row on a site-bound type matches neither branch, and neither
 * does an approval — PURCHASE_ORDER included — pinned to a deleted site or, given a
 * company, to another tenant's site. Both branches are positive conditions, so a NULL
 * `siteId` cannot slip through SQL three-valued logic.
 *
 * Prisma cannot compare `Approval.companyId` with `Site.companyId` inside one `where`,
 * so without a company (a SUPER_ADMIN read spanning every tenant) this is only the
 * live-site prefilter: such a read must also select `APPROVAL_SITE_BINDING_SELECT` and
 * drop rows with `hasExactApprovalSiteBinding`. Every read path does so for every
 * principal, which keeps the in-memory proof independent of how the query was scoped.
 */
export function approvalSiteScopeFilter(companyId?: string | null): Prisma.ApprovalWhereInput {
  return {
    OR: [
      { siteId: null, entityType: { in: COMPANY_LEVEL_APPROVAL_ENTITY_TYPES } },
      { site: { is: companyId ? { deletedAt: null, companyId } : { deletedAt: null } } },
    ],
  }
}

/**
 * The live-site prefilter without a company. Only for reads that cannot know the
 * approval company up front; see `approvalSiteScopeFilter`.
 *
 * Treated as immutable — it is spread into a `where`, never mutated in place.
 */
export const APPROVAL_SITE_SCOPE_FILTER: Prisma.ApprovalWhereInput = approvalSiteScopeFilter()

/** The site columns `hasExactApprovalSiteBinding` decides on. */
export const APPROVAL_SITE_BINDING_SELECT = {
  select: { companyId: true, deletedAt: true },
} satisfies Prisma.SiteDefaultArgs

export type ApprovalBoundSite = { companyId: string; deletedAt: Date | null }

export type ApprovalTenantSiteBinding = ApprovalSiteBinding & {
  companyId: string
  /** The approval's `site` relation as selected by `APPROVAL_SITE_BINDING_SELECT`. */
  site?: ApprovalBoundSite | null
}

/**
 * In-memory proof of the exact tenant binding, required before an approval row may be
 * returned, counted, commented on or transitioned:
 *
 *  - a row without a site is only admitted for a company-level entity type, and
 *  - a row with a site is only admitted when that site was actually loaded, is live and
 *    is owned by the approval's own company.
 *
 * A legacy row stamped company A but pinned to live site B of company B passes the
 * live-site prefilter, and its linked entity can claim company A on site B too, so this
 * check is what refuses it. A row whose `site` was not selected is refused as well:
 * missing evidence never counts as a match.
 */
export function hasExactApprovalSiteBinding(approval: ApprovalTenantSiteBinding) {
  if (!approval.siteId) return !approvalRequiresSite(approval.entityType)
  const site = approval.site
  return Boolean(site && !site.deletedAt && site.companyId === approval.companyId)
}
