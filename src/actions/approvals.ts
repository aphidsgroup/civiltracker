'use server'

import { requireUser } from '@/lib/auth/require-user'
import { hasPermission } from '@/lib/permissions'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/audit'
import { approvalAssignedSiteFilter, requireApprovalReader } from '@/lib/approvals/read-guard'
import {
  APPROVAL_DETAIL_NOT_FOUND,
  filterApprovalsWithLinkedEntity,
  resolveEntityBoundApprovalDetail,
} from '@/lib/approvals/detail'
import {
  APPROVAL_SITE_BINDING_SELECT,
  approvalRequiresSite,
  approvalSiteScopeFilter,
  assertApprovalSiteBinding,
  hasExactApprovalSiteBinding,
} from '@/lib/approvals/site-binding'
import { requireApprovalSubmitter, submitApprovalRequest } from '@/lib/approvals/submit'
import { OPEN_APPROVAL_STATUSES } from '@/lib/approvals/valid-reads'
import type { ApprovalRequestInput } from '@/lib/approvals/submit'
import type { ApprovalEntityType, ApprovalStatus, Prisma, SalaryRunStatus } from '@prisma/client'
import type { SessionUser } from '@/types'

/**
 * SalaryRunStatus is DRAFT | SUBMITTED | VERIFIED | APPROVED | PAID — there is no
 * REJECTED member. A rejected payroll therefore returns to DRAFT, the schema default
 * and the only status from which the run can be corrected and resubmitted, so that a
 * rejected approval never leaves its salary run sitting on an approved/payable status.
 */
const REJECTED_SALARY_RUN_STATUS: SalaryRunStatus = 'DRAFT'

/** Human label for an entity type, e.g. MATERIAL_REQUEST -> "material request". */
function approvalEntityLabel(entityType: ApprovalEntityType) {
  return entityType.toLowerCase().replace(/_/g, ' ')
}

/** The stored binding of an approval row and what it claims to point at. */
type LinkedApprovalEntityRef = {
  companyId: string
  siteId: string | null
  entityType: ApprovalEntityType
  entityId: string
}

/**
 * The company an approval query may be pinned to: the principal's own for a tenant
 * member, none for a SUPER_ADMIN whose reads span every company. With a company the
 * site scope is exact at query level; without one every row still has to pass
 * `hasExactApprovalSiteBinding`, which each read applies regardless of principal.
 */
function approvalQueryCompanyId(user: SessionUser) {
  return user.role === 'SUPER_ADMIN' ? null : user.companyId!
}

/**
 * Tenant, exact site binding and — for a field role — the assigned-site policy, all at
 * query level, so an approval outside any of them is never loaded.
 */
async function approvalQueryScope(user: SessionUser): Promise<Prisma.ApprovalWhereInput> {
  const companyId = approvalQueryCompanyId(user)
  return {
    ...(companyId ? { companyId } : {}),
    deletedAt: null,
    ...approvalSiteScopeFilter(companyId),
    ...(await approvalAssignedSiteFilter(user)),
  }
}

/**
 * Loads the approval a transition acts on, for the transition to refuse unless the row
 * is well-formed and sits on a live site of its own company. A cross-bound row answers
 * exactly like a missing one, before any permission, entity, transition, timeline or
 * audit step.
 *
 * `entityTypes` is the set the caller may action, decided from the live role before this
 * query runs. A row of any other type is excluded by the query itself, so it answers
 * exactly like a missing id instead of revealing that it exists. The full set adds no
 * predicate.
 */
async function findActionableApproval(user: SessionUser, id: string, entityTypes: ApprovalEntityType[]) {
  const approval = await prisma.approval.findFirst({
    where: {
      id,
      ...(await approvalQueryScope(user)),
      ...(entityTypes.length < APPROVAL_ENTITY_TYPES.length ? { entityType: { in: entityTypes } } : {}),
    },
    include: { site: APPROVAL_SITE_BINDING_SELECT },
  })
  if (!approval) throw new Error('Approval not found')
  assertApprovalSiteBinding(approval)
  if (!hasExactApprovalSiteBinding(approval)) throw new Error('Approval not found')
  return approval
}

