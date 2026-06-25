'use server'

import { requireUser } from '@/lib/auth/require-user'
import { hasPermission } from '@/lib/permissions'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import type { ApprovalEntityType, ApprovalPriority, ApprovalStatus } from '@prisma/client'

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
  const companyId = user.companyId || (user.role === 'SUPER_ADMIN' ? 'cm7companyadmin00000000001' : null)
  if (!companyId) throw new Error('Unauthorized: No active company context')

  const approval = await prisma.approval.create({
    data: {
      companyId,
      siteId: data.siteId || null,
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

  const where: Record<string, unknown> = {
    ...companyFilter,
    deletedAt: null,
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
    where: { id, ...companyFilter },
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

  let entityData = null
  if (approval.entityType === 'EXPENSE' || approval.entityType === 'BILL') {
    entityData = await prisma.expense.findUnique({
      where: { id: approval.entityId },
      include: { billAttachments: true },
    })
  } else if (approval.entityType === 'DPR') {
    entityData = await prisma.dailyProgressReport.findUnique({
      where: { id: approval.entityId },
    })
  } else if (approval.entityType === 'MATERIAL_REQUEST') {
    entityData = await prisma.material.findUnique({
      where: { id: approval.entityId },
    })
  } else if (approval.entityType === 'SALARY_RUN') {
    entityData = await prisma.salaryRun.findUnique({
      where: { id: approval.entityId },
      include: { items: true },
    })
  } else if (approval.entityType === 'DOCUMENT') {
    entityData = await prisma.document.findUnique({
      where: { id: approval.entityId },
    })
  }

  return { approval, entityData }
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

export async function approveApprovalAction(id: string, note?: string) {
  const user = await requireUser()
  const approval = await prisma.approval.findUnique({ where: { id } })
  if (!approval) throw new Error('Approval not found')

  if (!verifyCanApproveEntity(user.role, approval.entityType)) {
    throw new Error(`Forbidden: Role ${user.role} is not authorized to approve ${approval.entityType}`)
  }

  const updated = await prisma.approval.update({
    where: { id },
    data: {
      currentStatus: 'APPROVED',
      approvedById: user.id,
      approvedAt: new Date(),
    },
  })

  await prisma.approvalTimeline.create({
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

  await prisma.auditLog.create({
    data: {
      companyId: approval.companyId,
      userId: user.id,
      action: 'APPROVE',
      module: approval.entityType,
      recordId: approval.entityId,
      before: { status: approval.currentStatus },
      after: { status: 'APPROVED', note },
    },
  })

  if (approval.entityType === 'EXPENSE' || approval.entityType === 'BILL') {
    await prisma.expense.updateMany({
      where: { id: approval.entityId },
      data: { approvalStatus: 'APPROVED', approvedById: user.id, approvedAt: new Date() },
    })
  } else if (approval.entityType === 'SALARY_RUN') {
    await prisma.salaryRun.updateMany({
      where: { id: approval.entityId },
      data: { status: 'APPROVED' },
    })
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

  const approval = await prisma.approval.findUnique({ where: { id } })
  if (!approval) throw new Error('Approval not found')

  if (!verifyCanApproveEntity(user.role, approval.entityType)) {
    throw new Error(`Forbidden: Role ${user.role} is not authorized to reject ${approval.entityType}`)
  }

  const updated = await prisma.approval.update({
    where: { id },
    data: {
      currentStatus: 'REJECTED',
      rejectedById: user.id,
      rejectedAt: new Date(),
      rejectionReason: reason,
    },
  })

  await prisma.approvalTimeline.create({
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

  await prisma.auditLog.create({
    data: {
      companyId: approval.companyId,
      userId: user.id,
      action: 'REJECT',
      module: approval.entityType,
      recordId: approval.entityId,
      before: { status: approval.currentStatus },
      after: { status: 'REJECTED', reason },
    },
  })

  if (approval.entityType === 'EXPENSE' || approval.entityType === 'BILL') {
    await prisma.expense.updateMany({
      where: { id: approval.entityId },
      data: { approvalStatus: 'REJECTED', rejectedById: user.id, rejectedAt: new Date(), rejectionNote: reason },
    })
  }

  revalidatePath('/approvals')
  revalidatePath(`/approvals/${id}`)
  revalidatePath('/mobile/approvals')
  revalidatePath(`/mobile/approvals/${id}`)
  return updated
}

export async function markApprovalPaidAction(id: string, paymentData?: { mode?: string; ref?: string; note?: string }) {
  const user = await requireUser()
  const canManagePay = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ACCOUNTANT'].includes(user.role) || hasPermission(user.role as never, 'salary.markPaid') || hasPermission(user.role as never, 'payments.manage')
  if (!canManagePay) {
    throw new Error('Forbidden: You are not authorized to disburse payments')
  }

  const approval = await prisma.approval.findUnique({ where: { id } })
  if (!approval) throw new Error('Approval not found')

  const updated = await prisma.approval.update({
    where: { id },
    data: {
      currentStatus: 'PAID',
      closedAt: new Date(),
    },
  })

  await prisma.approvalTimeline.create({
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

  if (approval.entityType === 'EXPENSE' || approval.entityType === 'BILL') {
    await prisma.expense.updateMany({
      where: { id: approval.entityId },
      data: { approvalStatus: 'PAID' },
    })
  } else if (approval.entityType === 'SALARY_RUN') {
    await prisma.salaryRun.updateMany({
      where: { id: approval.entityId },
      data: { status: 'PAID' },
    })
  }

  revalidatePath('/approvals')
  revalidatePath(`/approvals/${id}`)
  revalidatePath('/mobile/approvals')
  revalidatePath(`/mobile/approvals/${id}`)
  return updated
}

export async function addApprovalCommentAction(approvalId: string, comment: string) {
  const user = await requireUser()
  if (!comment || comment.trim().length < 1) throw new Error('Comment cannot be empty')

  const approval = await prisma.approval.findUnique({ where: { id: approvalId }, select: { companyId: true } })
  if (!approval) throw new Error('Approval not found')

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

  const pending = await prisma.approval.count({
    where: { ...companyFilter, currentStatus: { in: ['PENDING', 'SUBMITTED', 'PENDING_REVIEW'] }, deletedAt: null },
  })

  const urgent = await prisma.approval.count({
    where: { ...companyFilter, currentStatus: { in: ['PENDING', 'SUBMITTED', 'PENDING_REVIEW'] }, priority: 'URGENT', deletedAt: null },
  })

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const approvedWeek = await prisma.approval.count({
    where: { ...companyFilter, currentStatus: { in: ['APPROVED', 'PAID'] }, approvedAt: { gte: sevenDaysAgo }, deletedAt: null },
  })

  const pendingAmountAgg = await prisma.approval.aggregate({
    where: { ...companyFilter, currentStatus: { in: ['PENDING', 'SUBMITTED', 'PENDING_REVIEW'] }, deletedAt: null },
    _sum: { amount: true },
  })

  return {
    pending,
    urgent,
    approvedWeek,
    pendingAmount: pendingAmountAgg._sum.amount ? Number(pendingAmountAgg._sum.amount) : 0,
  }
}
