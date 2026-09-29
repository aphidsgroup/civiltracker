import { Prisma } from '@prisma/client'
import { z } from 'zod'

/*
 * Pure parsing for the commercial creation forms: client, purchase order, BOQ line and
 * material. Nothing here reads the database, so it runs after the live gate and before
 * any binding or transaction.
 *
 * Each form is an allowlist of single text values. Amounts are exact decimal text turned
 * into `Prisma.Decimal`, never `Number`: signs, exponents, hex, `NaN`, `Infinity`,
 * grouping separators, excess precision and anything beyond the column are refused, so a
 * value is stored exactly as typed or not at all. Derived money (the BOQ amount and total)
 * is computed here in `Decimal`; the caller cannot submit it.
 */

type Decimal = Prisma.Decimal
const Decimal = Prisma.Decimal

const ZERO = new Decimal(0)

/** The largest amount a `Decimal(14, 2)` column holds. */
export const MAX_DECIMAL_14_2 = new Decimal('999999999999.99')

type DecimalRule = {
  field: string
  /** Whole digits the column holds: precision minus scale. */
  integerDigits: number
  scale: number
  positive?: boolean
  max?: Decimal
}

/** Rupees in `Decimal(14, 2)`: twelve whole digits and paise. */
const RUPEES = { integerDigits: 12, scale: 2 } as const
/** Quantities in `Decimal(14, 3)`: eleven whole digits and thousandths. */
const QUANTITY = { integerDigits: 11, scale: 3 } as const
/** A percentage from 0 to 100 with at most two decimals. */
const PERCENT = { integerDigits: 3, scale: 2, max: new Decimal(100) } as const

/**
 * Exact decimal text within `rule`, as a `Decimal`. Blank becomes `blank` when given and
 * is otherwise refused. Throws `Invalid <field>`.
 */
function decimalField(raw: string | undefined, rule: DecimalRule, blank?: Decimal): Decimal {
  const text = (raw ?? '').trim()
  if (text === '' && blank !== undefined) return blank
  const pattern = new RegExp(`^\\d{1,${rule.integerDigits}}(?:\\.\\d{1,${rule.scale}})?$`)
  if (!pattern.test(text)) throw new Error(`Invalid ${rule.field}`)
  const value = new Decimal(text)
  if ((rule.positive && value.isZero()) || (rule.max && value.gt(rule.max))) throw new Error(`Invalid ${rule.field}`)
  return value
}

/** Invisible bidirectional controls that can make stored text display as something else. */
const BIDI_CONTROLS = /[؜‎‏‪-‮⁦-⁩]/

function codePoints(text: string) {
  return [...text].length
}

type TextRule = { max: number; required?: boolean }

/** Bounds `text` in code points and refuses control characters other than newline and tab. */
function checkText(text: string, field: string, max: number) {
  if (codePoints(text) > max) throw new Error(`${field} must be at most ${max} characters`)
  if (/[^\P{Cc}\n\t]/u.test(text) || BIDI_CONTROLS.test(text)) throw new Error(`${field} contains invalid characters`)
}

/**
 * A single-line text: NFC-normalized, whitespace runs collapsed to one space, trimmed, no
 * control or bidi characters, and at least one letter or digit. Blank is `null` unless
 * `required`, which throws `<field> is required`.
 */
function lineText(raw: string | undefined, field: string, rule: TextRule & { required: true }): string
function lineText(raw: string | undefined, field: string, rule: TextRule): string | null
function lineText(raw: string | undefined, field: string, { max, required = false }: TextRule): string | null {
  const text = (raw ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!text) {
    if (required) throw new Error(`${field} is required`)
    return null
  }
  checkText(text, field, max)
  if (!/[\p{L}\p{N}]/u.test(text)) throw new Error(`${field} must contain letters or digits`)
  return text
}

/**
 * A multi-line text: NFC-normalized, line endings made `\n`, trimmed; newlines and tabs
 * are the only control characters kept. Blank is `null` unless `required`.
 */
function blockText(raw: string | undefined, field: string, rule: TextRule & { required: true }): string
function blockText(raw: string | undefined, field: string, rule: TextRule): string | null
function blockText(raw: string | undefined, field: string, { max, required = false }: TextRule): string | null {
  const text = (raw ?? '').normalize('NFC').replace(/\r\n?/g, '\n').trim()
  if (!text) {
    if (required) throw new Error(`${field} is required`)
    return null
  }
  checkText(text, field, max)
  return text
}

