import { prisma } from '@/lib/prisma'
import { auditLogData } from '@/lib/audit-data'
import type { AuditEntry } from '@/lib/audit-data'

/*
 * Audit logging. There are two ways to write an audit record and they make different
 * promises:
 *
 * - Guaranteed audit: destructive or lifecycle operations (deletes, deactivations,
 *   restores, roster removals) write `tx.auditLog.create({ data: auditLogData(...) })`
 *   (`@/lib/audit-data`) on the same transaction client as their authorization re-read
 *   and mutation. An audit failure throws and rolls the mutation back, so the change
 *   never commits unaudited.
 *
 * - `logActivity`: best-effort activity observability for non-destructive events
 *   (creates, edits, the approvals feed). It runs after the business write has committed
 *   and a failure is reported with `console.error` rather than thrown. It must never be
 *   used where the caller promises an audit trail.
 *
 * This module is deliberately not a `'use server'` file, so it is never exposed as a
 * callable server action that could forge audit rows.
 */
export async function logActivity(entry: AuditEntry) {
  try {
    await prisma.auditLog.create({ data: auditLogData(entry) })
  } catch (err) {
    console.error('Activity log write failed', { action: entry.action, module: entry.module, recordId: entry.recordId ?? null }, err)
  }
}
