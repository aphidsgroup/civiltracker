import type { Prisma } from '@prisma/client'
import { auditLogData } from '@/lib/audit-data'
import type { TenantMutationUser } from '@/lib/auth/site-mutation'
import { MAX_AMOUNT_10_2, paise, rupeeSum } from '@/lib/validation/financial-mutations'

export const LABOUR_NOT_FOUND = 'FORBIDDEN: Labour not found or access denied'
const LABOUR_ADVANCE_CHANGED = 'Labour advance changed. Refresh and retry.'

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

/**
 * Pays a worker an advance inside the caller's transaction. `workerWhere` is the caller's
 * binding (company, current site, assigned scope) and must admit only active workers.
 *
 * The advance is booked on the worker's latest attendance *on its current site*, or on
 * its opening advance when it has none there: a log of a site it has since left is never
 * written. The write is guarded on the balance read and the audit record is written on the
 * same transaction, so a payment without its audit trail rolls back.
 */
export async function payLabourAdvance(
  tx: Prisma.TransactionClient,
  user: TenantMutationUser,
  workerWhere: Prisma.LabourWhereInput,
  amount: number,
) {
  const worker = await tx.labour.findFirst({
    where: workerWhere,
    select: { id: true, name: true, siteId: true, openingAdvance: true },
  })
  if (!worker) throw new Error(LABOUR_NOT_FOUND)

  const latest = await tx.labourAttendance.findFirst({
    where: { labourId: worker.id, siteId: worker.siteId },
    orderBy: { date: 'desc' },
    select: { id: true, date: true, advance: true },
  })

  const current = Number(latest ? latest.advance : worker.openingAdvance)
  const next = rupeeSum(current, amount)
  if (paise(next) > paise(MAX_AMOUNT_10_2)) throw new Error('Payment would exceed the labour advance limit.')

  const result = latest
    ? await tx.labourAttendance.updateMany({
        where: { id: latest.id, labourId: worker.id, siteId: worker.siteId, advance: latest.advance },
        data: { advance: next },
      })
    : await tx.labour.updateMany({
        where: { ...workerWhere, id: worker.id, siteId: worker.siteId, openingAdvance: worker.openingAdvance },
        data: { openingAdvance: next },
      })
  if (result.count !== 1) throw new Error(LABOUR_ADVANCE_CHANGED)

  const booking = latest
    ? { siteId: worker.siteId, attendanceId: latest.id, attendanceDate: isoDate(latest.date) }
    : { siteId: worker.siteId, attendanceId: null }
  const field = latest ? 'advance' : 'openingAdvance'
  await tx.auditLog.create({
    data: auditLogData({
      userId: user.id,
      companyId: user.companyId,
      action: 'PAID',
      module: 'LABOUR',
      recordId: worker.id,
      description: `${user.name ?? user.email} paid ₹${amount.toLocaleString('en-IN')} advance to worker "${worker.name}"`,
      before: { ...booking, [field]: current },
      after: { ...booking, [field]: next, paidAmount: amount },
    }),
  })
}