const RECORD_ID = /^[A-Za-z0-9_-]{1,64}$/

/** A record id as a form sends it. Blank is `null` unless `required`; malformed throws `Invalid <label>`. */
function idField(raw: string | undefined, label: string, required: boolean): string | null {
  const text = (raw ?? '').trim()
  if (!text && !required) return null
  if (!RECORD_ID.test(text)) throw new Error(`Invalid ${label}`)
  return text
}

const emailSchema = z.email().max(254)

/** Optional contact email, trimmed and lowercased. */
function emailField(raw: string | undefined): string | null {
  const text = (raw ?? '').trim().toLowerCase()
  if (!text) return null
  if (!emailSchema.safeParse(text).success) throw new Error('Invalid email')
  return text
}

/**
 * Optional contact phone. Separators are accepted as typed but stored stripped, so the
 * value is an optional leading `+` and 7 to 15 digits (E.164 length).
 */
function phoneField(raw: string | undefined): string | null {
  const text = (raw ?? '').trim()
  if (!text) return null
  if (text.length > 32 || !/^\+?[0-9()\-.\s]+$/.test(text)) throw new Error('Invalid phone')
  const canonical = (text.startsWith('+') ? '+' : '') + text.replace(/\D/g, '')
  if (!/^\+?[0-9]{7,15}$/.test(canonical)) throw new Error('Invalid phone')
  return canonical
}

/**
 * The single text values of an allowlisted form. Any other key, a repeated key or a file
 * is refused, as is a payload that is not a form (a Server Action is reachable by direct
 * POST). Framework-owned `$ACTION_*` keys are skipped.
 */
function readForm<K extends string>(raw: unknown, record: string, keys: readonly K[]): Partial<Record<K, string>> {
  if (!(raw instanceof FormData)) throw new Error(`Invalid ${record}: payload must be a form`)
  const allowed: ReadonlySet<string> = new Set(keys)
  const fields: Partial<Record<K, string>> = Object.create(null)
  for (const key of new Set(raw.keys())) {
    if (key.startsWith('$ACTION_')) continue
    if (!allowed.has(key)) throw new Error(`Invalid ${record}: ${key.slice(0, 64)} is not an accepted field`)
    const values = raw.getAll(key)
    if (values.some((value) => typeof value !== 'string')) throw new Error(`Invalid ${record}: ${key} must be text`)
    if (values.length !== 1) throw new Error(`Invalid ${record}: ${key} must be a single value`)
    fields[key as K] = values[0] as string
  }
  return fields
}

export type ClientCreateInput = {
  name: string
  phone: string | null
  email: string | null
  siteId: string | null
  contractValue: Decimal
  portalAccess: boolean
}

/**
 * The Add Client form. `contractValue` is rupees in `Decimal(14, 2)`, zero or more, blank
 * meaning zero; `portalAccess` is the checkbox (`on` or absent). Blank `siteId` keeps the
 * client company-wide.
 */
export function parseClientCreateForm(raw: unknown): ClientCreateInput {
  const form = readForm(raw, 'client', ['name', 'phone', 'email', 'siteId', 'contractValue', 'portalAccess'])
  if (form.portalAccess !== undefined && form.portalAccess !== 'on') throw new Error('Invalid portal access')
  return {
    name: lineText(form.name, 'Client name', { max: 120, required: true }),
    phone: phoneField(form.phone),
    email: emailField(form.email),
    siteId: idField(form.siteId, 'site', false),
    contractValue: decimalField(form.contractValue, { field: 'contract value', ...RUPEES }, ZERO),
    portalAccess: form.portalAccess === 'on',
  }
}

export type PurchaseOrderCreateInput = {
  poNumber: string
  totalAmount: Decimal
  vendorId: string | null
  notes: string | null
}

/**
 * The Create Purchase Order form. There are no order lines to derive a total from, so
 * `totalAmount` is the typed order value: rupees in `Decimal(14, 2)`, above zero.
 */
export function parsePurchaseOrderCreateForm(raw: unknown): PurchaseOrderCreateInput {
  const form = readForm(raw, 'purchase order', ['poNumber', 'totalAmount', 'vendorId', 'notes'])
  return {
    poNumber: lineText(form.poNumber, 'PO number', { max: 50, required: true }),
    totalAmount: decimalField(form.totalAmount, { field: 'total amount', ...RUPEES, positive: true }),
    vendorId: idField(form.vendorId, 'vendor', false),
    notes: blockText(form.notes, 'Notes', { max: 2000 }),
  }
}

