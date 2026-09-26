import { AttendanceStatus } from '@prisma/client'
import { NextResponse } from 'next/server'
import { requireAssignedScopeMutation } from '@/lib/auth/site-mutation'
import { prisma } from '@/lib/prisma'

const MAX_BATCH = 500
const LABOUR_NOT_FOUND = 'FORBIDDEN: Labour not found or access denied'

class AttendanceDenied extends Error {}

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

type Mark = { labourId: string; status: AttendanceStatus }

/**
 * The marked rows of `{ attendance: [{ labourId, status }] }`, or null when the body is
 * malformed. A blank status is a row the marker toggled off and is skipped; any other
 * status must be exactly an `AttendanceStatus`. A worker may appear once.
 */
function parseMarks(body: unknown): Mark[] | null {
  if (!body || typeof body !== 'object') return null
  const rows = (body as { attendance?: unknown }).attendance
  if (!Array.isArray(rows) || rows.length > MAX_BATCH) return null

  const marks: Mark[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (!row || typeof row !== 'object') return null
    const { labourId, status } = row as { labourId?: unknown; status?: unknown }
    if (typeof labourId !== 'string' || !labourId.trim() || labourId.length > 64) return null
    if (seen.has(labourId)) return null
    seen.add(labourId)
    if (status === undefined || status === null || status === '') continue
    if (typeof status !== 'string' || !(Object.values(AttendanceStatus) as string[]).includes(status)) return null
    marks.push({ labourId, status: status as AttendanceStatus })
  }
  return marks
}

/*
 * Marks today's attendance for a batch of workers.
 *
 * Live `attendance.mark` + LABOUR on a principal with a tenant context, before the body
 * is read (SUPER_ADMIN is refused). Every worker must be of exactly the live company on a
 * site in the principal's `assignedSiteScope` (field roles: assigned live sites only); the
 * attendance row takes the worker's own site. The lookup and every write run in one
 * transaction, and one bad row refuses the whole batch.
 */
export async function POST(request: Request) {
  let gate
  try {
    gate = await requireAssignedScopeMutation('attendance.mark', 'LABOUR')
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Forbidden'
    return fail(message, message.startsWith('UNAUTHORIZED:') ? 401 : 403)
  }
  const { user, scope } = gate

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail('Invalid attendance request', 400)
  }
  const marks = parseMarks(body)
  if (!marks) return fail('Invalid attendance request', 400)
  if (marks.length === 0) return NextResponse.json({ success: true, count: 0 })

  const today = new Date(); today.setHours(0, 0, 0, 0)

  try {
    const count = await prisma.$transaction(async (tx) => {
      const workers = await tx.labour.findMany({
        where: { id: { in: marks.map((mark) => mark.labourId) }, companyId: user.companyId, site: scope },
        select: { id: true, siteId: true },
      })
      const siteOf = new Map(workers.map((worker) => [worker.id, worker.siteId]))
      if (marks.some((mark) => !siteOf.has(mark.labourId))) throw new AttendanceDenied(LABOUR_NOT_FOUND)

      for (const { labourId, status } of marks) {
        await tx.labourAttendance.upsert({
          where: { labourId_date: { labourId, date: today } },
          create: { labourId, siteId: siteOf.get(labourId)!, date: today, status, markedById: user.id },
          update: { status, markedById: user.id },
        })
      }
      return marks.length
    })
    return NextResponse.json({ success: true, count })
  } catch (error: unknown) {
    if (error instanceof AttendanceDenied) return fail(error.message, 403)
    throw error
  }
}
