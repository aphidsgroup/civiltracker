'use server'

import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { EXPENSE_CATEGORIES, PAYMENT_MODES } from '@/lib/constants'
import type { ExpenseCategory, PaymentMode } from '@/types'
import {
  assertApprovalSubmitPermission,
  createApprovalRequestRecord,
  findApprovalSubmitSite,
} from '@/lib/approvals/submit'
import { logActivity } from '@/lib/audit'

const ATTACHMENT_NOT_FOUND = 'Forbidden: Uploaded bill not found or access denied'

/** Attachment fields the browser used to send; they are storage facts, never input. */
const CLIENT_ATTACHMENT_FIELDS = ['cloudinaryPublicId', 'secureUrl', 'format', 'bytes'] as const

/*
 * Records an expense and raises its approval. A bill attachment is named only by the id
 * of the MediaAsset `/api/upload` returned: it must be a BILL upload by this same user
 * for exactly this live site and company, not yet attached to any expense, and every
 * attachment field stored is copied from that asset. A URL, public id, format or size
 * sent by the browser is refused.
 */
export async function createExpenseAction(data: {
  siteId: string
  amount: number
  category: ExpenseCategory
  paymentMode: PaymentMode
  paidTo?: string
  billNumber?: string
  notes?: string
  description?: string
  billDate?: Date
  mediaAssetId?: string
}) {
  const user = await requirePermission('expenses.create')

  // Every gate below is pure, so a denied principal is refused before any Prisma read.
  // The approval is raised on the internal writer rather than the public action, so the
  // participation and entity-specific submit permissions that action enforced are
  // re-applied here.
  const input = (data ?? {}) as Record<string, unknown>
  if (CLIENT_ATTACHMENT_FIELDS.some((field) => input[field] !== undefined)) {
    throw new Error('Invalid expense: attach a bill by its uploaded media asset id')
  }
  const rawAssetId = input.mediaAssetId
  if (rawAssetId !== undefined && rawAssetId !== null && typeof rawAssetId !== 'string') {
    throw new Error(ATTACHMENT_NOT_FOUND)
  }
  const mediaAssetId = typeof rawAssetId === 'string' ? rawAssetId.trim() : ''
  if (rawAssetId != null && (!mediaAssetId || mediaAssetId.length > 64)) throw new Error(ATTACHMENT_NOT_FOUND)

  const entityType = mediaAssetId ? 'BILL' : 'EXPENSE'
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
  // so a failed approval write can never leave a PENDING expense with no approval. The
  // uploaded bill is resolved first, so an unusable asset is refused before any write.
  const expense = await prisma.$transaction(async (tx) => {
    let attachment: {
      cloudinaryPublicId: string
      secureUrl: string
      format: string | null
      bytes: number | null
      width: number | null
      height: number | null
      originalName: string | null
    } | null = null
    if (mediaAssetId) {
      attachment = await tx.mediaAsset.findFirst({
        where: { id: mediaAssetId, companyId, siteId: site.id, module: 'BILL', uploadedById: user.id },
        select: {
          cloudinaryPublicId: true,
          secureUrl: true,
          format: true,
          bytes: true,
          width: true,
          height: true,
          originalName: true,
        },
      })
      if (!attachment) throw new Error(ATTACHMENT_NOT_FOUND)

      // One upload backs one bill, so the same file cannot be claimed twice.
      const bound = await tx.billAttachment.findFirst({
        where: { cloudinaryPublicId: attachment.cloudinaryPublicId },
        select: { id: true },
      })
      if (bound) throw new Error('Forbidden: Uploaded bill is already attached')
    }

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
        description: data.description ?? (data.notes ? data.notes.substring(0, 50) : `Expense for ${data.category}`),
        ...(data.billDate ? { billDate: data.billDate } : {}),
        createdById: user.id,
        ...(attachment
          ? {
              billAttachments: {
                create: {
                  cloudinaryPublicId: attachment.cloudinaryPublicId,
                  secureUrl: attachment.secureUrl,
                  originalName: attachment.originalName,
                  format: attachment.format,
                  bytes: attachment.bytes,
                  width: attachment.width,
                  height: attachment.height,
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
    module: mediaAssetId ? 'BILL_UPLOAD' : 'EXPENSE',
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

const EXPENSE_CATEGORY_VALUES = new Set(EXPENSE_CATEGORIES.map((c) => c.value))
const PAYMENT_MODE_VALUES = new Set(PAYMENT_MODES.map((m) => m.value))
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function formText(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key)
  if (value !== null && typeof value !== 'string') throw new Error(`Invalid expense: ${key} must be text`)
  const text = (value ?? '').trim()
  if (text.length > maxLength) throw new Error(`Invalid expense: ${key} is too long`)
  return text
}

/**
 * Pure validation of the desktop "Record Expense" form. Only the fields the form owns are
 * read: a `companyId` or any other tenant field posted alongside is ignored, since the
 * company is always resolved from the live site inside `createExpenseAction`.
 */
function parseExpenseForm(formData: FormData) {
  const siteId = formText(formData, 'siteId', 64)
  if (!siteId) throw new Error('Invalid expense: site is required')

  const amountText = formText(formData, 'amount', 20)
  const amount = Number(amountText)
  if (!amountText || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid expense: amount must be a positive number')
  }

  const category = formText(formData, 'category', 32)
  if (!EXPENSE_CATEGORY_VALUES.has(category)) throw new Error('Invalid expense: unknown category')

  const paymentMode = formText(formData, 'paymentMode', 32)
  if (!PAYMENT_MODE_VALUES.has(paymentMode)) throw new Error('Invalid expense: unknown payment mode')

  const dateText = formText(formData, 'date', 10)
  const billDate = new Date(dateText)
  if (!ISO_DATE.test(dateText) || Number.isNaN(billDate.getTime()) || billDate.toISOString().slice(0, 10) !== dateText) {
    throw new Error('Invalid expense: date must be a valid YYYY-MM-DD date')
  }

  const paidTo = formText(formData, 'paidTo', 200)
  const description = formText(formData, 'description', 1000)

  return {
    siteId,
    amount,
    category: category as ExpenseCategory,
    paymentMode: paymentMode as PaymentMode,
    paidTo: paidTo || undefined,
    description: description || undefined,
    billDate,
  }
}

/**
 * Form entry point for the desktop "Record Expense" page. The live principal and its
 * permissions are resolved before the form is even parsed, and the write itself is
 * `createExpenseAction`: tenant-scoped site lookup, then expense, approval and timeline
 * in one transaction. `Site.spent` is never touched here — the budget sync owns it.
 */
export async function createExpenseFromFormAction(formData: FormData) {
  const user = await requirePermission('expenses.create')
  if (!hasPermission(user.role, 'approvals.view')) {
    throw new Error('Forbidden: Missing required permission "approvals.view"')
  }
  // The page is tenant-only; a SUPER_ADMIN has no company to record the expense against.
  if (user.role === 'SUPER_ADMIN' || !user.companyId) {
    throw new Error('Forbidden: No active company context')
  }

  await createExpenseAction(parseExpenseForm(formData))
  redirect('/expenses')
}
