'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/audit'
import { auditLogData } from '@/lib/audit-data'
import { AttendanceStatus, LabourTrade } from '@prisma/client'
import type { Prisma } from '@prisma/client'
import { requireAssignedScopeMutation, requireAssignedSiteMutation } from '@/lib/auth/site-mutation'
import type { TenantMutationUser } from '@/lib/auth/site-mutation'
import { assertNoOtherSiteAttendanceFrom, upsertSiteAttendance } from '@/lib/labour-attendance'
import { hasPermission } from '@/lib/permissions'
import {
  MAX_AMOUNT_10_2,
  MAX_AMOUNT_14_2,
  paise,
  parseAmountText,
  parseFinancialReason,
  rupeeSum,
} from '@/lib/validation/financial-mutations'

/*
 * Muster-roll actions. Marking the roll (attendance, roster, contractor headcount) needs
 * live `attendance.mark` + LABOUR; editing an existing worker's master data (wage, site)
 * needs live `labour.manage` + LABOUR. Both are checked before any read. Every site is a
 * live site of exactly the live company that the principal may act on (`assignedSiteScope`:
 * SITE_ENGINEER and SUPERVISOR only their assigned sites), and every worker and
 * contractor log must sit on such a site too, so a field role can neither write on nor
 * pull a worker off a site it is not assigned to. Multi-step money and attendance changes
 * run in one transaction with counted, company-scoped writes. Attendance rows are written
 * only on the site they are made for (`upsertSiteAttendance`): a row another site recorded
 * for the same worker and date is refused, and a worker is not moved while it has one.
 *
 * Money policy: marking the roll and editing a worker move no money. An advance sent to
 * those actions is refused unless it is absent, null or numeric zero — before any read,
 * except that a worker move reports a site-history conflict first — and an attendance
 * update never touches the stored advance. An advance is recorded only explicitly
 * (`recordLabourAdvanceAction`, or a contractor log's daily advance), which needs live
 * `payments.manage`, strict decimal text within the column, the stored name typed back,
 * a reason, the exact current site binding, a guarded write and its audit row in the same
 * transaction. Removing a row or log that carries an advance needs `payments.manage` too.
 */

const LABOUR_NOT_FOUND = 'FORBIDDEN: Labour not found or access denied'
const SUBCONTRACTOR_NOT_FOUND = 'FORBIDDEN: Subcontractor not found or access denied'
const CONTRACTOR_LOG_NOT_FOUND = 'FORBIDDEN: Contractor attendance not found or access denied'
const LABOUR_ADVANCE_CHANGED = 'Labour advance changed. Refresh and retry.'
const SUBCONTRACTOR_ADVANCE_CHANGED = 'Subcontractor advance changed. Refresh and retry.'
const DEFAULT_DAILY_WAGE = 650

/** Throws unless the live role may move money; call after the action's gate. */
function requirePaymentsManage(user: TenantMutationUser) {
  if (!hasPermission(user.role, 'payments.manage')) {
    throw new Error('FORBIDDEN: Missing required permission "payments.manage"')
  }
}

/** A contractor log's daily advance that asks for no money: absent, blank, numeric zero or zero decimal text. */
function isNoMoney(raw: unknown) {
  if (raw === undefined || raw === null || raw === '' || raw === 0) return true
  return typeof raw === 'string' && /^0+(\.0{1,2})?$/.test(raw.trim())
}

/** Refuses an advance on a path that moves no money: only absent, null or numeric zero pass. */
function refuseAdvance(raw: unknown) {
  if (raw !== undefined && raw !== null && raw !== 0) {
    throw new Error('FORBIDDEN: An advance is a payment; record it separately with a confirmation and reason')
  }
}

function requireAttendanceScope() {
  return requireAssignedScopeMutation('attendance.mark', 'LABOUR')
}

/** A worker of exactly `companyId` whose current site is in the principal's `scope`. */
function companyLabourWhere(id: string, companyId: string, scope: Prisma.SiteWhereInput) {
  return { id, companyId, site: scope }
}

