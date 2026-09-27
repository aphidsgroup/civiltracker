/*
 * Pure parsing for financial form fields, shared by the server actions that move a balance
 * (vendor payables, subcontractor advances and bills, labour advances, invoices). Nothing
 * here reads the database, so it runs before any binding or transaction.
 */

/** The largest amount a `Decimal(14, 2)` column holds. */
export const MAX_AMOUNT_14_2 = 999_999_999_999.99

/** The largest amount a `Decimal(10, 2)` column holds. */
export const MAX_AMOUNT_10_2 = 99_999_999.99

export const MAX_FINANCIAL_REASON = 500

/** The strict decimal text of an amount: at most twelve whole digits and two decimals. */
const AMOUNT_TEXT = /^\d{1,12}(\.\d{1,2})?$/

/**
 * A rupee amount typed as strict decimal text, so `NaN`, `Infinity`, signs, exponent forms
 * and sub-paisa fractions are all refused; it must also fit `max` and, with `positive`,
 * be above zero. Throws `Invalid <field>`.
 */
export function parseAmountText(raw: FormDataEntryValue | null, field: string, { max, positive = false }: { max: number; positive?: boolean }): number {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!AMOUNT_TEXT.test(text)) throw new Error(`Invalid ${field}`)
  const value = Number(text)
  if (value > max || (positive && value <= 0)) throw new Error(`Invalid ${field}`)
  return value
}

/** Rupee amounts compared in whole paise, so a `Decimal` column and form text agree. */
export function paise(amount: number): number {
  return Math.round(amount * 100)
}

/** The difference `to - from` in rupees, computed in paise so no float residue is stored. */
export function rupeeDelta(from: number, to: number): number {
  return (paise(to) - paise(from)) / 100
}

/** The sum `a + b` in rupees, computed in paise. */
export function rupeeSum(a: number, b: number): number {
  return (paise(a) + paise(b)) / 100
}

/** A required reason for a financial change, at most `MAX_FINANCIAL_REASON` characters. */
export function parseFinancialReason(raw: FormDataEntryValue | null, field: string): string {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) throw new Error(`${field} is required`)
  if (text.length > MAX_FINANCIAL_REASON) throw new Error(`${field} must be at most ${MAX_FINANCIAL_REASON} characters`)
  return text
}

/** The typed-back confirmation text, trimmed; absent becomes empty so it never matches. */
export function confirmationText(raw: FormDataEntryValue | null): string {
  return typeof raw === 'string' ? raw.trim() : ''
}
