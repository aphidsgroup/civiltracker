import { z } from 'zod'

import { EXPENSE_CATEGORIES, PAYMENT_MODES } from '@/lib/constants'
import type { ExpenseCategory, PaymentMode } from '@/types'

/** Refusal for any attachment that is not a usable upload of the caller. */
export const EXPENSE_ATTACHMENT_NOT_FOUND = 'Forbidden: Uploaded bill not found or access denied'

/** Attachment fields the browser used to send; they are storage facts, never input. */
const CLIENT_ATTACHMENT_FIELDS = ['cloudinaryPublicId', 'secureUrl', 'format', 'bytes'] as const

/** The largest amount the `Decimal(14, 2)` column holds. */
export const MAX_EXPENSE_AMOUNT = 999_999_999_999.99

const CATEGORY_VALUES = EXPENSE_CATEGORIES.map((c) => c.value) as [ExpenseCategory, ...ExpenseCategory[]]
const PAYMENT_MODE_VALUES = PAYMENT_MODES.map((m) => m.value) as [PaymentMode, ...PaymentMode[]]

/**
 * A strictly positive rupee amount with at most two decimals, judged by the number's own
 * string form so `NaN`, `Infinity`, `-0`, exponent forms and sub-paisa fractions are all
 * refused. A numeric string is refused too: every caller sends a number.
 */
const amountField = z
  .number()
  .refine((value) => /^\d{1,12}(\.\d{1,2})?$/.test(String(value)) && value > 0 && value <= MAX_EXPENSE_AMOUNT, {
    error: 'must be a positive amount of at most two decimals',
  })

/** The same amount rule as `amountField`, for boundaries that parse the rest themselves. */
export function isExpenseAmount(value: unknown): value is number {
  return amountField.safeParse(value).success
}

/** Optional free text: absent or blank becomes `undefined`, otherwise trimmed and bounded. */
function optionalText(max: number) {
  return z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined)
    .pipe(z.string().max(max).optional())
}

/** A real calendar instant between 1900 and 2200; a string or timestamp is refused. */
const billDateField = z
  .date()
  .refine((value) => {
    const year = value.getUTCFullYear()
    return year >= 1900 && year <= 2200
  }, { error: 'must be a valid date' })
  .optional()

const expenseSchema = z.strictObject({
  siteId: z.string().trim().min(1).max(64),
  amount: amountField,
  category: z.enum(CATEGORY_VALUES),
  paymentMode: z.enum(PAYMENT_MODE_VALUES),
  paidTo: optionalText(200),
  billNumber: optionalText(100),
  notes: optionalText(2000),
  description: optionalText(1000),
  billDate: billDateField,
  // Shape-checked with its own refusal before the schema runs; see below.
  mediaAssetId: z.unknown().optional(),
})

const EXPENSE_FIELD_NAMES: ReadonlySet<string> = new Set(Object.keys(expenseSchema.shape))

export type ExpenseActionInput = {
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
}

/**
 * Parses a `createExpenseAction` payload at the server boundary. Pure: it issues no
 * read, so it runs before any module, site, media or transaction access.
 *
 * - client-sent attachment fields are refused (attach a bill by its media asset id);
 * - `mediaAssetId`, when present and not null, must be a non-blank id of at most 64
 *   characters, otherwise it answers exactly like an unusable upload;
 * - every other key must be an expense field, validated and normalized by `expenseSchema`.
 *
 * Throws `Invalid expense: <field> ...` on the first other problem.
 */
export function parseExpenseActionInput(input: unknown): ExpenseActionInput {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Invalid expense: payload must be an object')
  }
  const fields = input as Record<string, unknown>
  const keys = Object.keys(fields)

  if (CLIENT_ATTACHMENT_FIELDS.some((field) => keys.includes(field) && fields[field] !== undefined)) {
    throw new Error('Invalid expense: attach a bill by its uploaded media asset id')
  }

  const rawAssetId = fields.mediaAssetId
  let mediaAssetId: string | undefined
  if (rawAssetId !== undefined && rawAssetId !== null) {
    if (typeof rawAssetId !== 'string') throw new Error(EXPENSE_ATTACHMENT_NOT_FOUND)
    mediaAssetId = rawAssetId.trim()
    if (!mediaAssetId || mediaAssetId.length > 64) throw new Error(EXPENSE_ATTACHMENT_NOT_FOUND)
  }

  // `Object.keys` sees an own `__proto__` key too, so nothing slips past as a prototype.
  const unknownKey = keys.find((key) => !EXPENSE_FIELD_NAMES.has(key))
  if (unknownKey !== undefined) throw new Error(`Invalid expense: ${unknownKey.slice(0, 64)} is not an expense field`)

  const result = expenseSchema.safeParse(input)
  if (!result.success) {
    const issue = result.error.issues[0]
    const field = issue?.path.length ? issue.path.join('.') : 'payload'
    throw new Error(`Invalid expense: ${field} ${issue?.message ?? 'is invalid'}`)
  }

  const { mediaAssetId: _ignored, ...data } = result.data
  void _ignored
  return { ...data, ...(mediaAssetId ? { mediaAssetId } : {}) }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parses a `POST /api/expenses` JSON body with the same policy as
 * `parseExpenseActionInput`. JSON carries no `Date`, so `billDate` is accepted only as a
 * real `YYYY-MM-DD` calendar day (absent or null means none); everything else, unknown
 * keys included, is judged by the canonical parser. Pure, like that parser.
 */
export function parseExpenseApiInput(body: unknown): ExpenseActionInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('Invalid expense: payload must be an object')
  }
  const { billDate: rawDate, ...fields } = body as Record<string, unknown>

  let billDate: Date | undefined
  if (rawDate !== undefined && rawDate !== null) {
    const date = typeof rawDate === 'string' && ISO_DATE.test(rawDate) ? new Date(`${rawDate}T00:00:00.000Z`) : null
    if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== rawDate) {
      throw new Error('Invalid expense: billDate must be a valid YYYY-MM-DD date')
    }
    billDate = date
  }

  return parseExpenseActionInput({ ...fields, ...(billDate ? { billDate } : {}) })
}
