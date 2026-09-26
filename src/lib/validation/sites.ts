import { z } from 'zod'

import { slugify } from '@/lib/utils'

/** Project types offered by the site forms; `projectType` is a free `String?` column. */
export const SITE_PROJECT_TYPES = ['RESIDENTIAL', 'COMMERCIAL', 'INFRASTRUCTURE', 'INDUSTRIAL', 'RENOVATION'] as const

/**
 * A field that may be left out: an absent key, `undefined`, `null` and a blank string all
 * become `null`. `.optional()` (not a `z.undefined()` union member) is what lets the
 * strict object accept the key being absent while the transform still yields `null`.
 */
const blankable = z.union([z.string(), z.null()]).optional().transform((value) => value?.trim() || null)

function optionalText(max: number) {
  return blankable.pipe(z.string().max(max).nullable())
}

function requiredText(max: number) {
  return z.string().trim().min(1).max(max)
}

/**
 * A plain decimal given as a number or a digit string: no sign, exponent, hex or
 * whitespace-only coercion, at most `integerDigits` whole digits and two decimals (the
 * `Decimal(p, 2)` column). A number is judged by its own string form, so `NaN`,
 * `Infinity`, `1e15` and `-1` are all refused.
 */
function decimalField(integerDigits: number, { positive }: { positive: boolean }) {
  const pattern = new RegExp(`^\\d{1,${integerDigits}}(\\.\\d{1,2})?$`)
  return z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((value, ctx) => {
      const text = value === null || value === undefined ? '' : String(value).trim()
      if (text === '') return null
      const parsed = Number(text)
      if (!pattern.test(text) || !Number.isFinite(parsed) || (positive && parsed <= 0)) {
        ctx.addIssue({ code: 'custom', message: 'must be a valid amount' })
        return z.NEVER
      }
      return parsed
    })
}

const floorsField = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((value, ctx) => {
    const text = value === null || value === undefined ? '' : String(value).trim()
    if (text === '') return null
    const parsed = Number(text)
    if (!/^\d{1,3}$/.test(text) || parsed < 1 || parsed > 300) {
      ctx.addIssue({ code: 'custom', message: 'must be a whole number of floors' })
      return z.NEVER
    }
    return parsed
  })

/** A calendar date as `YYYY-MM-DD` (the date input's value) that really exists. */
const dateField = blankable.transform((text, ctx) => {
  if (text === null) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  const date = match ? new Date(`${text}T00:00:00.000Z`) : null
  const year = match ? Number(match[1]) : 0
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text || year < 1900 || year > 2200) {
    ctx.addIssue({ code: 'custom', message: 'must be a valid date' })
    return z.NEVER
  }
  return date
})

const emailField = optionalText(254).refine((value) => value === null || z.email().safeParse(value).success, {
  error: 'must be a valid email address',
})

const mapLinkField = optionalText(2048).refine(
  (value) => {
    if (value === null) return true
    try {
      const url = new URL(value)
      return url.protocol === 'https:' || url.protocol === 'http:'
    } catch {
      return false
    }
  },
  { error: 'must be an http(s) link' },
)

const projectTypeField = blankable.pipe(z.enum(SITE_PROJECT_TYPES).nullable())

const userIdField = optionalText(64)

/**
 * Every site field a caller may set, and how it is normalized. Status, company, slug,
 * `spent` and the audit columns are server-owned and deliberately absent. Assignees are
 * only shape-checked here; the caller binds them to active members of the live company.
 */
const siteFields = {
  name: requiredText(120).refine((value) => slugify(value) !== '', { error: 'must contain letters or digits' }),
  location: requiredText(200),
  address: optionalText(500),
  clientName: optionalText(120),
  clientPhone: optionalText(20).refine((value) => value === null || /^\+?[0-9()\-\s]{6,20}$/.test(value), {
    error: 'must be a valid phone number',
  }),
  clientEmail: emailField,
  mapLink: mapLinkField,
  projectType: projectTypeField,
  contractType: optionalText(120),
  // Decimal(10, 2) and Decimal(14, 2) columns: 8 and 12 whole digits.
  areaSqft: decimalField(8, { positive: true }),
  floors: floorsField,
  budget: decimalField(12, { positive: false }).transform((value) => value ?? 0),
  contractValue: decimalField(12, { positive: false }),
  startDate: dateField,
  targetEndDate: dateField,
  assignedPmId: userIdField,
  assignedEngineerId: userIdField,
}

type SiteFieldName = keyof typeof siteFields

const SITE_FIELD_NAMES: ReadonlySet<string> = new Set(Object.keys(siteFields))

function datesInOrder(site: { startDate?: Date | null; targetEndDate?: Date | null }) {
  return !site.startDate || !site.targetEndDate || site.targetEndDate >= site.startDate
}

const DATE_ORDER = { error: 'must not be before the start date', path: ['targetEndDate'] }