/**
 * Re-resolves the linked entity on the transaction client under the approval's exact
 * binding: always by company, and by site for every type except the company-level
 * PURCHASE_ORDER. Only the id is selected — this is an existence check that decides
 * whether a transition may happen at all, not a read of entity data.
 *
 * Returns null whenever the entity cannot be reached inside that scope, including for an
 * entity type that no delegate owns, so an unmapped or retired type fails closed.
 */
async function resolveLinkedApprovalEntityInTenant(
  tx: Prisma.TransactionClient,
  approval: LinkedApprovalEntityRef
) {
  let siteScope: { siteId?: string } = {}
  if (approvalRequiresSite(approval.entityType)) {
    // assertApprovalSiteBinding already refused a site-bound approval that carries no
    // site; refusing again here makes the company-wide widening structurally
    // impossible rather than merely unreachable.
    if (!approval.siteId) return null
    siteScope = { siteId: approval.siteId }
  }

  const scope = { id: approval.entityId, companyId: approval.companyId, ...siteScope }
  const select = { id: true }

  switch (approval.entityType) {
    case 'EXPENSE':
    case 'BILL':
      return tx.expense.findFirst({ where: { ...scope, deletedAt: null }, select })
    case 'DPR':
      return tx.dailyProgressReport.findFirst({ where: scope, select })
    case 'MATERIAL_REQUEST':
      return tx.material.findFirst({ where: scope, select })
    case 'SALARY_RUN':
      return tx.salaryRun.findFirst({ where: scope, select })
    case 'DOCUMENT':
      return tx.document.findFirst({ where: scope, select })
    case 'PURCHASE_ORDER':
      return tx.purchaseOrder.findFirst({ where: scope, select })
    default:
      return null
  }
}

/**
 * Gate every transition shares: the entity an approval points at is only trusted once it
 * has been resolved inside the approval tenant, in the same transaction, *before* the
 * conditional transition and its timeline entry.
 *
 * `createApprovalAction` validates the entity when the request is raised, but a row that
 * predates that rule — or that was inserted straight into the database — was never
 * validated at all. Without this, only EXPENSE/BILL and SALARY_RUN were re-checked by
 * their linked status write, and a DPR, material request, document or purchase order
 * that is missing, owned by another company or sitting on another site of the same
 * company still produced a transition, a timeline entry and an audit record.
 */
async function assertLinkedApprovalEntityInTenant(
  tx: Prisma.TransactionClient,
  approval: LinkedApprovalEntityRef,
  verb: string
) {
  const linked = await resolveLinkedApprovalEntityInTenant(tx, approval)
  if (!linked) {
    throw new Error(
      `Linked ${approvalEntityLabel(approval.entityType)} not found in the approval tenant and cannot be ${verb}`
    )
  }
}

/**
 * Public entry point for raising an approval request. A Server Action is a public POST
 * endpoint, so the live submit permission is checked before any site, entity or approval
 * read; the tenant/site/entity binding itself lives in `submitApprovalRequest`.
 */
export async function createApprovalAction(data: ApprovalRequestInput) {
  const user = await requireApprovalSubmitter(data.entityType)
  return submitApprovalRequest(user, data)
}

export async function getApprovalsAction(filter?: {
  status?: string
  entityType?: string
  search?: string
}) {
  const user = await requireApprovalReader()

  // Malformed legacy rows and rows bound to a soft-deleted or another tenant's site are
  // excluded by the query itself: they must not be listed, because every downstream
  // action on them is refused anyway.
  const where: Record<string, unknown> = { ...(await approvalQueryScope(user)) }

  if (filter?.status && filter.status !== 'ALL') {
    where.currentStatus = filter.status as ApprovalStatus
  }
  if (filter?.entityType && filter.entityType !== 'ALL') {
    where.entityType = filter.entityType as ApprovalEntityType
  }
  if (filter?.search) {
    where.title = { contains: filter.search, mode: 'insensitive' }
  }

  const approvals = await prisma.approval.findMany({
    where,
    include: {
      site: { select: { name: true, companyId: true, deletedAt: true } },
      requestedBy: { select: { name: true, email: true, avatar: true } },
      approvedBy: { select: { name: true } },
      rejectedBy: { select: { name: true } },
      _count: { select: { comments: true } },
    },
    orderBy: { submittedAt: 'desc' },
    take: 100,
  })

  // Neither the approval → site → company binding (for a SUPER_ADMIN) nor the
  // polymorphic linked entity can be expressed in the query above; a cross-bound row,
  // and a row whose entity is missing, cross-company or on another site, is dropped here
  // with one batched lookup per entity type.
  return filterApprovalsWithLinkedEntity(approvals)
}

