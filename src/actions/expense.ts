'use server'

import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import type { ExpenseCategory, PaymentMode } from '@/types'
import {
  assertApprovalSubmitPermission,
  createApprovalRequestRecord,
  findApprovalSubmitSite,
} from '@/lib/approvals/submit'
import { logActivity } from '@/lib/audit'

export async function createExpenseAction(data: {
  siteId: string
  amount: number
  category: ExpenseCategory
  paymentMode: PaymentMode
  paidTo?: string
  billNumber?: string
  notes?: string
  cloudinaryPublicId?: string
  secureUrl?: string
  format?: string
  bytes?: number
}) {
  const user = await requirePermission('expenses.create')

  // Every gate below is pure, so a denied principal is refused before any Prisma read.
  // The approval is raised on the internal writer rather than the public action, so the
  // participation and entity-specific submit permissions that action enforced are
  // re-applied here.
  const entityType = data.secureUrl ? 'BILL' : 'EXPENSE'
  if (!hasPermission(user.role, 'approvals.view')) {
    throw new Error('Forbidden: Missing required permission "approvals.view"')
  }
  assertApprovalSubmitPermission(user, entityType)
  if (!user.companyId && user.role !== 'SUPER_ADMIN') {
    throw new Error('Unauthorized: No active company context')
  }

  // Live, in-tenant site only (any company for a SUPER_ADMIN, but never soft deleted).
  // The expense and approval are both bound to the company that owns this site.
  const site = await findApprovalSubmitSite(user, data.siteId)
  if (!site) throw new Error('Forbidden: Site not found or access denied')
  const companyId = site.companyId

  // Expense, bill attachment, approval and its initial timeline entry commit together,
  // so a failed approval write can never leave a PENDING expense with no approval.
  const expense = await prisma.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        companyId,
        siteId: site.id,
        category: data.category,
        amount: data.amount,
        paymentMode: data.paymentMode,
        paidTo: data.paidTo,
        billNumber: data.billNumber,
        notes: data.notes,
        description: data.notes ? data.notes.substring(0, 50) : `Expense for ${data.category}`,
        createdById: user.id,
        ...(data.secureUrl && data.cloudinaryPublicId
          ? {
              billAttachments: {
                create: {
                  cloudinaryPublicId: data.cloudinaryPublicId,
                  secureUrl: data.secureUrl,
                  format: data.format,
                  bytes: data.bytes,
                  uploadedById: user.id,
                },
              },
            }
          : {}),
      },
    })

    await createApprovalRequestRecord(tx, user, {
      companyId,
      siteId: site.id,
      entityType,
      entityId: created.id,
      title: created.description,
      amount: Number(data.amount),
      description: data.notes || `Logged by ${user.name}`,
      priority: data.amount > 50000 ? 'HIGH' : 'NORMAL',
      approvalType: 'FINANCIAL',
    })

    return created
  })

  await logActivity({
    userId: user.id,
    companyId,
    action: 'CREATE',
    module: data.secureUrl ? 'BILL_UPLOAD' : 'EXPENSE',
    recordId: expense.id,
    description: `${user.name ?? user.email} logged ₹${data.amount.toLocaleString('en-IN')} ${data.category.replace(/_/g, ' ')} expense on ${site.name}`,
    after: { amount: data.amount, category: data.category, site: site.name },
  })

  revalidatePath('/dashboard')
  revalidatePath('/mobile/home')
  revalidatePath('/expenses')
  revalidatePath('/bills')
  revalidatePath('/approvals')
  revalidatePath('/mobile/approvals')

  return { success: true, expenseId: expense.id }
}
