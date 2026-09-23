'use server'

import { requireUser } from '@/lib/auth/require-user'
import { hasPermission } from '@/lib/permissions'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/audit'
import {
  approvalRequiresSite,
  assertApprovalSiteBinding,
  WELL_FORMED_APPROVAL_SITE_FILTER,
} from '@/lib/approvals/site-binding'
import type { ApprovalEntityType, ApprovalPriority, ApprovalStatus, Prisma, SalaryRunStatus } from '@prisma/client'

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
 * Resolves the entity an approval points at strictly inside the approval tenant:
 * always by company, and by site whenever the approval/request is site bound.
 * Returns null when the entity does not exist inside that scope.
 */
async function findLinkedApprovalEntity(
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

export async function createApprovalAction(data: {
  siteId?: string | null
  entityType: ApprovalEntityType
  entityId: string
  title: string
  amount?: number | null
  description?: string | null
  priority?: ApprovalPriority
  approvalType?: string
}) {
  const user = await requireUser()
  if (data.entityType === 'VARIATION') {
    throw new Error('Unsupported: VARIATION approvals cannot be requested through this workflow')
  }

  // Fail closed before any entity lookup or write: a site-bound entity may never be
  // attached to a company-level request.
  if (!data.siteId && approvalRequiresSite(data.entityType)) {
    throw new Error(`Forbidden: ${data.entityType} approvals require a site and this request carries no site`)
  }

  const site = data.siteId
    ? await prisma.site.findFirst({
        where: {
          id: data.siteId,
          ...(user.role === 'SUPER_ADMIN' ? {} : { companyId: user.companyId! }),
          deletedAt: null,
        },
        select: { id: true, companyId: true },
      })
    : null

  if (data.siteId && !site) {
    throw new Error('Forbidden: Site not found or access denied')
  }

  const companyId = site?.companyId ?? user.companyId ?? null
  if (!companyId) throw new Error('Unauthorized: No active company context')

  const linkedEntity = await findLinkedApprovalEntity(data.entityType, data.entityId, {
    companyId,
    siteId: site?.id ?? null,
  })
  if (!linkedEntity) {
    throw new Error('Forbidden: Entity not found or access denied')
  }

  const approval = await prisma.approval.create({
    data: {
      companyId,
      siteId: site?.id ?? null,
      entityType: data.entityType,
      entityId: data.entityId,
      title: data.title,
      amount: data.amount ? data.amount : null,
      description: data.description || null,
      priority: data.priority || 'NORMAL',
      approvalType: data.approvalType || 'OPERATIONAL',
      requestedById: user.id,
      currentStatus: 'PENDING',
      submittedAt: new Date(),
    },
  })

  await prisma.approvalTimeline.create({
    data: {
      companyId,
      approvalId: approval.id,
      actorUserId: user.id,
      action: 'SUBMITTED',
      toStatus: 'PENDING',
      note: 'Workflow approval requested',
    },
  })

  revalidatePath('/approvals')
  revalidatePath('/mobile/approvals')
  return approval
}

export async function getApprovalsAction(filter?: {
  status?: string
  entityType?: string
  search?: string
}) {
  const user = await requireUser()
  const companyFilter = user.role === 'SUPER_ADMIN' ? {} : { companyId: user.companyId! }

  // Malformed legacy rows are excluded by the query itself: they must not be listed,
  // because every downstream action on them is refused anyway.
  const where: Record<string, unknown> = {
    ...companyFilter,
    deletedAt: null,
    ...WELL_FORMED_APPROVAL_SITE_FILTER,
  }

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
      site: { select: { name: true } },
      requestedBy: { select: { name: true, email: true, avatar: true } },
      approvedBy: { select: { name: true } },
      rejectedBy: { select: { name: true } },
      _count: { select: { comments: true } },
    },
    orderBy: { submittedAt: 'desc' },
    take: 100,
  })

  return approvals
}

