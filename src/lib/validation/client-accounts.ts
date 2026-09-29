import { z } from 'zod'

/** Password bounds shared by the client-account form and its server action. */
export const CLIENT_PASSWORD_MIN_LENGTH = 8
export const CLIENT_PASSWORD_MAX_LENGTH = 72

/** Upper bound on the sites one client login may be granted in a single submission. */
const MAX_CLIENT_SITES = 200

export const SELECT_CLIENT_SITE_MESSAGE = 'Select at least one active site for client portal access.'

/**
 * A display name: Unicode-normalized, inner whitespace collapsed to single spaces, no
 * control characters, and at least one letter or digit.
 */
const nameField = z
  .string({ error: 'Client name is required.' })
  .transform((value) => value.normalize('NFC').replace(/\s+/g, ' ').trim())
  .pipe(
    z
      .string()
      .min(2, { error: 'Client name must be at least 2 characters.' })
      .max(120, { error: 'Client name is too long.' })
      .refine((value) => !/\p{Cc}/u.test(value), { error: 'Client name contains invalid characters.' })
      .refine((value) => /[\p{L}\p{N}]/u.test(value), { error: 'Client name must contain letters or digits.' }),
  )

/** Canonical login email: trimmed, lowercased, RFC-shaped and within the 254-octet limit. */
const emailField = z
  .string({ error: 'Email address is required.' })
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email({ error: 'Enter a valid email address.' })
      .max(254, { error: 'Email address is too long.' }),
  )

/**
 * Optional contact phone. Separators are accepted as typed but stored stripped, so the
 * value is an optional leading `+` and 7 to 15 digits (E.164 length).
 */
const phoneField = z
  .string()
  .max(32, { error: 'Phone number is too long.' })
  .optional()
  .transform((value, ctx) => {
    const text = value?.trim() ?? ''
    if (text === '') return undefined
    if (!/^\+?[0-9()\-.\s]+$/.test(text)) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number.' })
      return z.NEVER
    }
    const canonical = (text.startsWith('+') ? '+' : '') + text.replace(/\D/g, '')
    if (!/^\+?[0-9]{7,15}$/.test(canonical)) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number.' })
      return z.NEVER
    }
    return canonical
  })

/**
 * The login password is taken as typed (never trimmed). It must be at least
 * `CLIENT_PASSWORD_MIN_LENGTH` characters, not blank, and fit bcrypt's 72-byte input so no
 * trailing part is silently ignored at login.
 */
const passwordField = z
  .string({ error: 'A login password is required.' })
  .min(CLIENT_PASSWORD_MIN_LENGTH, { error: `Password must be at least ${CLIENT_PASSWORD_MIN_LENGTH} characters.` })
  .refine((value) => value.trim().length >= CLIENT_PASSWORD_MIN_LENGTH, {
    error: `Password must contain at least ${CLIENT_PASSWORD_MIN_LENGTH} non-space characters.`,
  })
  .refine((value) => new TextEncoder().encode(value).length <= CLIENT_PASSWORD_MAX_LENGTH, {
    error: 'Password is too long.',
  })
  .refine((value) => !/\p{Cc}/u.test(value), { error: 'Password contains invalid characters.' })

const siteIdsField = z
  .array(
    z
      .string()
      .min(1, { error: SELECT_CLIENT_SITE_MESSAGE })
      .max(64, { error: 'Invalid site selection.' })
      .regex(/^[A-Za-z0-9_-]+$/, { error: 'Invalid site selection.' }),
  )
  .min(1, { error: SELECT_CLIENT_SITE_MESSAGE })
  .max(MAX_CLIENT_SITES, { error: 'Too many sites selected.' })
  .refine((ids) => new Set(ids).size === ids.length, { error: 'Invalid site selection.' })

/**
 * Payload accepted by the `createClientUser` server action. Strict: role, company,
 * membership and every other server-owned field are refused rather than dropped.
 */
export const createClientAccountSchema = z.strictObject({
  name: nameField,
  email: emailField,
  phone: phoneField,
  password: passwordField,
  siteIds: siteIdsField,
})

export type CreateClientAccountInput = z.infer<typeof createClientAccountSchema>

const SINGLE_VALUE_KEYS: ReadonlySet<string> = new Set(['name', 'email', 'phone', 'password'])
const CLIENT_ACCOUNT_FORM_KEYS: ReadonlySet<string> = new Set([...SINGLE_VALUE_KEYS, 'siteIds'])

/**
 * Maps the Create Client Account form onto `createClientAccountSchema`. Allowlist: `name`,
 * `email`, `phone` and `password` as single text values and `siteIds` as repeated text
 * values; any other key, a repeated scalar or a file is refused. Throws
 * `Invalid client account: ...` (or the site-selection message) on the first problem.
 */
export function parseCreateClientAccountForm(formData: FormData): CreateClientAccountInput {
  const payload: Record<string, string | string[]> = Object.create(null)
  for (const key of new Set(formData.keys())) {
    if (!CLIENT_ACCOUNT_FORM_KEYS.has(key)) {
      throw new Error(`Invalid client account: ${key.slice(0, 64)} is not an accepted field`)
    }
    const values = formData.getAll(key)
    if (values.some((value) => typeof value !== 'string')) {
      throw new Error(`Invalid client account: ${key} must be text`)
    }
    const texts = values as string[]
    if (key === 'siteIds') {
      payload.siteIds = texts
    } else {
      if (texts.length !== 1) throw new Error(`Invalid client account: ${key} must be a single value`)
      payload[key] = texts[0]
    }
  }
  if (payload.siteIds === undefined) payload.siteIds = []

  const result = createClientAccountSchema.safeParse({ ...payload })
  if (!result.success) {
    const issue = result.error.issues[0]
    const message = issue?.message ?? 'is invalid'
    if (message === SELECT_CLIENT_SITE_MESSAGE) throw new Error(SELECT_CLIENT_SITE_MESSAGE)
    const field = issue?.path.length ? issue.path.join('.') : 'payload'
    throw new Error(`Invalid client account (${field}): ${message}`)
  }
  return result.data
}
