import { z } from 'zod'

/** The largest amount the `Decimal(14, 2)` payment column holds. */
export const MAX_CLIENT_ADVANCE_AMOUNT = 999_999_999_999.99

/** The strict decimal text of an amount: at most twelve whole digits and two decimals. */
const AMOUNT_TEXT = /^\d{1,12}(\.\d{1,2})?$/

/** `YYYY-MM-DD`, optionally with a local `THH:mm` or `THH:mm:ss` time. */
const RECEIVED_AT_TEXT = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/

/**
 * A strictly positive rupee amount with at most two decimals, judged by the number's own
 * string form so `NaN`, `Infinity`, `-0`, exponent forms and sub-paisa fractions are all
 * refused. A numeric string is refused too: the form entry point converts its text first.
 */
const amountField = z
  .number()
  .refine((value) => AMOUNT_TEXT.test(String(value)) && value > 0 && value <= MAX_CLIENT_ADVANCE_AMOUNT, {
    error: 'must be a positive amount of at most two decimals',
  })

/**
 * The received date as the browser's `date` / `datetime-local` text. It is read as
 * `new Date(text)` always did (a date alone as UTC midnight, a date with a time as server
 * local time), then every component must round-trip, so `2026-02-30` or `T25:00` never
 * roll over into another instant.
 */
const receivedAtField = z.string().transform((text, ctx) => {
  const match = RECEIVED_AT_TEXT.exec(text)
  const paidAt = new Date(text)
  if (match && !Number.isNaN(paidAt.getTime())) {
    const [, year, month, day, hour, minute, second] = match.map(Number)
    const dateOnly = match[4] === undefined
    const parts = dateOnly
      ? [paidAt.getUTCFullYear(), paidAt.getUTCMonth() + 1, paidAt.getUTCDate()]
      : [paidAt.getFullYear(), paidAt.getMonth() + 1, paidAt.getDate(), paidAt.getHours(), paidAt.getMinutes(), paidAt.getSeconds()]
    const expected = dateOnly ? [year, month, day] : [year, month, day, hour, minute, match[6] === undefined ? 0 : second]
    if (year >= 1900 && year <= 2200 && parts.every((part, i) => part === expected[i])) return paidAt
  }
  ctx.issues.push({ code: 'custom', message: 'must be a valid date', input: text })
  return z.NEVER
})

const clientAdvanceSchema = z.strictObject({
  siteId: z.string().trim().min(1).max(64),
  amount: amountField,
  purpose: z.string().trim().min(1).max(500),
  receivedAt: receivedAtField,
})

export type ClientAdvanceInput = {
  siteId: string
  amount: number
  purpose: string
  paidAt: Date
}

/**
 * Parses a `createClientAdvance` payload at the server boundary. Pure: it issues no read,
 * so it runs before any site, client or transaction access. Only the four advance fields
 * are accepted; the client, company, payment type, mode and status are never caller input.
 *
 * Throws `Invalid client advance: <field> ...` on the first problem.
 */
export function parseClientAdvanceInput(input: unknown): ClientAdvanceInput {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Invalid client advance: payload must be an object')
  }
  const result = clientAdvanceSchema.safeParse(input)
  if (!result.success) {
    const issue = result.error.issues[0]
    const field = issue?.path.length ? issue.path.join('.') : 'payload'
    throw new Error(`Invalid client advance: ${field} ${issue?.message ?? 'is invalid'}`)
  }
  const { siteId, amount, purpose, receivedAt } = result.data
  return { siteId, amount, purpose, paidAt: receivedAt }
}

/** The form's amount text as a number, or `NaN` unless it is strict decimal text. */
export function clientAdvanceAmountFromForm(raw: FormDataEntryValue | null): number {
  const text = typeof raw === 'string' ? raw.trim() : ''
  return AMOUNT_TEXT.test(text) ? Number(text) : Number.NaN
}