function requiredName(raw: unknown, field: string): string {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) throw new Error(`${field} is required`)
  return text
}

/** A finite non-negative amount; missing becomes `fallback`. */
function parseAmount(raw: unknown, field: string, fallback: number): number {
  if (raw === undefined || raw === null || raw === '') return fallback
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${field}`)
  return value
}

/** A trade from the enum; `OTHERS` is stored as HELPER with the custom name tagged in `phone`. */
function parseTrade(trade: unknown, customTrade: unknown): { trade: LabourTrade; customTag: string | null } {
  if (trade === 'OTHERS') {
    const custom = typeof customTrade === 'string' ? customTrade.trim() : ''
    if (!custom) throw new Error('Custom trade is required')
    return { trade: LabourTrade.HELPER, customTag: `CUSTOM_TRADE:${custom}` }
  }
  if (trade === undefined || trade === null || trade === '') return { trade: LabourTrade.HELPER, customTag: null }
  if (typeof trade !== 'string' || !(Object.values(LabourTrade) as string[]).includes(trade)) {
    throw new Error('Invalid labour trade')
  }
  return { trade: trade as LabourTrade, customTag: null }
}

function parseStatus(raw: unknown): AttendanceStatus {
  if (typeof raw !== 'string' || !(Object.values(AttendanceStatus) as string[]).includes(raw)) {
    throw new Error('Invalid attendance status')
  }
  return raw as AttendanceStatus
}

function parseStartTime(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'string' || raw.length > 16) throw new Error('Invalid start time')
  return raw
}

function startOfToday() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function plainWorker(worker: { id: string; name: string; trade: LabourTrade; phone: string | null; dailyWage: unknown; siteId: string }) {
  return { id: worker.id, name: worker.name, trade: worker.trade, phone: worker.phone, dailyWage: Number(worker.dailyWage), siteId: worker.siteId }
}

export async function addMobileWorkerAction(formData: {
  name: string
  trade: string
  customTrade?: string
  dailyRate: number
  siteId: string
  startTime?: string
}) {
  const { user, site } = await requireAssignedSiteMutation(String(formData?.siteId ?? ''), 'attendance.mark', 'LABOUR')
  const name = requiredName(formData.name, 'Name')
  const { trade, customTag } = parseTrade(formData.trade, formData.customTrade)
  const dailyWage = parseAmount(formData.dailyRate, 'daily rate', 0) || DEFAULT_DAILY_WAGE

  const worker = await prisma.labour.create({
    data: {
      companyId: user.companyId,
      siteId: site.id,
      name,
      trade,
      phone: customTag,
      dailyWage,
      isActive: true,
    }
  })

  await logActivity({
    userId: user.id,
    companyId: user.companyId,
    action: 'CREATE',
    module: 'LABOUR',
    recordId: worker.id,
    description: `${user.name ?? user.email} registered worker "${name}" (${trade}) at site`,
    after: { name, trade, dailyRate: dailyWage },
  })

  revalidatePath('/mobile/attendance')
  revalidatePath('/labour/attendance')
  return { success: true, worker: plainWorker(worker) }
}

export async function updateWorkerAction(formData: {
  id: string
  name: string
  trade: string
  customTrade?: string
  dailyWage: number
  siteId: string
  /** Accepted only as absent or zero: an advance is recorded by `recordLabourAdvanceAction`. */
  advance?: number
}) {
  const { user, site, scope } = await requireAssignedSiteMutation(String(formData?.siteId ?? ''), 'labour.manage', 'LABOUR')
  const companyId = user.companyId
  const id = requiredName(formData.id, 'Labour')
  const name = requiredName(formData.name, 'Name')
  const { trade, customTag } = parseTrade(formData.trade, formData.customTrade)
  const dailyWage = parseAmount(formData.dailyWage, 'daily wage', 0) || DEFAULT_DAILY_WAGE

  const worker = await prisma.$transaction(async (tx) => {
    const existing = await tx.labour.findFirst({
      where: companyLabourWhere(id, companyId, scope),
      select: { id: true, phone: true, siteId: true },
    })
    if (!existing) throw new Error(LABOUR_NOT_FOUND)

    const today = startOfToday()
    if (existing.siteId !== site.id) await assertNoOtherSiteAttendanceFrom(tx, existing.id, site.id, today)
    // After the site-history check, so a move over another site's attendance is reported
    // as that conflict, and before any write.
    refuseAdvance(formData.advance)

    // A standard trade clears a previous custom-trade tag but keeps a real phone number.
    const phone = customTag ?? (existing.phone?.startsWith('CUSTOM_TRADE:') ? null : existing.phone ?? null)

    const updated = await tx.labour.updateMany({
      where: companyLabourWhere(existing.id, companyId, scope),
      data: { name, trade, phone, dailyWage, siteId: site.id },
    })
    if (updated.count !== 1) throw new Error(LABOUR_NOT_FOUND)

    return { id: existing.id, name, trade, phone, dailyWage, siteId: site.id }
  })

  revalidatePath('/mobile/attendance')
  revalidatePath('/labour/attendance')
  return { success: true, worker }
}

export async function saveMobileAttendanceAction(records: { labourId: string; status: string; siteId: string; advance?: number, startTime?: string }[], dateIso?: string) {
  const { user, scope } = await requireAttendanceScope()
  const companyId = user.companyId
  if (!Array.isArray(records)) throw new Error('Invalid attendance records')

  let targetDate = new Date()
  if (dateIso) {
    const parsed = new Date(dateIso)
    if (!isNaN(parsed.getTime())) {
      targetDate = parsed
    }
  }
  targetDate.setHours(0, 0, 0, 0)

  // Marking the roll moves no money: any row asking for an advance refuses the batch.
  for (const item of records) refuseAdvance(item?.advance)
  const marked = records
    .filter((item) => item?.status)
    .map((item) => ({
      labourId: requiredName(item.labourId, 'Labour'),
      siteId: requiredName(item.siteId, 'Site'),
      status: parseStatus(item.status),
      startTime: parseStartTime(item.startTime),
    }))

  // Every worker must be of this company on a site in the principal's scope, and each row
  // must name the worker's own site; one bad row refuses the whole batch. The binding and
  // the writes share one transaction, and each row is written on exactly that site.
  const labourIds = [...new Set(marked.map((item) => item.labourId))]
  await prisma.$transaction(async (tx) => {
    const workers = labourIds.length > 0
      ? await tx.labour.findMany({
          where: { id: { in: labourIds }, companyId, site: scope },
          select: { id: true, siteId: true },
        })
      : []
    const siteOf = new Map(workers.map((worker) => [worker.id, worker.siteId]))
    for (const item of marked) {
      if (siteOf.get(item.labourId) !== item.siteId) throw new Error(LABOUR_NOT_FOUND)
    }

    // A new row starts with no advance; an update never touches the recorded advance.
    for (const item of marked) {
      await upsertSiteAttendance(
        tx,
        { labourId: item.labourId, date: targetDate, siteId: item.siteId },
        { status: item.status, advance: 0, startTime: item.startTime, markedById: user.id },
        { status: item.status, startTime: item.startTime, markedById: user.id },
      )
    }
  })
  const count = marked.length

  // Recalculate budget for all affected sites
  const affectedSiteIds = [...new Set(marked.map((item) => item.siteId))]
  if (affectedSiteIds.length > 0) {
    const { syncSiteBudget } = await import('@/lib/budget')
    for (const sId of affectedSiteIds) {
      await syncSiteBudget(sId)
    }
  }

  revalidatePath('/mobile/attendance')
  revalidatePath('/labour/attendance')

  if (count > 0) {
    await logActivity({
      userId: user.id,
      companyId,
      action: 'CREATE',
      module: 'ATTENDANCE',
      recordId: marked[0].siteId,
      description: `${user.name ?? user.email} marked attendance for ${count} worker(s) for today`,
      after: { count, date: new Date().toLocaleDateString('en-IN') },
    })
  }

  return { success: true, count }
}

/**
 * Records an advance paid to a worker today. Needs live `payments.manage` + LABOUR; the
 * site must be in the principal's assigned scope and be the worker's current site, and the
 * worker must be active and marked on that site today. The amount is strict positive
 * decimal text within `Decimal(10, 2)`; `expectedAdvance` is the balance the payer saw and
 * must still be the stored one. The worker's name is typed back and a reason given. The
 * write is guarded on the balance read and audited on the same transaction, so an advance
 * without its audit trail rolls back.
 */
export async function recordLabourAdvanceAction(input: {
  labourId: string
  siteId: string
  amount: string
  expectedAdvance: string
  confirmationText: string
  reason: string
}) {
  const { user, site, scope } = await requireAssignedSiteMutation(String(input?.siteId ?? ''), 'payments.manage', 'LABOUR')
  const companyId = user.companyId
  const labourId = requiredName(input.labourId, 'Labour')
  const amount = parseAmountText(input.amount, 'advance amount', { max: MAX_AMOUNT_10_2, positive: true })
  const expected = parseAmountText(input.expectedAdvance, 'expected advance', { max: MAX_AMOUNT_10_2 })
  const typed = typeof input.confirmationText === 'string' ? input.confirmationText.trim() : ''
  const reason = parseFinancialReason(input.reason, 'Advance reason')
  const today = startOfToday()

  const next = await prisma.$transaction(async (tx) => {
    const worker = await tx.labour.findFirst({
      where: { ...companyLabourWhere(labourId, companyId, scope), siteId: site.id, isActive: true },
      select: { id: true, name: true },
    })
    if (!worker) throw new Error(LABOUR_NOT_FOUND)
    if (typed !== worker.name.trim()) {
      throw new Error('Advance confirmation text did not match the worker name.')
    }

    const attendance = await tx.labourAttendance.findFirst({
      where: { labourId: worker.id, siteId: site.id, date: today },
      select: { id: true, advance: true },
    })
    if (!attendance) throw new Error('No attendance today for this worker on this site. Mark attendance first.')

    const current = Number(attendance.advance)
    if (paise(current) !== paise(expected)) throw new Error(LABOUR_ADVANCE_CHANGED)
    const total = rupeeSum(current, amount)
    if (paise(total) > paise(MAX_AMOUNT_10_2)) throw new Error('Advance would exceed the labour advance limit.')

    const result = await tx.labourAttendance.updateMany({
      where: { id: attendance.id, labourId: worker.id, siteId: site.id, date: today, advance: attendance.advance },
      data: { advance: total },
    })
    if (result.count !== 1) throw new Error(LABOUR_ADVANCE_CHANGED)

    const booking = { siteId: site.id, attendanceId: attendance.id, attendanceDate: today.toISOString() }
    await tx.auditLog.create({
      data: auditLogData({
        userId: user.id,
        companyId,
        action: 'PAID',
        module: 'LABOUR',
        recordId: worker.id,
        description: `${user.name ?? user.email} paid ₹${amount.toLocaleString('en-IN')} advance to worker "${worker.name}": ${reason}`,
        before: { ...booking, advance: current },
        after: { ...booking, advance: total, paidAmount: amount, reason },
      }),
    })
    return total
  })

  const { syncSiteBudget } = await import('@/lib/budget')
  await syncSiteBudget(site.id)

  revalidatePath('/mobile/attendance')
  revalidatePath('/labour/attendance')
  return { success: true, advance: next }
}

export async function addExistingWorkerToRoster(labourId: string, siteId: string, startTime?: string) {
  const { user, site, scope } = await requireAssignedSiteMutation(String(siteId ?? ''), 'attendance.mark', 'LABOUR')
  const companyId = user.companyId
  const start = parseStartTime(startTime)
  const today = startOfToday()

  const record = await prisma.$transaction(async (tx) => {
    // The worker's current site must be in scope too: a field role may not pull a worker
    // off a site it is not assigned to.
    const labour = await tx.labour.findFirst({
      where: companyLabourWhere(String(labourId ?? ''), companyId, scope),
      select: { id: true, siteId: true },
    })
    if (!labour) throw new Error(LABOUR_NOT_FOUND)
    if (labour.siteId !== site.id) await assertNoOtherSiteAttendanceFrom(tx, labour.id, site.id, today)

    // Mark them present for today to add them to the roster, only on this site's row.
    const attendance = await upsertSiteAttendance(
      tx,
      { labourId: labour.id, date: today, siteId: site.id },
      { status: 'PRESENT', advance: 0, startTime: start, markedById: user.id },
      { status: 'PRESENT', startTime: start },
    )

    // Update their default site assignment too
    const moved = await tx.labour.updateMany({
      where: companyLabourWhere(labour.id, companyId, scope),
      data: { siteId: site.id }
    })
    if (moved.count !== 1) throw new Error(LABOUR_NOT_FOUND)

    return { id: attendance.id }
  })

  revalidatePath('/mobile/attendance')
  return { success: true, record }
}

/**
 * Logs a contractor's headcount for today. Needs live `attendance.mark` + LABOUR on an
 * assigned site. With no daily advance (absent or zero) it moves no money.
 *
 * A daily advance is a payment and additionally needs live `payments.manage`, strict
 * positive decimal text within `Decimal(10, 2)`, the subcontractor's stored name typed
 * back (`advanceConfirmation`) and a reason. It is paid only to an existing active
 * subcontractor of the live company bound to exactly this site — never one created here,
 * company-wide or of another site. The log, the guarded advance increment and the audit
 * row share one transaction.
 */
export async function saveContractorAttendance(data: {
  siteId: string
  contractorName: string
  contractorType: string
  labourCount: number
  dailyAdvance?: string | number
  advanceConfirmation?: string
  advanceReason?: string
  startTime?: string
}) {
  const { user, site } = await requireAssignedSiteMutation(String(data?.siteId ?? ''), 'attendance.mark', 'LABOUR')
  const companyId = user.companyId
  const contractorName = requiredName(data.contractorName, 'Contractor name')
  const contractorType = typeof data.contractorType === 'string' ? data.contractorType.trim() : ''
  const labourCount = data.labourCount
  if (typeof labourCount !== 'number' || !Number.isInteger(labourCount) || labourCount < 0) {
    throw new Error('Invalid labour count')
  }
  const startTime = parseStartTime(data.startTime)

  if (!isNoMoney(data.dailyAdvance)) {
    requirePaymentsManage(user)
    const advance = {
      amount: parseAmountText(typeof data.dailyAdvance === 'string' ? data.dailyAdvance : null, 'daily advance', { max: MAX_AMOUNT_10_2, positive: true }),
      typed: typeof data.advanceConfirmation === 'string' ? data.advanceConfirmation.trim() : '',
      reason: parseFinancialReason(data.advanceReason ?? null, 'Advance reason'),
    }
    const attendance = await prisma.$transaction((tx) =>
      logPaidContractorAttendance(tx, user, site.id, { contractorName, contractorType, labourCount, startTime }, advance),
    )
    revalidatePath('/mobile/attendance')
    revalidatePath('/sites/[id]', 'page')
    return { success: true, attendance }
  }

  const attendance = await prisma.$transaction(async (tx) => {
    // Find or create the subcontractor: only one of this company that is unbound or bound
    // to this site, never a same-named one of another site or tenant.
    let sub = await tx.subcontractor.findFirst({
      where: {
        companyId,
        name: { equals: contractorName, mode: 'insensitive' },
        OR: [{ siteId: null }, { siteId: site.id }],
      },
      select: { id: true },
    })

    if (!sub) {
      sub = await tx.subcontractor.create({
        data: {
          companyId,
          name: contractorName,
          trade: contractorType,
        },
        select: { id: true },
      })
    }

    const today = startOfToday()

    // Log the daily attendance for this contractor
    const log = await tx.contractorAttendance.create({
      data: {
        companyId,
        siteId: site.id,
        subcontractorId: sub.id,
        date: today,
        contractorType,
        labourCount,
        startTime,
        dailyAdvance: 0,
        createdById: user.id
      }
    })

    return { id: log.id }
  })

  revalidatePath('/mobile/attendance')
  revalidatePath('/sites/[id]', 'page')
  return { success: true, attendance }
}

/** The paid path of `saveContractorAttendance`, inside the caller's transaction. */
async function logPaidContractorAttendance(
  tx: Prisma.TransactionClient,
  user: TenantMutationUser,
  siteId: string,
  log: { contractorName: string; contractorType: string; labourCount: number; startTime: string | undefined },
  advance: { amount: number; typed: string; reason: string },
) {
  const companyId = user.companyId
  const bound = { companyId, siteId, isActive: true, status: 'Active' }
  // Exactly one match, so a same-named pair never lets the confirmation pick either.
  const matches = await tx.subcontractor.findMany({
    where: { ...bound, name: { equals: log.contractorName, mode: 'insensitive' } },
    select: { id: true, name: true, advance: true },
    take: 2,
  })
  if (matches.length !== 1) throw new Error(SUBCONTRACTOR_NOT_FOUND)
  const sub = matches[0]
  if (advance.typed !== sub.name.trim()) {
    throw new Error('Advance confirmation text did not match the subcontractor name.')
  }

  const current = Number(sub.advance)
  const total = rupeeSum(current, advance.amount)
  if (paise(total) > paise(MAX_AMOUNT_14_2)) throw new Error('Advance would exceed the subcontractor advance limit.')

  const today = startOfToday()
  const created = await tx.contractorAttendance.create({
    data: {
      companyId,
      siteId,
      subcontractorId: sub.id,
      date: today,
      contractorType: log.contractorType,
      labourCount: log.labourCount,
      startTime: log.startTime,
      dailyAdvance: advance.amount,
      createdById: user.id,
    },
    select: { id: true },
  })

  const result = await tx.subcontractor.updateMany({
    where: { ...bound, id: sub.id, advance: sub.advance },
    data: { advance: total },
  })
  if (result.count !== 1) throw new Error(SUBCONTRACTOR_ADVANCE_CHANGED)

  await tx.auditLog.create({
    data: auditLogData({
      userId: user.id,
      companyId,
      action: 'PAID',
      module: 'SUBCONTRACTOR',
      recordId: sub.id,
      description: `${user.name ?? user.email} paid ₹${advance.amount.toLocaleString('en-IN')} daily advance to subcontractor "${sub.name}": ${advance.reason}`,
      before: { siteId, advance: current },
      after: {
        siteId,
        advance: total,
        paidAmount: advance.amount,
        reason: advance.reason,
        contractorAttendanceId: created.id,
        date: today.toISOString(),
        labourCount: log.labourCount,
      },
    }),
  })
  return { id: created.id }
}

export async function removeLabourAttendanceAction(labourId: string, confirmationText?: string) {
  const { user, scope } = await requireAttendanceScope()
  const companyId = user.companyId

  const today = startOfToday()

  // The worker re-read, the delete and the audit record share one transaction: an audit
  // failure keeps the roster entry.
  await prisma.$transaction(async (tx) => {
    const labour = await tx.labour.findFirst({
      where: companyLabourWhere(String(labourId ?? ''), companyId, scope),
      select: { id: true, name: true, siteId: true, trade: true }
    })

    if (!labour) throw new Error(LABOUR_NOT_FOUND)
    if ((confirmationText ?? '').trim() !== labour.name.trim()) {
      throw new Error('Roster removal confirmation text did not match the worker name')
    }

    // Deleting a row that carries an advance deletes a payment record.
    const row = await tx.labourAttendance.findFirst({
      where: { labourId: labour.id, siteId: labour.siteId, date: today },
      select: { advance: true },
    })
    const advance = row ? Number(row.advance) : 0
    if (paise(advance) !== 0) requirePaymentsManage(user)

    // Delete today's attendance record on the worker's current site, never another site's,
    // and only while it still carries the advance just checked.
    await tx.labourAttendance.deleteMany({
      where: {
        labourId: labour.id,
        siteId: labour.siteId,
        date: today,
        labour: { companyId },
        advance: row ? row.advance : 0,
      }
    })

    await tx.auditLog.create({
      data: auditLogData({
        userId: user.id,
        companyId,
        action: 'DELETE',
        module: 'ATTENDANCE',
        recordId: labour.id,
        description: `${user.name ?? user.email} removed worker "${labour.name}" from today's roster`,
        before: { labourId: labour.id, name: labour.name, trade: labour.trade, siteId: labour.siteId, date: today.toISOString(), advance },
        after: { removedFromRoster: true, date: today.toISOString() },
      }),
    })
  })

  revalidatePath('/mobile/attendance')
  revalidatePath('/labour/attendance')
  return { success: true }
}

