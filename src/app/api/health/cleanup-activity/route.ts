import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth/require-super-admin'

// One-time cleanup: purge all UNTICK entries and old TICK entries from auditLog
export async function GET() {
  try {
    await requireSuperAdmin()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: message.startsWith('FORBIDDEN:') ? 403 : 500 })
  }

  // Delete all UNTICK entries (should never exist going forward)
  const untickResult = await prisma.auditLog.deleteMany({
    where: {
      module: 'CHECKLIST',
      action: 'UNTICK',
    }
  })

  // Find TICK entries where taskId is NOT stored in after JSON (legacy entries)
  // These can't be cleaned up on untick so remove them to start fresh
  const allTickEntries = await prisma.auditLog.findMany({
    where: { module: 'CHECKLIST', action: 'TICK' },
    select: { id: true, after: true }
  })

  const legacyIds = allTickEntries
    .filter((e) => !hasTaskId(e.after))
    .map(e => e.id)

  let legacyResult = { count: 0 }
  if (legacyIds.length > 0) {
    legacyResult = await prisma.auditLog.deleteMany({
      where: { id: { in: legacyIds } }
    })
  }

  return NextResponse.json({
    success: true,
    deleted: {
      untickEntries: untickResult.count,
      legacyTickEntries: legacyResult.count,
    },
    message: 'Activity log cleaned. Only fresh TICK entries (with taskId) remain. These will auto-delete on untick.'
  })
}

function hasTaskId(value: unknown): value is { taskId: string } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'taskId' in value &&
    typeof (value as { taskId?: unknown }).taskId === 'string' &&
    (value as { taskId: string }).taskId.trim().length > 0,
  )
}
