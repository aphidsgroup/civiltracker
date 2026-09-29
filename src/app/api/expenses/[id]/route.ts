import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { ExpenseCategory, PaymentMode } from '@prisma/client'
import type { ApprovalEntityType, ApprovalStatus, Prisma } from '@prisma/client'
import { requireUser } from '@/lib/auth/require-user'
import { requireModuleEnabled } from '@/lib/auth/require-module'
import { hasPermission } from '@/lib/permissions'
import { isExpenseAmount } from '@/lib/validation/expenses'
import type { SessionUser } from '@/types'

/** Either type may front an expense: the bills workflow raises both. */
const EXPENSE_APPROVAL_ENTITY_TYPES: ApprovalEntityType[] = ['EXPENSE', 'BILL']

/**
 * The only approval statuses that may still follow an edit or a delete of their expense.
 * Once a reviewer has picked the request up (PENDING_REVIEW) or decided it, the expense
 * is no longer the requester's to change.
 */
const MUTABLE_APPROVAL_STATUSES: ApprovalStatus[] = ['PENDING', 'SUBMITTED']

/** Same threshold `createExpenseAction` uses when it raises the approval. */
const HIGH_PRIORITY_AMOUNT = 50000

class ExpenseMutationError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

type ExpenseEditor = {
  user: SessionUser
  companyId: string
  /** True when the principal may only change expenses it created itself. */
  creatorOnly: boolean
}

/**
 * Entry gate shared by both verbs, decided on the live principal before any read:
 * `expenses.update` may change any expense of the tenant, `expenses.create` only the
 * principal's own. SUPER_ADMIN carries no tenant context and is refused.
 */
async function requireExpenseEditor(): Promise<ExpenseEditor> {
  const user = await requireUser()
  if (user.role === 'SUPER_ADMIN' || !user.companyId) {
    throw new ExpenseMutationError('Forbidden: An active company context is required to modify expenses', 403)
  }

  const canUpdateAny = hasPermission(user.role, 'expenses.update')
  if (!canUpdateAny && !hasPermission(user.role, 'expenses.create')) {
    throw new ExpenseMutationError('Forbidden: Missing required permission "expenses.update"', 403)
  }

  try {
    await requireModuleEnabled('EXPENSES')
  } catch (error) {
    throw new ExpenseMutationError(error instanceof Error ? error.message : 'Forbidden', 403)
  }

  return { user, companyId: user.companyId, creatorOnly: !canUpdateAny }
}

/**
 * The exact binding every read and write here carries: the principal's company, a live
 * site of that same company, and — for a creator-only principal — its own rows. Another
 * tenant's expense, one on a deleted or foreign site, and another member's expense all
 * answer exactly like a missing id.
 */
function scopedExpenseWhere(editor: ExpenseEditor): Prisma.ExpenseWhereInput {
  return {
    companyId: editor.companyId,
    deletedAt: null,
    site: { is: { companyId: editor.companyId, deletedAt: null } },
    ...(editor.creatorOnly ? { createdById: editor.user.id } : {}),
  }
}

async function findEditableExpense(editor: ExpenseEditor, id: string) {
  const expense = await prisma.expense.findFirst({
    where: { id, ...scopedExpenseWhere(editor) },
  })
  if (!expense) throw new ExpenseMutationError('Not found', 404)
  return expense
}

type EditableExpense = Awaited<ReturnType<typeof findEditableExpense>>

/**
 * Loads, inside the transaction, every live approval of this tenant that claims the
 * expense, and refuses unless each one sits on the expense's own site in a mutable
 * status. Refusing rather than skipping keeps a malformed or already-decided request
 * from being left behind pointing at a changed or deleted expense.
 */
