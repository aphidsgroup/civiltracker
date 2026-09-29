import type { Prisma } from '@prisma/client'
import { auditLogData } from '@/lib/audit-data'
import type { TenantMutationUser } from '@/lib/auth/site-mutation'
import { optionalText, requiredText } from '@/lib/auth/site-mutation'
import {
  MAX_AMOUNT_14_2,
  confirmationText,
  paise,
  parseAmountText,
  parseFinancialReason,
  rupeeSum,
} from '@/lib/validation/financial-mutations'

/*
 * Subcontractor edits and payments, shared by `/subcontractors` and
 * `/sites/[id]/subcontractors`. Each route authorizes the principal and builds the binding
 * (`where`, which must admit only active subcontractors of the live company on a site the
 * principal may act on); everything after that is identical on both routes.
 */

export const SUBCONTRACTOR_NOT_FOUND = 'FORBIDDEN: Subcontractor not found or access denied'
const SUBCONTRACTOR_CHANGED = 'Subcontractor changed. Refresh and retry.'
const STATUSES = ['Active', 'Inactive', 'Completed']

const AMOUNT_FIELDS = ['workOrderValue', 'raBilled', 'advance', 'retention'] as const
type AmountField = (typeof AMOUNT_FIELDS)[number]
const AMOUNT_LABELS: Record<AmountField, string> = {
  workOrderValue: 'work order value',
  raBilled: 'RA billed',
  advance: 'advance',
  retention: 'retention',
}

export type SubcontractorEdit = {
  id: string
  profile: { name: string; phone: string | null; trade: string | null; gst: string | null; status: string }
  /** Only the amounts the form sent; an absent one is left unchanged. */
  amounts: Partial<Record<AmountField, number>>
  typed: string
  reason: FormDataEntryValue | null
}

/**
 * Parses an edit form before any read. Every amount the form sends must be strict decimal
 * text within `Decimal(14, 2)`: absent leaves it unchanged, blank is refused.
 */
export function parseSubcontractorEdit(formData: FormData): SubcontractorEdit {
  const id = requiredText(formData.get('id'), 'Subcontractor')
  const name = requiredText(formData.get('name'), 'Subcontractor name')
  const status = typeof formData.get('status') === 'string' ? (formData.get('status') as string).trim() : ''
  if (!STATUSES.includes(status)) throw new Error('Invalid subcontractor status')

  const amounts: SubcontractorEdit['amounts'] = {}
  for (const field of AMOUNT_FIELDS) {
    if (formData.has(field)) amounts[field] = parseAmountText(formData.get(field), AMOUNT_LABELS[field], { max: MAX_AMOUNT_14_2 })
  }

  return {
    id,
    profile: {
      name,
      phone: optionalText(formData.get('phone')),
      trade: optionalText(formData.get('trade')),
      gst: optionalText(formData.get('gst')),
      status,
    },
    amounts,
    typed: confirmationText(formData.get('dangerConfirmText')),
    reason: formData.get('reason'),
  }
}

export type SubcontractorPayment = { id: string; amount: number; typed: string; reason: string }

/** Parses a payment form before any read: a positive strict amount and a reason. */
export function parseSubcontractorPayment(formData: FormData): SubcontractorPayment {
  return {
    id: requiredText(formData.get('id'), 'Subcontractor'),
    amount: parseAmountText(formData.get('amount'), 'payment amount', { max: MAX_AMOUNT_14_2, positive: true }),
    typed: confirmationText(formData.get('dangerConfirmText')),
    reason: parseFinancialReason(formData.get('reason'), 'Payment reason'),
  }
}

const SELECT = {
  id: true, name: true, phone: true, trade: true, gst: true, status: true, siteId: true,
  workOrderValue: true, raBilled: true, advance: true, retention: true,
} as const

/**
 * Applies an edit inside the caller's transaction. A change to any financial field needs
 * the stored subcontractor name typed back and a reason. The write is guarded on every
 * balance read, and the before/after audit is written on the same transaction, so an
 * audit failure rolls the edit back.
 */