export async function getApprovalByIdAction(id: string) {
  const user = await requireApprovalReader()

  const detail = await resolveEntityBoundApprovalDetail(user, id)
  if (detail.status === 'malformed') assertApprovalSiteBinding(detail.binding)
  if (detail.status !== 'found') throw new Error(APPROVAL_DETAIL_NOT_FOUND)

  return { approval: detail.approval, entityData: detail.entityData }
}

function verifyCanApproveEntity(role: string, entityType: string) {
  if (role === 'SUPER_ADMIN' || role === 'COMPANY_ADMIN') return true
  switch (entityType) {
    case 'EXPENSE':
      return hasPermission(role as never, 'expenses.approve')
    case 'BILL':
      return hasPermission(role as never, 'bills.approve')
    case 'SALARY_RUN':
      return hasPermission(role as never, 'salary.approve')
    case 'DPR':
      return hasPermission(role as never, 'dpr.approve')
    case 'MATERIAL_REQUEST':
      return hasPermission(role as never, 'materials.approveRequest')
    case 'PURCHASE_ORDER':
      return hasPermission(role as never, 'purchase.approve')
    case 'VARIATION':
      return hasPermission(role as never, 'variations.approve')
    case 'DOCUMENT':
      return hasPermission(role as never, 'documents.approve')
    default:
      return false
  }
}

const APPROVAL_ENTITY_TYPES: ApprovalEntityType[] = [
  'EXPENSE',
  'BILL',
  'SALARY_RUN',
  'MATERIAL_REQUEST',
  'PURCHASE_ORDER',
  'DPR',
  'VARIATION',
  'DOCUMENT',
]

/**
 * The entity types the live role may approve or reject. A Server Action is a public POST
 * endpoint, so this is decided before any approval query: a role that may action nothing
 * is refused without a lookup, and every other role only ever loads rows it may action.
 */
function requireApprovableEntityTypes(user: SessionUser, verb: 'approve' | 'reject') {
  const entityTypes = APPROVAL_ENTITY_TYPES.filter((entityType) => verifyCanApproveEntity(user.role, entityType))
  if (entityTypes.length === 0) {
    throw new Error(`Forbidden: Role ${user.role} is not authorized to ${verb} approval requests`)
  }
  return entityTypes
}

/**
 * The entity types the live role may disburse: every type with `payments.manage`, only
 * payroll with `salary.markPaid`. Decided before any approval query, like the approve
 * gate.
 */
function requireDisbursableEntityTypes(user: SessionUser) {
  if (user.role === 'SUPER_ADMIN' || user.role === 'COMPANY_ADMIN') return APPROVAL_ENTITY_TYPES
  if (hasPermission(user.role, 'payments.manage')) return APPROVAL_ENTITY_TYPES
  if (hasPermission(user.role, 'salary.markPaid')) return ['SALARY_RUN'] as ApprovalEntityType[]
  throw new Error('Forbidden: You are not authorized to disburse payments')
}