async function findMutableLinkedApprovals(tx: Prisma.TransactionClient, expense: EditableExpense) {
  const linked = await tx.approval.findMany({
    where: {
      entityId: expense.id,
      entityType: { in: EXPENSE_APPROVAL_ENTITY_TYPES },
      companyId: expense.companyId,
      deletedAt: null,
    },
    select: { id: true, siteId: true, currentStatus: true },
  })

  for (const approval of linked) {
    if (approval.siteId !== expense.siteId) {
      throw new ExpenseMutationError(
        'Conflict: an approval linked to this expense is bound to another site — resolve it through the approvals workflow',
        409
      )
    }
    if (!MUTABLE_APPROVAL_STATUSES.includes(approval.currentStatus)) {
      throw new ExpenseMutationError(
        `Conflict: the approval linked to this expense is already ${approval.currentStatus} and the expense can no longer be changed`,
        409
      )
    }
  }

  return linked
}

/** Conditional write of the expense itself: still PENDING, still in scope, exactly once. */
async function writeScopedExpense(
  tx: Prisma.TransactionClient,
  editor: ExpenseEditor,
  expense: EditableExpense,
  data: Prisma.ExpenseUpdateManyMutationInput
) {
  const written = await tx.expense.updateMany({
    where: { id: expense.id, siteId: expense.siteId, approvalStatus: 'PENDING', ...scopedExpenseWhere(editor) },
    data,
  })
  if (written.count !== 1) {
    throw new ExpenseMutationError('Conflict: the expense changed while it was being modified', 409)
  }
}

function mutableApprovalWhere(expense: EditableExpense, approvalId: string): Prisma.ApprovalWhereInput {
  return {
    id: approvalId,
    companyId: expense.companyId,
    siteId: expense.siteId,
    deletedAt: null,
    currentStatus: { in: MUTABLE_APPROVAL_STATUSES },
  }
}

function errorResponse(error: unknown) {
  if (error instanceof ExpenseMutationError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  if (error instanceof Error && error.message.startsWith('UNAUTHORIZED')) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
  throw error
}

const EXPENSE_CATEGORIES = new Set<string>(Object.values(ExpenseCategory))
const PAYMENT_MODES = new Set<string>(Object.values(PaymentMode))

function optionalText(value: unknown, field: string) {
  if (value === null || value === '') return null
  if (typeof value !== 'string') throw new ExpenseMutationError(`Invalid ${field}`, 400)
  return value.trim() || null
}

const JSON_WHITESPACE = new Set([' ', '\t', '\n', '\r'])

/**
 * Raw source of every number literal given as a top-level `amount` member of `text`,
 * which must already have parsed as a JSON object. Parsing turns `1e3` into `1000`, so the
 * exponent can only be seen here. Strings are skipped whole (escapes included), so an `e`
 * or an `"amount"` inside any string value is never mistaken for a literal; nested values
 * are skipped by depth; keys are compared decoded, so `"amount"` is still `amount`;
 * and every duplicate key is reported, not only the one `JSON.parse` kept.
 */
function topLevelAmountLiterals(text: string): string[] {
  const literals: string[] = []
  let depth = 0
  let expectingKey = false
  let key: string | null = null
  let valueKey: string | null = null

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (JSON_WHITESPACE.has(char)) continue

    if (char === '"') {
      const start = i
      for (i++; text[i] !== '"'; i++) if (text[i] === '\\') i++
      if (depth === 1 && expectingKey) {
        key = JSON.parse(text.slice(start, i + 1)) as string
        expectingKey = false
      }
      valueKey = null
    } else if (char === '{' || char === '[') {
      depth++
      if (depth === 1) expectingKey = true
      valueKey = null
    } else if (char === '}' || char === ']') {
      depth--
      valueKey = null
    } else if (char === ',') {
      if (depth === 1) expectingKey = true
      valueKey = null
    } else if (char === ':') {
      if (depth === 1) valueKey = key
    } else {
      // A bare literal: a number, `true`, `false` or `null`, running to the next delimiter.
      const start = i
      while (i + 1 < text.length && !JSON_WHITESPACE.has(text[i + 1]) && !',]}'.includes(text[i + 1])) i++
      const literal = text.slice(start, i + 1)
      if (depth === 1 && valueKey === 'amount' && /^-?\d/.test(literal)) literals.push(literal)
      valueKey = null
    }
  }

  return literals
}