export async function editSubcontractor(
  tx: Prisma.TransactionClient,
  user: TenantMutationUser,
  where: Prisma.SubcontractorWhereInput,
  edit: SubcontractorEdit,
) {
  const sub = await tx.subcontractor.findFirst({ where: { ...where, id: edit.id }, select: SELECT })
  if (!sub) throw new Error(SUBCONTRACTOR_NOT_FOUND)

  const balances = {
    workOrderValue: Number(sub.workOrderValue),
    raBilled: Number(sub.raBilled),
    advance: Number(sub.advance),
    retention: Number(sub.retention),
  }
  const changed = AMOUNT_FIELDS.filter((field) => {
    const value = edit.amounts[field]
    return value !== undefined && paise(value) !== paise(balances[field])
  })

  let reason: string | null = null
  if (changed.length > 0) {
    if (edit.typed !== sub.name.trim()) {
      throw new Error('Change confirmation text did not match the subcontractor name.')
    }
    reason = parseFinancialReason(edit.reason, 'Change reason')
  }

  const amountData: Partial<Record<AmountField, number>> = {}
  for (const field of changed) amountData[field] = edit.amounts[field]
  const result = await tx.subcontractor.updateMany({
    where: {
      ...where,
      id: sub.id,
      workOrderValue: sub.workOrderValue,
      raBilled: sub.raBilled,
      advance: sub.advance,
      retention: sub.retention,
    },
    data: { ...edit.profile, ...amountData },
  })
  if (result.count !== 1) throw new Error(SUBCONTRACTOR_CHANGED)

  const before = { name: sub.name, phone: sub.phone, trade: sub.trade, gst: sub.gst, status: sub.status, siteId: sub.siteId, ...balances }
  const after = { ...edit.profile, siteId: sub.siteId, ...balances, ...amountData }
  const actor = user.name ?? user.email
  await tx.auditLog.create({
    data: auditLogData({
      userId: user.id,
      companyId: user.companyId,
      action: reason ? 'ADJUST' : 'UPDATE',
      module: 'SUBCONTRACTOR',
      recordId: sub.id,
      description: reason
        ? `${actor} changed ${changed.map((field) => AMOUNT_LABELS[field]).join(', ')} of subcontractor "${sub.name}": ${reason}`
        : `${actor} updated subcontractor "${edit.profile.name}"`,
      before,
      after: reason ? { ...after, reason, changed } : after,
    }),
  })
}

/**
 * Records a payment as an advance increment inside the caller's transaction. Needs the
 * stored subcontractor name typed back; the write is guarded on the advance read and the
 * audit record is written on the same transaction.
 */
export async function paySubcontractor(
  tx: Prisma.TransactionClient,
  user: TenantMutationUser,
  where: Prisma.SubcontractorWhereInput,
  payment: SubcontractorPayment,
) {
  const sub = await tx.subcontractor.findFirst({ where: { ...where, id: payment.id }, select: SELECT })
  if (!sub) throw new Error(SUBCONTRACTOR_NOT_FOUND)
  if (payment.typed !== sub.name.trim()) {
    throw new Error('Payment confirmation text did not match the subcontractor name.')
  }

  const advance = Number(sub.advance)
  const next = rupeeSum(advance, payment.amount)
  if (paise(next) > paise(MAX_AMOUNT_14_2)) throw new Error('Payment would exceed the subcontractor advance limit.')

  const result = await tx.subcontractor.updateMany({
    where: { ...where, id: sub.id, advance: sub.advance },
    data: { advance: next },
  })
  if (result.count !== 1) throw new Error(SUBCONTRACTOR_CHANGED)

  const pending = (paid: number) => (paise(Number(sub.raBilled)) - paise(Number(sub.retention)) - paise(paid)) / 100
  const snapshot = { name: sub.name, siteId: sub.siteId, raBilled: Number(sub.raBilled), retention: Number(sub.retention) }
  await tx.auditLog.create({
    data: auditLogData({
      userId: user.id,
      companyId: user.companyId,
      action: 'PAID',
      module: 'SUBCONTRACTOR',
      recordId: sub.id,
      description: `${user.name ?? user.email} paid ₹${payment.amount.toLocaleString('en-IN')} to subcontractor "${sub.name}": ${payment.reason}`,
      before: { ...snapshot, advance, pending: pending(advance) },
      after: { ...snapshot, advance: next, pending: pending(next), paidAmount: payment.amount, reason: payment.reason },
    }),
  })
}
