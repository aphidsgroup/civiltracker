/** Longest checklist task name stored, after normalization. */
export const CHECKLIST_TASK_NAME_MAX_LENGTH = 200

// Raw input past this is refused before any normalization work.
const RAW_TASK_NAME_MAX_LENGTH = CHECKLIST_TASK_NAME_MAX_LENGTH * 4

export const INVALID_TASK_NAME = 'Invalid checklist task name'

/**
 * A checklist task name as stored: a string with no control or invisible format
 * characters (line breaks, tabs, NUL, bidi overrides, zero-width marks), Unicode
 * NFC-normalized, inner whitespace collapsed to single spaces, trimmed, non-blank and at
 * most `CHECKLIST_TASK_NAME_MAX_LENGTH` characters. Anything else throws.
 */
export function parseChecklistTaskName(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > RAW_TASK_NAME_MAX_LENGTH) throw new Error(INVALID_TASK_NAME)
  // Cc: C0/C1 controls. Cf: format chars (bidi overrides, zero-width marks, BOM).
  // Zl/Zp: U+2028 LINE SEPARATOR / U+2029 PARAGRAPH SEPARATOR, the only members of each.
  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(raw)) throw new Error(INVALID_TASK_NAME)
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!name || name.length > CHECKLIST_TASK_NAME_MAX_LENGTH) throw new Error(INVALID_TASK_NAME)
  return name
}
