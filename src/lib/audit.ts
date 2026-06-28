'use server'

import { prisma } from '@/lib/prisma'

/**
 * Central audit logging helper.
 * Silently fails so it never breaks primary business logic.
 */
export async function logActivity({
  userId,
  companyId,
  action,
  module,
  recordId,
  description,
  before,
  after,
}: {
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
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        companyId: companyId ?? null,
        action,
        module,
        recordId: recordId ?? null,
        before: before ?? undefined,
        after: after ? { ...after, _description: description } : description ? { _description: description } : undefined,
      },
    })
  } catch {
    // Non-critical — never throw
  }
}
