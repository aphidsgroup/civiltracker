import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

// One-time cleanup: purge all UNTICK entries and old TICK entries from auditLog
export async function GET() {
  const session = await auth()
  if (!session?.user?.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    .filter(e => !(e.after as any)?.taskId)
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