export async function removeContractorAttendanceAction(attendanceId: string, confirmationText?: string) {
  const { user, scope } = await requireAttendanceScope()
  const companyId = user.companyId

  // Find the record to reverse the advance amount if any
  const record = await prisma.contractorAttendance.findFirst({
    where: {
      id: String(attendanceId ?? ''),
      companyId,
      site: scope,
      subcontractor: { companyId },
    },
    include: { subcontractor: { select: { name: true, trade: true } } }
  })

  if (!record) throw new Error(CONTRACTOR_LOG_NOT_FOUND)

  const expected = (record.subcontractor?.name || `${record.contractorType} ${record.labourCount}`).trim()
  if ((confirmationText ?? '').trim() !== expected) {
    throw new Error('Contractor log confirmation text did not match the contractor label')
  }
  // Deleting a log that carries a daily advance reverses a payment.
  if (paise(Number(record.dailyAdvance)) !== 0) requirePaymentsManage(user)

  // The log is deleted, its advance reversed and the deletion audited together, or none.
  await prisma.$transaction(async (tx) => {
    const removed = await tx.contractorAttendance.deleteMany({
      where: { id: record.id, companyId }
    })
    if (removed.count !== 1) throw new Error(CONTRACTOR_LOG_NOT_FOUND)

    if (Number(record.dailyAdvance) > 0) {
      const result = await tx.subcontractor.updateMany({
        where: { id: record.subcontractorId, companyId },
        data: { advance: { decrement: record.dailyAdvance } },
      })
      if (result.count !== 1) throw new Error(SUBCONTRACTOR_NOT_FOUND)
    }

    await tx.auditLog.create({
      data: auditLogData({
        userId: user.id,
        companyId,
        action: 'DELETE',
        module: 'ATTENDANCE',
        recordId: record.id,
        description: `${user.name ?? user.email} deleted contractor log "${expected}" from today's roster`,
        before: {
          contractorType: record.contractorType,
          labourCount: record.labourCount,
          dailyAdvance: Number(record.dailyAdvance),
          subcontractorId: record.subcontractorId,
          subcontractorName: record.subcontractor?.name,
          date: record.date.toISOString(),
          startTime: record.startTime,
          siteId: record.siteId,
        },
        after: { deleted: true },
      }),
    })
  })

  revalidatePath('/mobile/attendance')
  revalidatePath('/sites/[id]', 'page')
  return { success: true }
}
