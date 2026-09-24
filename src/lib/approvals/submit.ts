import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { hasPermission } from '@/lib/permissions'
import type { Permission } from '@/lib/permissions'
import { requireApprovalReader } from '@/lib/approvals/read-guard'
import { findLinkedApprovalEntity } from '@/lib/approvals/detail'
import { approvalRequiresSite } from '@/lib/approvals/site-binding'
import type { ApprovalEntityType, ApprovalPriority } from '@prisma/client'
import type { SessionUser } from '@/types'

/**
 * The permission that authorizes *originating* each approval entity type. The matrix has
 * no approval-specific create permission, so a request may only be raised by a principal
 * who may also create the thing it asks approval for. PURCHASE_ORDER has no create
 * permission of its own; `purchase.approve` is the only purchase-scoped grant.
 *
 * VARIATION is deliberately absent: the workflow refuses it outright.
 */
const APPROVAL_SUBMIT_PERMISSIONS: Partial<Record<ApprovalEntityType, Permission>> = {
  EXPENSE: 'expenses.create',
  BILL: 'bills.upload',
  DPR: 'dpr.create',
  MATERIAL_REQUEST: 'materials.create',
  SALARY_RUN: 'salary.generate',
  DOCUMENT: 'documents.upload',
  PURCHASE_ORDER: 'purchase.approve',
}

/**
 * Entry guard for raising an approval request through the public action or the REST
 * surface. Two live permissions are required, both resolved from the database principal
 * and both checked before any Prisma read:
 *
 *  - `approvals.view` — participation in the approval workflow at all. VENDOR, CLIENT,
 *    SUBCONTRACTOR and SUPERVISOR do not hold it and are refused here.
 *  - the entity-specific submit permission above, so e.g. an ACCOUNTANT cannot raise an
 *    EXPENSE request or a PURCHASE_MANAGER a DPR request.
 *
 * Tenant, site and entity binding stay in `submitApprovalRequest`.
 */
export async function requireApprovalSubmitter(entityType: ApprovalEntityType): Promise<SessionUser> {
  const user = await requireApprovalReader()

  const permission = APPROVAL_SUBMIT_PERMISSIONS[entityType]
  if (permission && !hasPermission(user.role, permission)) {
    throw new Error(`Forbidden: Missing required permission "${permission}"`)
  }

  return user
}

export type ApprovalRequestInput = {
  siteId?: string | null
  entityType: ApprovalEntityType
  entityId: string
  title: string
  amount?: number | null
  description?: string | null
  priority?: ApprovalPriority
  approvalType?: string
}

/**
 * Raises an approval request bound to its exact tenant, site and entity.
 *
 * Not a server action: this module carries no `'use server'`, so it is only reachable
 * from server code. Callers must already have authorized `user` — the public action via
 * `requireApprovalSubmitter`, and entity-creation flows such as `createDpr` via the
 * permission that let them create the entity this request is raised for.
 */
export async function submitApprovalRequest(user: SessionUser, data: ApprovalRequestInput) {
  if (data.entityType === 'VARIATION') {
    throw new Error('Unsupported: VARIATION approvals cannot be requested through this workflow')
  }

  // Fail closed before any entity lookup or write: a site-bound entity may never be
  // attached to a company-level request.
  if (!data.siteId && approvalRequiresSite(data.entityType)) {
    throw new Error(`Forbidden: ${data.entityType} approvals require a site and this request carries no site`)
  }

  // A soft-deleted site is refused here for every type, a site-pinned PURCHASE_ORDER
  // included.
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