/**
 * Reads the edit body once, as text, so the amount can be judged by the literal the client
 * actually sent: `{"amount": 1e3}` is refused like the string `"1e3"` instead of arriving
 * as `1000`. Malformed JSON and anything but a JSON object are refused outright.
 */
async function readEditBody(request: Request): Promise<Record<string, unknown>> {
  let text: string
  let body: unknown
  try {
    text = await request.text()
    body = JSON.parse(text)
  } catch {
    throw new ExpenseMutationError('Invalid request body', 400)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ExpenseMutationError('Invalid request body', 400)
  }
  if (topLevelAmountLiterals(text).some((literal) => /[eE]/.test(literal))) {
    throw new ExpenseMutationError('Amount must be a positive amount of at most two decimals', 400)
  }
  return body as Record<string, unknown>
}

/** Validates the edit body into the exact column changes it asks for. */
function parseExpenseEdit(body: Record<string, unknown>) {
  const data: {
    amount?: number
    category?: ExpenseCategory
    paymentMode?: PaymentMode
    paidTo?: string | null
    description?: string
    billNumber?: string | null
    notes?: string | null
  } = {}

  if (body.amount !== undefined) {
    // Same bounded two-decimal rule as expense creation; a numeric string is refused.
    if (!isExpenseAmount(body.amount)) {
      throw new ExpenseMutationError('Amount must be a positive amount of at most two decimals', 400)
    }
    data.amount = body.amount
  }
  if (body.category !== undefined) {
    if (typeof body.category !== 'string' || !EXPENSE_CATEGORIES.has(body.category)) {
      throw new ExpenseMutationError('Invalid category', 400)
    }
    data.category = body.category as ExpenseCategory
  }
  if (body.paymentMode !== undefined) {
    if (typeof body.paymentMode !== 'string' || !PAYMENT_MODES.has(body.paymentMode)) {
      throw new ExpenseMutationError('Invalid payment mode', 400)
    }
    data.paymentMode = body.paymentMode as PaymentMode
  }
  if (body.description !== undefined) {
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    if (!description) throw new ExpenseMutationError('Description cannot be empty', 400)
    data.description = description
  }
  if (body.paidTo !== undefined) data.paidTo = optionalText(body.paidTo, 'paid to')
  if (body.billNumber !== undefined) data.billNumber = optionalText(body.billNumber, 'bill number')
  if (body.notes !== undefined) data.notes = optionalText(body.notes, 'notes')

  if (Object.keys(data).length === 0) throw new ExpenseMutationError('No changes supplied', 400)
  return data
}

function expenseSnapshot(expense: EditableExpense) {
  return {
    amount: Number(expense.amount),
    category: expense.category,
    paymentMode: expense.paymentMode,
    approvalStatus: expense.approvalStatus,
    paidTo: expense.paidTo,
    description: expense.description,
    billNumber: expense.billNumber,
    notes: expense.notes,
  }
}