export async function approveApprovalAction(id: string, note?: string, confirmationText?: string) {
  const user = await requireUser()
  const entityTypes = requireApprovableEntityTypes(user, 'approve')
  const approval = await findActionableApproval(user, id, entityTypes)
  if ((confirmationText ?? '').trim() !== 'APPROVE') {
    throw new Error('Approval confirmation text must exactly match APPROVE')
  }
  if (approval.currentStatus === 'APPROVED' || approval.currentStatus === 'REJECTED') {
    throw new Error(`Approval already processed (${approval.currentStatus})`)
  }

  if (!verifyCanApproveEntity(user.role, approval.entityType)) {
    throw new Error(`Forbidden: Role ${user.role} is not authorized to approve ${approval.entityType}`)
  }

  // The conditional transition, its timeline entry and the linked entity mutation are
  // one unit of work: a linked row that cannot be reached inside the approval tenant
  // rolls the approval back to its open status instead of leaving the two out of sync.
  const budgetSiteId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await assertLinkedApprovalEntityInTenant(tx, approval, 'approved')

    // The exact site predicate rides on the conditional write itself, so a site deleted
    // or re-pointed at another tenant after the read above still stops the transition
    // before any timeline or linked write.
    const transition = await tx.approval.updateMany({
      where: {
        id,
        companyId: approval.companyId,
        deletedAt: null,
        currentStatus: { in: OPEN_APPROVAL_STATUSES },
        ...approvalSiteScopeFilter(approval.companyId),
      },
      data: {
        currentStatus: 'APPROVED',
        approvedById: user.id,
        approvedAt: new Date(),
      },
    })
    if (transition.count !== 1) {
      throw new Error('Approval is no longer processable and cannot be approved')
    }

    await tx.approvalTimeline.create({
      data: {
        companyId: approval.companyId,
        approvalId: id,
        actorUserId: user.id,
        action: 'APPROVED',
        fromStatus: approval.currentStatus,
        toStatus: 'APPROVED',
        note: note || 'Request officially approved',
      },
    })

    // The site guard above already refused a site-bound approval without a site, so
    // every linked write below is unconditionally scoped to the approval site.
    if (approval.entityType === 'EXPENSE' || approval.entityType === 'BILL') {
      const linked = await tx.expense.updateMany({
        where: {
          id: approval.entityId,
          companyId: approval.companyId,
          deletedAt: null,
          ...(approval.siteId ? { siteId: approval.siteId } : {}),
        },
        data: { approvalStatus: 'APPROVED', approvedById: user.id, approvedAt: new Date() },
      })
      if (linked.count !== 1) {
        throw new Error('Linked expense not found in the approval tenant and cannot be approved')
      }
      return approval.siteId
    }

    if (approval.entityType === 'SALARY_RUN') {
      const linked = await tx.salaryRun.updateMany({
        where: {
          id: approval.entityId,
          companyId: approval.companyId,
          siteId: approval.siteId,
        },
        data: { status: 'APPROVED' },
      })
      if (linked.count !== 1) {
        throw new Error('Linked salary run not found in the approval tenant and cannot be approved')
      }
    }

    return null
  })

  const updated = { id, currentStatus: 'APPROVED' as ApprovalStatus }

  await logActivity({
    userId: user.id,
    companyId: approval.companyId,
    action: 'APPROVE',
    module: approval.entityType,
    recordId: approval.entityId,
    description: `${user.name ?? user.email} approved ${approvalEntityLabel(approval.entityType)} request "${approval.title}"`,
    before: { status: approval.currentStatus },
    after: { status: 'APPROVED', note },
  })

  // Budget aggregation lives outside the database transaction so an external sync
  // failure cannot roll back a committed approval.
  if (budgetSiteId) {
    const { syncSiteBudget } = await import('@/lib/budget')
    await syncSiteBudget(budgetSiteId)
  }

  revalidatePath('/approvals')
  revalidatePath(`/approvals/${id}`)
  revalidatePath('/mobile/approvals')
  revalidatePath(`/mobile/approvals/${id}`)
  return updated
}