export type BoqItemCreateInput = {
  siteId: string
  description: string
  category: string
  unit: string
  quantity: Decimal
  rate: Decimal
  gstPercent: Decimal
  amount: Decimal
  totalWithGst: Decimal
}

/**
 * The Add BOQ Item form. `quantity` fits `Decimal(14, 3)` and `rate` `Decimal(14, 2)`,
 * both above zero; `gstPercent` is 0 to 100 (blank is 0). The line amount is
 * `quantity × rate` and the total `amount × (1 + GST / 100)`, each rounded half-up to
 * paise; either rounding to zero or overflowing `Decimal(14, 2)` throws
 * `Invalid BOQ amount`. The operands are at most 28 significant digits and any product
 * that fits the column is at most 17, inside `Decimal`'s 20, so the result is exact.
 */
export function parseBoqItemCreateForm(raw: unknown): BoqItemCreateInput {
  const form = readForm(raw, 'BOQ item', ['siteId', 'description', 'category', 'unit', 'quantity', 'rate', 'gstPercent'])
  const siteId = idField(form.siteId, 'site', true) as string
  const description = blockText(form.description, 'Description', { max: 2000, required: true })
  const category = lineText(form.category, 'Category', { max: 60 }) ?? 'General'
  const unit = lineText(form.unit, 'Unit', { max: 20, required: true })
  const quantity = decimalField(form.quantity, { field: 'quantity', ...QUANTITY, positive: true })
  const rate = decimalField(form.rate, { field: 'rate', ...RUPEES, positive: true })
  const gstPercent = decimalField(form.gstPercent, { field: 'GST percent', ...PERCENT }, ZERO)

  const amount = quantity.times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  const totalWithGst = amount.plus(amount.times(gstPercent).div(100)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  if (amount.isZero() || amount.gt(MAX_DECIMAL_14_2) || totalWithGst.gt(MAX_DECIMAL_14_2)) {
    throw new Error('Invalid BOQ amount')
  }
  return { siteId, description, category, unit, quantity, rate, gstPercent, amount, totalWithGst }
}

/** The units a material is stocked in, as offered by the Add Material form. */
export const MATERIAL_UNITS = ['Bags', 'MT', 'Kgs', 'Ltrs', 'Nos', 'Cum', 'Sqft', 'Rft'] as const
export type MaterialUnit = (typeof MATERIAL_UNITS)[number]

export const MATERIAL_UNIT_LABELS: Record<MaterialUnit, string> = {
  Bags: 'Bags',
  MT: 'MT (Metric Ton)',
  Kgs: 'Kgs',
  Ltrs: 'Ltrs',
  Nos: 'Nos (Numbers)',
  Cum: 'Cum (Cubic Meter)',
  Sqft: 'Sqft',
  Rft: 'Rft',
}

export type MaterialCreateInput = {
  siteId: string
  name: string
  brand: string | null
  unit: MaterialUnit
  openingStock: Decimal
  minStock: Decimal
}

/**
 * The Add Material form. Stock quantities fit `Decimal(14, 3)`, zero or more, blank
 * meaning zero; the unit is one of `MATERIAL_UNITS`. Cost, current stock and totals are
 * server-owned: current stock starts at the opening stock and no cost is taken here.
 */
export function parseMaterialCreateForm(raw: unknown): MaterialCreateInput {
  const form = readForm(raw, 'material', ['siteId', 'name', 'brand', 'unit', 'openingStock', 'minStock'])
  const unit = (MATERIAL_UNITS as readonly string[]).includes(form.unit ?? '') ? (form.unit as MaterialUnit) : null
  if (!unit) throw new Error('Invalid unit')
  return {
    siteId: idField(form.siteId, 'site', true) as string,
    name: lineText(form.name, 'Material name', { max: 120, required: true }),
    brand: lineText(form.brand, 'Brand', { max: 120 }),
    unit,
    openingStock: decimalField(form.openingStock, { field: 'opening stock', ...QUANTITY }, ZERO),
    minStock: decimalField(form.minStock, { field: 'minimum stock', ...QUANTITY }, ZERO),
  }
}
