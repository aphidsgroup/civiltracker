import type { Prisma } from '@prisma/client'

/*
 * Site binding for `LabourAttendance` writes.
 *
 * A row is unique on (labourId, date) alone, so once a worker is reassigned a write keyed
 * only on that pair would update the row an earlier site recorded — its status, start
 * time and advance money — from the new site. Policy (fail closed): every write is bound
 * to exactly the one current site it is made for, and an existing row for the same
 * (worker, date) on any other site is refused, never updated or migrated. Moving a worker
 * is refused while it has a row for today or later on a site other than its destination,
 * so a reassignment never leaves a live same-key row behind on the old site.
 */

export const ATTENDANCE_OTHER_SITE = 'FORBIDDEN: Attendance for this date is recorded on another site'

export class AttendanceSiteConflictError extends Error {
  constructor() {
    super(ATTENDANCE_OTHER_SITE)
  }
}

/**
 * Upserts the (labourId, date) row on exactly `siteId`, inside the caller's transaction.
 * A same-key row on another site is refused; the upsert's unique `where` carries the site
 * too, so it can only ever update a row of that site.
 */
export async function upsertSiteAttendance(
  tx: Prisma.TransactionClient,
  key: { labourId: string; date: Date; siteId: string },
  create: Omit<Prisma.LabourAttendanceUncheckedCreateInput, 'labourId' | 'date' | 'siteId'>,
  update: Omit<Prisma.LabourAttendanceUncheckedUpdateInput, 'labourId' | 'date' | 'siteId'>,
) {
  const { labourId, date, siteId } = key
  const existing = await tx.labourAttendance.findFirst({ where: { labourId, date }, select: { siteId: true } })
  if (existing && existing.siteId !== siteId) throw new AttendanceSiteConflictError()

  return tx.labourAttendance.upsert({
    where: { labourId_date: { labourId, date }, siteId },
    create: { ...create, labourId, date, siteId },
    update,
  })
}

/**
 * Refuses moving a worker to `toSiteId` while it has attendance for `from` or later on
 * any other site. Call inside the transaction that moves the worker, before the move.
 */
export async function assertNoOtherSiteAttendanceFrom(
  tx: Prisma.TransactionClient,
  labourId: string,
  toSiteId: string,
  from: Date,
) {
  const conflict = await tx.labourAttendance.findFirst({
    where: { labourId, date: { gte: from }, siteId: { not: toSiteId } },
    select: { id: true },
  })
  if (conflict) throw new AttendanceSiteConflictError()
}