export async function rejectApprovalAction(id: string, reason: string) {
  const user = await requireUser()
  if (!reason || reason.trim().length < 3) {
    throw new Error('Rejection reason is mandatory (minimum 3 characters)')
  }

  const entityTypes = requireApprovableEntityTypes(user, 'reject')
  const approval = await findActionableApproval(user, id, entityTypes)

  if (!verifyCanApproveEntity(user.role, approval.entityType)) {
    throw new Error(`Forbidden: Role ${user.role} is not authorized to reject ${approval.entityType}`)
  }

  // Same unit of work as approval: transition, timeline and the linked entity move
  // together or not at all.
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await assertLinkedApprovalEntityInTenant(tx, approval, 'rejected')

    const transition = await tx.approval.updateMany({
      where: {
        id,
        companyId: approval.companyId,
        deletedAt: null,
        currentStatus: { in: OPEN_APPROVAL_STATUSES },
        ...approvalSiteScopeFilter(approval.companyId),
      },
      data: {
        currentStatus: 'REJECTED',
        rejectedById: user.id,
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
    })
    if (transition.count !== 1) {
      throw new Error('Approval is no longer processable and cannot be rejected')
    }

    await tx.approvalTimeline.create({
      data: {
        companyId: approval.companyId,
        approvalId: id,
        actorUserId: user.id,
        action: 'REJECTED',
        fromStatus: approval.currentStatus,
        toStatus: 'REJECTED',
        note: reason,
      },
    })

    // The site guard above already refused a site-bound approval without a site, so
    // every linked write below is unconditionally scoped to the approval site.
    if (approval.entityType === 'EXPENSE' || approval.entityType === 'BILL') {
      const linked = await tx.expense.updateMany({
        where: {
          id: approval.entityId,
          companyId: approval.companyId,
          deletedAt: null,
          ...(approval.siteId ? { siteId: approval.siteId } : {}),
        },
        data: { approvalStatus: 'REJECTED', rejectedById: user.id, rejectedAt: new Date(), rejectionNote: reason },
      })
      if (linked.count !== 1) {
        throw new Error('Linked expense not found in the approval tenant and cannot be rejected')
      }
    }

    if (approval.entityType === 'SALARY_RUN') {
      const linked = await tx.salaryRun.updateMany({
        where: {
          id: approval.entityId,
          companyId: approval.companyId,
          siteId: approval.siteId,
        },
        data: { status: REJECTED_SALARY_RUN_STATUS },
      })
      if (linked.count !== 1) {
        throw new Error('Linked salary run not found in the approval tenant and cannot be rejected')
      }
    }
  })

  const updated = { id, currentStatus: 'REJECTED' as ApprovalStatus }

  await logActivity({
    userId: user.id,
    companyId: approval.companyId,
    action: 'REJECT',
    module: approval.entityType,
    recordId: approval.entityId,
    description: `${user.name ?? user.email} rejected ${approvalEntityLabel(approval.entityType)} request "${approval.title}"`,
    before: { status: approval.currentStatus },
    after: { status: 'REJECTED', reason },
  })

  revalidatePath('/approvals')
  revalidatePath(`/approvals/${id}`)
  revalidatePath('/mobile/approvals')
  revalidatePath(`/mobile/approvals/${id}`)
  return updated
}

export async function markApprovalPaidAction(id: string, paymentData?: { mode?: string; ref?: string; note?: string }, confirmationText?: string) {
  const user = await requireUser()
  const entityTypes = requireDisbursableEntityTypes(user)
  const approval = await findActionableApproval(user, id, entityTypes)
  if (approval.currentStatus !== 'APPROVED') {
    throw new Error('Only approved requests can be marked paid')
  }
  if ((confirmationText ?? '').trim() !== 'PAID') {
    throw new Error('Disbursement confirmation text must exactly match PAID')
  }

  // Disbursement moves money, so the conditional transition, its timeline entry and the
  // linked entity mutation are one unit of work: a linked row that cannot be reached
  // inside the approval tenant rolls the approval back to APPROVED instead of leaving a
  // PAID request pointing at an unpaid record.
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await assertLinkedApprovalEntityInTenant(tx, approval, 'marked paid')

    const transition = await tx.approval.updateMany({
      where: {
        id,
        companyId: approval.companyId,
        deletedAt: null,
        currentStatus: 'APPROVED',
        ...approvalSiteScopeFilter(approval.companyId),
      },
      data: {
        currentStatus: 'PAID',
        closedAt: new Date(),
      },
    })
    if (transition.count !== 1) {
      throw new Error('Approval is no longer approved and cannot be marked paid')
    }

    await tx.approvalTimeline.create({
      data: {
        companyId: approval.companyId,
        approvalId: id,
        actorUserId: user.id,
        action: 'PAID',
        fromStatus: approval.currentStatus,
        toStatus: 'PAID',
        note: paymentData?.note || `Disbursed via ${paymentData?.mode || 'Bank Transfer'} (Ref: ${paymentData?.ref || 'N/A'})`,
        metadataJson: paymentData || {},
      },
    })

    // The site guard above already refused a site-bound approval without a site, so
    // every linked write below is unconditionally scoped to the approval site.
    if (approval.entityType === 'EXPENSE' || approval.entityType === 'BILL') {
      const linked = await tx.expense.updateMany({
        where: {
          id: approval.entityId,
          companyId: approval.companyId,
          deletedAt: null,
          ...(approval.siteId ? { siteId: approval.siteId } : {}),
        },
        data: { approvalStatus: 'PAID' },
      })
      if (linked.count !== 1) {
        throw new Error('Linked expense not found in the approval tenant and cannot be marked paid')
      }
    } else if (approval.entityType === 'SALARY_RUN') {
      const linked = await tx.salaryRun.updateMany({
        where: {
          id: approval.entityId,
          companyId: approval.companyId,
          siteId: approval.siteId,
        },
        data: { status: 'PAID' },
      })
      if (linked.count !== 1) {
        throw new Error('Linked salary run not found in the approval tenant and cannot be marked paid')
      }
    }
  })

  const updated = { id }

  // Audit and revalidation are external effects: they only describe a disbursement that
  // actually committed.
  await logActivity({
    userId: user.id,
    companyId: approval.companyId,
    action: 'PAID',
    module: approval.entityType,
    recordId: approval.entityId,
    description: `${user.name ?? user.email} marked ${approvalEntityLabel(approval.entityType)} request "${approval.title}" as paid/disbursed`,
    before: { status: approval.currentStatus },
    after: { status: 'PAID', paymentData: paymentData ?? null },
  })

  revalidatePath('/approvals')
  revalidatePath(`/approvals/${id}`)
  revalidatePath('/mobile/approvals')
  revalidatePath(`/mobile/approvals/${id}`)
  return updated
}

