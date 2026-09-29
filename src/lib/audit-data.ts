import type { Prisma } from '@prisma/client'

/*
 * Pure audit-row shaping, shared by the guaranteed in-transaction audit writes and the
 * best-effort `logActivity` in `@/lib/audit` (see that module for which to use when).
 */

export type AuditEntry = {
  userId: string
  companyId?: string | null
  action: string
  module: string
  recordId?: string | null
  description?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  before?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  after?: any
}

/** The `AuditLog` row for an entry; the description is stored as `after._description`. */
export function auditLogData({ userId, companyId, action, module, recordId, description, before, after }: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
  return {
    userId,
    companyId: companyId ?? null,
    action,
    module,
    recordId: recordId ?? null,
    before: before ?? undefined,
    after: after ? { ...after, _description: description } : description ? { _description: description } : undefined,
  }
}
