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
        description: data.description ?? (data.notes ? data.notes.substring(0, 50) : `Expense for ${data.category}`),
        ...(data.billDate ? { billDate: data.billDate } : {}),
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