export async function addApprovalCommentAction(approvalId: string, comment: string) {
  // Commenting means reading the thread, so it takes the same read gate as the detail
  // view, before any approval query: a caller without approvals.view gets one refusal
  // whether or not the approval exists.
  const user = await requireApprovalReader()
  if (!comment || comment.trim().length < 1) throw new Error('Comment cannot be empty')

  // Only an approval the caller could open may be commented on: missing, cross-tenant,
  // deleted-site and entity-unbound approvals all answer with the same generic refusal.
  const detail = await resolveEntityBoundApprovalDetail(user, approvalId)
  if (detail.status === 'malformed') assertApprovalSiteBinding(detail.binding)
  if (detail.status !== 'found') throw new Error(APPROVAL_DETAIL_NOT_FOUND)
  const { approval } = detail

  const created = await prisma.approvalComment.create({
    data: {
      companyId: approval.companyId,
      approvalId,
      userId: user.id,
      comment: comment.trim(),
    },
  })

  revalidatePath(`/approvals/${approvalId}`)
  revalidatePath(`/mobile/approvals/${approvalId}`)
  return created
}

export async function getApprovalStatsAction() {
  const user = await requireApprovalReader()

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  // A malformed legacy row, a row on a soft-deleted site and a row whose linked entity
  // cannot be reached can never be actioned, so none may be counted or summed into a
  // figure that invites someone to action it. The entity link is polymorphic and cannot
  // be expressed in a count/aggregate, so only the rows that can contribute to a figure
  // are fetched — open ones and those approved this week — and then entity-checked with
  // one batched lookup per entity type.
  const rows = await prisma.approval.findMany({
    where: {
      ...(await approvalQueryScope(user)),
      AND: [
        {
          OR: [
            { currentStatus: { in: OPEN_APPROVAL_STATUSES } },
            { currentStatus: { in: ['APPROVED', 'PAID'] }, approvedAt: { gte: sevenDaysAgo } },
          ],
        },
      ],
    },
    select: {
      id: true,
      companyId: true,
      siteId: true,
      entityType: true,
      entityId: true,
      currentStatus: true,
      priority: true,
      amount: true,
      approvedAt: true,
      site: APPROVAL_SITE_BINDING_SELECT,
    },
  })
  const counted = await filterApprovalsWithLinkedEntity(rows.filter(hasExactApprovalSiteBinding))

  const open = counted.filter((row) => OPEN_APPROVAL_STATUSES.includes(row.currentStatus))
  const approvedWeek = counted.filter(
    (row) =>
      (row.currentStatus === 'APPROVED' || row.currentStatus === 'PAID') &&
      row.approvedAt !== null &&
      row.approvedAt >= sevenDaysAgo
  ).length
  const pendingAmount = open.reduce((sum, row) => sum + (row.amount ? Number(row.amount) : 0), 0)

  return {
    pending: open.length,
    urgent: open.filter((row) => row.priority === 'URGENT').length,
    approvedWeek,
    // Amounts are stored to two decimals; round away float drift from the summation.
    pendingAmount: Math.round(pendingAmount * 100) / 100,
  }
}