/**
 * Payload accepted by the `createSite` server action, and by the `/sites/new` form, which
 * is mapped onto it. Strict: a key outside `siteFields` (`status`, `companyId`, `spent`,
 * ...) is refused rather than dropped, since those are server-owned.
 */
export const createSiteSchema = z.strictObject(siteFields).refine(datesInOrder, DATE_ORDER)

export type CreateSiteInput = z.infer<typeof createSiteSchema>

/** Parses a `createSite` payload, throwing `Invalid site: <field> ...` on the first problem. */
export function parseCreateSiteInput(input: unknown): CreateSiteInput {
  const result = createSiteSchema.safeParse(input)
  if (!result.success) throw siteIssue(result.error)
  return result.data
}

function siteIssue(error: z.ZodError): Error {
  const issue = error.issues[0]
  const field = issue?.path.length ? issue.path.join('.') : 'payload'
  return new Error(`Invalid site: ${field} ${issue?.message ?? 'is invalid'}`)
}

/** Only the fields the caller sent, each normalized exactly as on create. */
export type UpdateSiteInput = Partial<CreateSiteInput>

/**
 * Parses an `updateSite` payload: a plain object with at least one key, every key one of
 * the create fields, each validated by the create rule for that field. A key left out is
 * left unchanged; a blank optional field is cleared. Throws `Invalid site: ...`.
 */
export function parseUpdateSiteInput(input: unknown): UpdateSiteInput {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Invalid site: payload must be an object')
  }
  const keys = Object.keys(input)
  if (keys.length === 0) throw new Error('Invalid site: payload has no fields to update')
  const unknownKey = keys.find((key) => !SITE_FIELD_NAMES.has(key))
  if (unknownKey !== undefined) throw new Error(`Invalid site: ${unknownKey.slice(0, 64)} is not an editable field`)

  const shape = Object.fromEntries(keys.map((key) => [key, siteFields[key as SiteFieldName]]))
  const schema = z.strictObject(shape).refine((site) => datesInOrder(site as UpdateSiteInput), DATE_ORDER)
  const result = schema.safeParse(input)
  if (!result.success) throw siteIssue(result.error)
  return result.data as UpdateSiteInput
}

const INVALID_SELECTION = 'Invalid task selection'

/** Upper bounds for the checklist selection a `/sites/new` POST may carry. */
const MAX_SELECTED_TASKS = 2000
const MAX_SELECTION_TEXT = 200_000

const recordIdField = z.string().trim().min(1).max(64)

const NEW_SITE_SELECTION_KEYS: ReadonlySet<string> = new Set(['templateId', 'selectedTaskIds'])

export type NewSiteFormInput = {
  site: CreateSiteInput
  templateId: string | null
  selectedTaskIds: string[]
}

function parseChecklistSelection(rawTemplateId: string | undefined, rawSelection: string | undefined) {
  const templateId = (rawTemplateId ?? '').trim()
  if (templateId.length > 64) throw new Error(INVALID_SELECTION)

  let selectedTaskIds: string[] = []
  if (rawSelection !== undefined && rawSelection !== '') {
    if (rawSelection.length > MAX_SELECTION_TEXT) throw new Error(INVALID_SELECTION)
    let parsed: unknown
    try {
      parsed = JSON.parse(rawSelection)
    } catch {
      throw new Error(INVALID_SELECTION)
    }
    const result = z.array(recordIdField).max(MAX_SELECTED_TASKS).safeParse(parsed)
    if (!result.success) throw new Error(INVALID_SELECTION)
    selectedTaskIds = result.data
  }

  if (!templateId && selectedTaskIds.length > 0) throw new Error(INVALID_SELECTION)
  return { templateId: templateId || null, selectedTaskIds }
}

/**
 * Maps the `/sites/new` form onto the `createSite` payload and validates it with the same
 * strict schema. Every entry must be a single text value: a repeated key or a file is
 * refused rather than resolved, and a key that is neither a site field nor the checklist
 * selection is refused by the strict schema. Throws `Invalid site: ...` or
 * `Invalid task selection`.
 */
export function parseNewSiteForm(formData: FormData): NewSiteFormInput {
  const site: Array<[string, string]> = []
  const selection = new Map<string, string>()
  for (const key of new Set(formData.keys())) {
    const values = formData.getAll(key)
    const value = values[0]
    if (values.length !== 1 || typeof value !== 'string') {
      throw new Error(`Invalid site: ${key.slice(0, 64)} must be a single text value`)
    }
    if (NEW_SITE_SELECTION_KEYS.has(key)) selection.set(key, value)
    else site.push([key, value])
  }

  return {
    // `Object.fromEntries` defines own keys, so even `__proto__` reaches the strict schema.
    site: parseCreateSiteInput(Object.fromEntries(site)),
    ...parseChecklistSelection(selection.get('templateId'), selection.get('selectedTaskIds')),
  }
}
