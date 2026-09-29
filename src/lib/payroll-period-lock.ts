import type { Prisma, PrismaClient } from '@prisma/client'

/*
 * Payroll-period lock for attendance and labour-advance writes.
 *
 * A salary run past DRAFT (SUBMITTED, VERIFIED, APPROVED, PAID) has settled every day of
 * its period for the workers it covers: a company-wide run (no site) covers every worker
 * of the company, a site run covers attendance booked on that site, and a run covers any
 * worker it has an item for, wherever that worker was booked. No attendance row or advance
 * of a covered worker may be written, changed or deleted for a day in such a period.
 *
 * Every writer calls `assertPayrollPeriodOpen` inside its transaction, before its first
 * mutation, with the exact company, the exact (worker, site) bookings and the day it
 * writes. The check and the write alone would still race a run's transition past DRAFT
 * (read DRAFT, the run is approved and committed, the write commits into the closed
 * period), so both sides run through `payrollTransaction` at SERIALIZABLE isolation and a
 * transition reads the attendance and workers of its period first
 * (`lockPayrollPeriodForTransition`). Each side then reads what the other writes, and
 * PostgreSQL's serializable snapshot isolation aborts one of any two that overlap (Prisma
 * `P2034`). The loser is retried from the start on a fresh snapshot, where the writer
 * finds the committed run and refuses, or the transition finds the committed write. No
 * raw SQL is involved.
 */

export const PAYROLL_PERIOD_CLOSED = 'FORBIDDEN: Attendance for this date is part of a submitted, approved or paid salary run'

export class PayrollPeriodClosedError extends Error {
  constructor() {
    super(PAYROLL_PERIOD_CLOSED)
  }
}

/** A worker and the site its attendance or advance is booked on. */
export type PayrollBooking = { labourId: string; siteId: string }

/**
 * The calendar day a `@db.Date` column stores for `date`: Prisma writes its UTC date, so
 * the period bounds are compared against that day's UTC midnight, not the time of day.
 */
function payrollDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/**
 * Throws `PayrollPeriodClosedError` when `date` lies in a salary run of exactly
 * `companyId` past DRAFT that is company-wide, for a booked site, or has an item for a
 * booked worker. Call on the writer's transaction client before its first mutation.
 */
export async function assertPayrollPeriodOpen(
  tx: Prisma.TransactionClient,
  companyId: string,
  date: Date,
  bookings: PayrollBooking[],
) {
  if (bookings.length === 0) return
  const day = payrollDay(date)
  const labourIds = [...new Set(bookings.map((booking) => booking.labourId))]
  const siteIds = [...new Set(bookings.map((booking) => booking.siteId))]
  const finalized = await tx.salaryRun.findFirst({
    where: {
      companyId,
      status: { not: 'DRAFT' },
      periodStart: { lte: day },
      periodEnd: { gte: day },
      OR: [
        { siteId: null },
        { siteId: { in: siteIds } },
        { items: { some: { labourId: { in: labourIds } } } },
      ],
    },
    select: { id: true },
  })
  if (finalized) throw new PayrollPeriodClosedError()
}

/**
 * Reads, on the transition's transaction, every attendance row and worker the run's period
 * covers, so a concurrent serializable writer of any of them conflicts with the transition.
 * Call inside a `payrollTransaction` before moving the run past DRAFT. A run that cannot
 * be found under the exact binding reads nothing; the caller's guarded write refuses it.
 */
export async function lockPayrollPeriodForTransition(
  tx: Prisma.TransactionClient,
  run: { id: string; companyId: string; siteId: string | null },
) {
  const found = await tx.salaryRun.findFirst({
    where: { id: run.id, companyId: run.companyId, siteId: run.siteId },
    select: { siteId: true, periodStart: true, periodEnd: true, items: { select: { labourId: true } } },
  })
  if (!found) return

  const labourIds = [...new Set(found.items.map((item) => item.labourId))]
  const covered = found.siteId === null
    ? null
    : { siteId: found.siteId, labourIds }

  // Counts, not a LIMIT 1 probe, so the whole covered range is read and predicate-locked.
  await tx.labourAttendance.count({
    where: {
      labour: { companyId: run.companyId },
      date: { gte: found.periodStart, lte: found.periodEnd },
      ...(covered ? { OR: [{ siteId: covered.siteId }, { labourId: { in: covered.labourIds } }] } : {}),
    },
  })
  // An advance with no attendance to book on moves the worker's opening advance.
  await tx.labour.count({
    where: {
      companyId: run.companyId,
      ...(covered ? { OR: [{ siteId: covered.siteId }, { id: { in: covered.labourIds } }] } : {}),
    },
  })
}

export const PAYROLL_TRANSACTION_OPTIONS = { isolationLevel: 'Serializable' } as const
export const PAYROLL_TRANSACTION_ATTEMPTS = 3

/** Prisma's code for a serialization failure or deadlock that rolled the transaction back. */
function isSerializationFailure(error: unknown) {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2034'
}

/**
 * Runs `fn` as one SERIALIZABLE interactive transaction, retrying it from the start (at
 * most `PAYROLL_TRANSACTION_ATTEMPTS` runs in all) only when the database rolled it back
 * for a serialization conflict. Any other error, and the last conflict, is thrown as is.
 */
export async function payrollTransaction<T>(
  client: Pick<PrismaClient, '$transaction'>,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await client.$transaction(fn, PAYROLL_TRANSACTION_OPTIONS)
    } catch (error) {
      if (attempt >= PAYROLL_TRANSACTION_ATTEMPTS || !isSerializationFailure(error)) throw error
    }
  }
}
