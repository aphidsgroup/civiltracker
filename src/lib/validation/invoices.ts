import { MAX_AMOUNT_14_2, parseAmountText } from '@/lib/validation/financial-mutations'

export const MAX_INVOICE_MILESTONE = 200

/** The longest id accepted from the form; cuids are far shorter. */
const MAX_ID = 64

const DUE_DATE_TEXT = /^(\d{4})-(\d{2})-(\d{2})$/

export type InvoiceInput = {
  clientId: string
  siteId: string | null
  amount: number
  milestone: string
  dueDate: Date | null
}

function text(raw: FormDataEntryValue | null): string {
  return typeof raw === 'string' ? raw.trim() : ''
}

function id(raw: FormDataEntryValue | null, field: string): string {
  const value = text(raw)
  if (value.length > MAX_ID) throw new Error(`Invalid ${field.toLowerCase()}`)
  return value
}

/** A browser `date` value, read as UTC midnight; every component must round-trip. */
function dueDate(raw: FormDataEntryValue | null): Date | null {
  const value = text(raw)
  if (!value) return null
  const match = DUE_DATE_TEXT.exec(value)
  const date = new Date(value)
  if (match && !Number.isNaN(date.getTime())) {
    const [, year, month, day] = match.map(Number)
    if (year >= 1900 && year <= 2200 && date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day) {
      return date
    }
  }
  throw new Error('Invalid due date')
}

/**
 * Parses a `raiseInvoice` form at the server boundary. Pure: it issues no read, so it runs
 * before any client, site or transaction access. The amount must be strict positive decimal
 * text that fits the `Decimal(14, 2)` column; company, number and status are never input.
 */
export function parseInvoiceForm(formData: unknown): InvoiceInput {
  if (!(formData instanceof FormData)) throw new Error('Invalid invoice details')

  const clientId = id(formData.get('clientId'), 'Client')
  if (!clientId) throw new Error('Client is required')
  const siteId = id(formData.get('siteId'), 'Site') || null
  const amount = parseAmountText(formData.get('amount'), 'invoice amount', { max: MAX_AMOUNT_14_2, positive: true })
  const milestone = text(formData.get('milestone'))
  if (!milestone) throw new Error('Milestone is required')
  if (milestone.length > MAX_INVOICE_MILESTONE) throw new Error(`Milestone must be at most ${MAX_INVOICE_MILESTONE} characters`)

  return { clientId, siteId, amount, milestone, dueDate: dueDate(formData.get('dueDate')) }
}