export async function getApprovalByIdAction(id: string) {
  const user = await requireUser()
  const companyFilter = user.role === 'SUPER_ADMIN' ? {} : { companyId: user.companyId! }

  const approval = await prisma.approval.findFirst({
    where: { id, ...companyFilter, deletedAt: null },
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

  if (!approval) throw new Error('Approval not found or access denied')
  assertApprovalSiteBinding(approval)

  const entityData = await findLinkedApprovalEntity(approval.entityType, approval.entityId, {
    companyId: approval.companyId,
    siteId: approval.siteId,
  })

  return { approval, entityData }
}

const OPEN_APPROVAL_STATUSES: ApprovalStatus[] = ['PENDING', 'SUBMITTED', 'PENDING_REVIEW']

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

export async function approveApprovalAction(id: string, note?: string, confirmationText?: string) {
  const user = await requireUser()
  const companyFilter = user.role === 'SUPER_ADMIN' ? {} : { companyId: user.companyId! }
  const approval = await prisma.approval.findFirst({ where: { id, ...companyFilter, deletedAt: null } })
  if (!approval) throw new Error('Approval not found')
  assertApprovalSiteBinding(approval)
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

    const transition = await tx.approval.updateMany({
      where: {
        id,
        companyId: approval.companyId,
        deletedAt: null,
        currentStatus: { in: OPEN_APPROVAL_STATUSES },
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

  const companyFilter = user.role === 'SUPER_ADMIN' ? {} : { companyId: user.companyId! }
  const approval = await prisma.approval.findFirst({ where: { id, ...companyFilter, deletedAt: null } })
  if (!approval) throw new Error('Approval not found')
  assertApprovalSiteBinding(approval)

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
  const canManagePay = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ACCOUNTANT'].includes(user.role) || hasPermission(user.role as never, 'salary.markPaid') || hasPermission(user.role as never, 'payments.manage')
  if (!canManagePay) {
    throw new Error('Forbidden: You are not authorized to disburse payments')
  }

  const approvalWhere = user.role === 'SUPER_ADMIN'
    ? { id, deletedAt: null }
    : { id, companyId: user.companyId!, deletedAt: null }
  const approval = await prisma.approval.findFirst({ where: approvalWhere })
  if (!approval) throw new Error('Approval not found')
  assertApprovalSiteBinding(approval)
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
  const user = await requireUser()
  if (!comment || comment.trim().length < 1) throw new Error('Comment cannot be empty')

  const approvalWhere = user.role === 'SUPER_ADMIN'
    ? { id: approvalId, deletedAt: null }
    : { id: approvalId, companyId: user.companyId!, deletedAt: null }
  const approval = await prisma.approval.findFirst({
    where: approvalWhere,
    select: { id: true, companyId: true, entityType: true, siteId: true },
  })
  if (!approval) throw new Error('Approval not found')
  assertApprovalSiteBinding(approval)

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
  const user = await requireUser()
  const companyFilter = user.role === 'SUPER_ADMIN' ? {} : { companyId: user.companyId! }
  // A malformed legacy row can never be actioned, so it must not be counted or summed
  // into a figure that invites someone to action it.
  const scope = { ...companyFilter, deletedAt: null, ...WELL_FORMED_APPROVAL_SITE_FILTER }

  const pending = await prisma.approval.count({
    where: { ...scope, currentStatus: { in: ['PENDING', 'SUBMITTED', 'PENDING_REVIEW'] } },
  })

  const urgent = await prisma.approval.count({
    where: { ...scope, currentStatus: { in: ['PENDING', 'SUBMITTED', 'PENDING_REVIEW'] }, priority: 'URGENT' },
  })

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const approvedWeek = await prisma.approval.count({
    where: { ...scope, currentStatus: { in: ['APPROVED', 'PAID'] }, approvedAt: { gte: sevenDaysAgo } },
  })

  const pendingAmountAgg = await prisma.approval.aggregate({
    where: { ...scope, currentStatus: { in: ['PENDING', 'SUBMITTED', 'PENDING_REVIEW'] } },
    _sum: { amount: true },
  })

  return {
    pending,
    urgent,
    approvedWeek,
    pendingAmount: pendingAmountAgg._sum.amount ? Number(pendingAmountAgg._sum.amount) : 0,
  }
}