// PATCH /api/expenses/[id] — Edit a PENDING expense and keep its open approval in step
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const editor = await requireExpenseEditor()

    // The body is judged before the expense is read, so a malformed edit touches nothing.
    const data = parseExpenseEdit(await readEditBody(request))

    const expense = await findEditableExpense(editor, id)

    // Only PENDING expenses can be edited
    if (expense.approvalStatus !== 'PENDING') {
      throw new ExpenseMutationError('Only PENDING expenses can be edited', 400)
    }

    // What the approval shows the reviewer has to follow the expense it describes.
    const approvalSync: Prisma.ApprovalUpdateManyMutationInput = {
      ...(data.amount !== undefined && {
        amount: data.amount,
        priority: data.amount > HIGH_PRIORITY_AMOUNT ? 'HIGH' : 'NORMAL',
      }),
      ...(data.description !== undefined && { title: data.description }),
    }

    // Expense, linked approval, its timeline entry and the audit record commit together:
    // an approval that cannot follow the edit rolls the edit back.
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const linked = await findMutableLinkedApprovals(tx, expense)
      if (linked.length > 1) {
        throw new ExpenseMutationError(
          'Conflict: this expense is linked to more than one open approval request and cannot be edited unambiguously',
          409
        )
      }

      await writeScopedExpense(tx, editor, expense, data)

      const approval = linked[0]
      if (approval) {
        const synced = await tx.approval.updateMany({
          where: mutableApprovalWhere(expense, approval.id),
          data: { ...approvalSync, updatedAt: new Date() },
        })
        if (synced.count !== 1) {
          throw new ExpenseMutationError('Conflict: the linked approval changed while the expense was being edited', 409)
        }

        await tx.approvalTimeline.create({
          data: {
            companyId: expense.companyId,
            approvalId: approval.id,
            actorUserId: editor.user.id,
            action: 'UPDATED',
            fromStatus: approval.currentStatus,
            toStatus: approval.currentStatus,
            note: 'Linked expense edited by the requester',
            metadataJson: { changedFields: Object.keys(data) },
          },
        })
      }

      await tx.auditLog.create({
        data: {
          userId: editor.user.id,
          companyId: expense.companyId,
          action: 'UPDATE',
          module: 'EXPENSE',
          recordId: expense.id,
          before: expenseSnapshot(expense),
          after: {
            ...expenseSnapshot(expense),
            ...data,
            _description: `${editor.user.name ?? editor.user.email} edited pending expense "${expense.description}"`,
          },
        },
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}

// DELETE /api/expenses/[id] — Soft-delete a PENDING expense and cancel its open approvals
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const editor = await requireExpenseEditor()
    const expense = await findEditableExpense(editor, id)

    // Only PENDING expenses can be deleted
    if (expense.approvalStatus !== 'PENDING') {
      throw new ExpenseMutationError('Only PENDING expenses can be deleted', 400)
    }

    const body = await request.json().catch(() => ({}))
    const dangerConfirmText = typeof body?.dangerConfirmText === 'string' ? body.dangerConfirmText.trim() : ''
    const label = (expense.description || expense.paidTo || expense.billNumber || expense.id).trim()
    if (dangerConfirmText !== label) {
      throw new ExpenseMutationError('Delete confirmation text did not match the expense label', 400)
    }

    const deletedAt = new Date()

    // The expense, every open approval that fronts it, their timeline entries and the
    // audit record retire together, so no request is left in the queue pointing at a
    // deleted expense.
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const linked = await findMutableLinkedApprovals(tx, expense)

      await writeScopedExpense(tx, editor, expense, { deletedAt })

      for (const approval of linked) {
        const cancelled = await tx.approval.updateMany({
          where: mutableApprovalWhere(expense, approval.id),
          data: { currentStatus: 'CANCELLED', closedAt: deletedAt, deletedAt },
        })
        if (cancelled.count !== 1) {
          throw new ExpenseMutationError('Conflict: a linked approval changed while the expense was being deleted', 409)
        }

        await tx.approvalTimeline.create({
          data: {
            companyId: expense.companyId,
            approvalId: approval.id,
            actorUserId: editor.user.id,
            action: 'CANCELLED',
            fromStatus: approval.currentStatus,
            toStatus: 'CANCELLED',
            note: 'Linked expense deleted by the requester',
          },
        })
      }

      await tx.auditLog.create({
        data: {
          userId: editor.user.id,
          companyId: expense.companyId,
          action: 'DELETE',
          module: 'EXPENSE',
          recordId: expense.id,
          before: { ...expenseSnapshot(expense), deletedAt: null },
          after: {
            ...expenseSnapshot(expense),
            deletedAt: deletedAt.toISOString(),
            cancelledApprovalIds: linked.map((approval) => approval.id),
            _description: `${editor.user.name ?? editor.user.email} deleted pending expense "${label}"`,
          },
        },
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
}
