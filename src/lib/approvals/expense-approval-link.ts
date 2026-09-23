import prisma from '@/lib/prisma'
import type { ApprovalEntityType, ApprovalStatus } from '@prisma/client'
import type { SessionUser } from '@/types'

/**
 * Maps the legacy bills endpoints — which address an *expense* id — onto the approval id
 * the hardened actions expect.
 *
 * The endpoints used to act on the expense directly and then fan the decision out to
 * every approval row whose `entityId` matched, with no company or site predicate at all.
 * The mapping here is the opposite: the expense is resolved inside the caller tenant
 * first, and the approval is then looked up under that expense's exact company *and*
 * site. An approval belonging to another company, sitting on another site of the same
 * company, or carrying the malformed `siteId = null` binding simply cannot be selected,
 * so those rows fail closed instead of being transitioned.
 *
 * Nothing here mutates: the caller hands the resolved id to the hardened action, which
 * still re-applies the live principal, the site-binding guard, the per-entity approve
 * permission, the linked entity re-resolution, the conditional transition, the timeline
 * entry and the audit record.
 */

/** Either type may front an expense: the bills workflow raises both. */
const EXPENSE_APPROVAL_ENTITY_TYPES: ApprovalEntityType[] = ['EXPENSE', 'BILL']

const OPEN_APPROVAL_STATUSES: ApprovalStatus[] = ['PENDING', 'SUBMITTED', 'PENDING_REVIEW']

/**
 * Bounded read: a second open row is already a refusal, so the rest are never needed.
 * A few extra rows are still fetched so a closed-only history can be told apart from an
 * expense that carries no approval request at all.
 */
const LINKED_APPROVAL_SCAN_LIMIT = 5

/**
 * Resolves the single open approval request that the legacy endpoint may act on.
 *
 * Throws — never mutates — whenever the mapping is not unambiguous: no request, several
 * open requests, or a request that is already closed. `approvalApiError` turns each
 * message into the status code the REST surface has always spoken.
 */
export async function resolveExpenseApprovalId(expenseId: string, user: SessionUser): Promise<string> {
  const companyFilter = user.role === 'SUPER_ADMIN' ? {} : { companyId: user.companyId! }

  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, ...companyFilter, deletedAt: null },
    select: { id: true, companyId: true, siteId: true },
  })
  if (!expense) throw new Error('Expense not found')

  // Expense.siteId is non-nullable in the schema; refusing anyway keeps the company-wide
  // widening structurally impossible rather than merely unreachable.
  if (!expense.siteId) {
    throw new Error(
      `Forbidden: expense ${expense.id} carries no site binding and cannot be actioned through this endpoint`
    )
  }

  const linked = await prisma.approval.findMany({
    where: {
      entityId: expense.id,
      entityType: { in: EXPENSE_APPROVAL_ENTITY_TYPES },
      companyId: expense.companyId,
      siteId: expense.siteId,
      deletedAt: null,
    },
    select: { id: true, currentStatus: true },
    orderBy: { submittedAt: 'desc' },
    take: LINKED_APPROVAL_SCAN_LIMIT,
  })

  const open = linked.filter((approval) => OPEN_APPROVAL_STATUSES.includes(approval.currentStatus))
  if (open.length === 1) return open[0].id

  if (open.length > 1) {
    throw new Error(
      'Conflict: this expense is linked to more than one open approval request, so it cannot be actioned unambiguously here — use the approvals workflow'
    )
  }
  if (linked.length > 0) {
    throw new Error('Conflict: the approval request linked to this expense is already processed')
  }

  throw new Error(
    'Approval request not found for this expense — raise it through the approvals workflow before approving or rejecting'
  )
}
