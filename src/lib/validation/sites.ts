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
 * Payload accepted by the `createSite` server action. Strict: a key outside this set
 * (`status`, `companyId`, `spent`, ...) is refused rather than dropped, since those are
 * server-owned. Assignees are only shape-checked here; the action binds them to active
 * members of the live company.
 */
export const createSiteSchema = z
  .strictObject({
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
  })
  .refine((site) => !site.startDate || !site.targetEndDate || site.targetEndDate >= site.startDate, {
    error: 'must not be before the start date',
    path: ['targetEndDate'],
  })

export type CreateSiteInput = z.infer<typeof createSiteSchema>

/** Parses a `createSite` payload, throwing `Invalid site: <field> ...` on the first problem. */
export function parseCreateSiteInput(input: unknown): CreateSiteInput {
  const result = createSiteSchema.safeParse(input)
  if (!result.success) {
    const issue = result.error.issues[0]
    const field = issue?.path.length ? issue.path.join('.') : 'payload'
    throw new Error(`Invalid site: ${field} ${issue?.message ?? 'is invalid'}`)
  }
  return result.data
}
