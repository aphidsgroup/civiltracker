import { Prisma } from '@prisma/client'
import type { ApprovalStatus } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireUser } from '@/lib/auth/require-user'
import { hasPermission } from '@/lib/permissions'
import { filterApprovalsWithLinkedEntity } from '@/lib/approvals/detail'
import type { LinkedApprovalRef } from '@/lib/approvals/detail'
import { APPROVAL_SITE_BINDING_SELECT, APPROVAL_SITE_SCOPE_FILTER } from '@/lib/approvals/site-binding'
import type { SessionUser } from '@/types'

/** Statuses an approval can still be actioned from. */
export const OPEN_APPROVAL_STATUSES: ApprovalStatus[] = ['PENDING', 'SUBMITTED', 'PENDING_REVIEW']

/**
 * Composes a caller predicate with the rules every approval read shares: never a
 * soft-deleted row, and only a company-level row without a site or a row whose site is
 * live. Wrapped in `AND` so a caller predicate carrying its own `OR` cannot collide
 * with the site-scope `OR`.
 */
export function validApprovalWhere(where: Prisma.ApprovalWhereInput): Prisma.ApprovalWhereInput {
  return { AND: [where, { deletedAt: null }, APPROVAL_SITE_SCOPE_FILTER] }
}

/** The columns `filterValidApprovals` decides on. */
export const VALID_APPROVAL_BINDING_SELECT = {
  id: true,
  companyId: true,
  siteId: true,
  entityType: true,
  entityId: true,
  site: APPROVAL_SITE_BINDING_SELECT,
} satisfies Prisma.ApprovalSelect

export type ValidApprovalCandidate = LinkedApprovalRef

/**
 * Keeps only the approvals an approver could actually action: a well-formed site
 * binding on a live site of the approval's own tenant, and a linked entity that resolves
 * under that exact binding. Both rules live in `filterApprovalsWithLinkedEntity`, so this
 * and the approval actions cannot drift apart. Input order is preserved.
 */
export async function filterValidApprovals<T extends ValidApprovalCandidate>(approvals: T[]): Promise<T[]> {
  return filterApprovalsWithLinkedEntity(approvals)
}

/**
 * Counts valid approvals matching `where`. The linked entity is polymorphic and cannot be
 * expressed in a SQL count, so the binding columns of the matching rows are fetched and
 * entity-checked with one batched lookup per entity type.
 */
export async function countValidApprovals(where: Prisma.ApprovalWhereInput): Promise<number> {
  const rows = await prisma.approval.findMany({
    where: validApprovalWhere(where),
    select: VALID_APPROVAL_BINDING_SELECT,
  })
  return (await filterValidApprovals(rows)).length
}

/**
 * Sums the amounts of valid open approvals per site, for report figures. Only the given
 * sites are queried, and each approval must belong to the company of the site it is
 * summed under. Sites without a valid open approval are absent from the map.
 */
export async function sumValidOpenApprovalAmountsBySite(
  sites: Array<{ id: string; companyId: string }>
): Promise<Map<string, Prisma.Decimal>> {
  const totals = new Map<string, Prisma.Decimal>()
  if (sites.length === 0) return totals

  const siteCompany = new Map(sites.map((site) => [site.id, site.companyId]))
  const rows = await prisma.approval.findMany({
    where: validApprovalWhere({
      siteId: { in: [...siteCompany.keys()] },
      currentStatus: { in: OPEN_APPROVAL_STATUSES },
    }),
    select: { ...VALID_APPROVAL_BINDING_SELECT, amount: true },
  })

  for (const approval of await filterValidApprovals(rows)) {
    if (!approval.siteId || !approval.amount) continue
    if (siteCompany.get(approval.siteId) !== approval.companyId) continue
    totals.set(approval.siteId, (totals.get(approval.siteId) ?? new Prisma.Decimal(0)).add(approval.amount))
  }

  return totals
}

/**
 * The pending-approval figure of one site's overview, or `null` when the viewer may not
 * see it. `user` must be the live `requireUser` principal.
 *
 * The permission is checked before any query, so a role without `approvals.view` learns
 * neither the figure nor whether one exists. A tenant principal only ever gets a figure
 * for a site of its own company; a SUPER_ADMIN gets it for any site. The count is keyed
 * to the site's own company, so an approval stamped with another company but pinned to
 * this site is never counted here.
 */
export async function countSitePendingApprovalsForViewer(
  user: SessionUser,
  site: { id: string; companyId: string }
): Promise<number | null> {
  if (!hasPermission(user.role, 'approvals.view')) return null
  if (user.role !== 'SUPER_ADMIN' && site.companyId !== user.companyId) return null

  return countValidApprovals({ companyId: site.companyId, siteId: site.id, currentStatus: 'PENDING' })
}

/**
 * Navigation badge count of pending approvals. The principal is re-resolved from the
 * database, so a demoted role or revoked membership stops seeing the queue size on the
 * next render instead of at token expiry. A principal that cannot be resolved, or that
 * lacks `approvals.view`, gets no badge and triggers no approval read.
 */
export async function getPendingApprovalBadgeCount(): Promise<number> {
  const user = await requireUser().catch(() => null)
  if (!user || !hasPermission(user.role, 'approvals.view')) return 0

  const companyFilter = user.role === 'SUPER_ADMIN' ? {} : { companyId: user.companyId! }
  return countValidApprovals({ ...companyFilter, currentStatus: 'PENDING' })
}
