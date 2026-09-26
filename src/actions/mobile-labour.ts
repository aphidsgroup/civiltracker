'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/audit'
import { AttendanceStatus, LabourTrade } from '@prisma/client'
import type { Prisma } from '@prisma/client'
import { requireAssignedScopeMutation, requireAssignedSiteMutation } from '@/lib/auth/site-mutation'

/*
 * Muster-roll actions. Marking the roll (attendance, roster, contractor headcount) needs
 * live `attendance.mark` + LABOUR; editing an existing worker's master data (wage, site)
 * needs live `labour.manage` + LABOUR. Both are checked before any read. Every site is a
 * live site of exactly the live company that the principal may act on (`assignedSiteScope`:
 * SITE_ENGINEER and SUPERVISOR only their assigned sites), and every worker and
 * contractor log must sit on such a site too, so a field role can neither write on nor
 * pull a worker off a site it is not assigned to. Multi-step money and attendance changes
 * run in one transaction with counted, company-scoped writes.
 */

const LABOUR_NOT_FOUND = 'FORBIDDEN: Labour not found or access denied'
const SUBCONTRACTOR_NOT_FOUND = 'FORBIDDEN: Subcontractor not found or access denied'
const CONTRACTOR_LOG_NOT_FOUND = 'FORBIDDEN: Contractor attendance not found or access denied'
const DEFAULT_DAILY_WAGE = 650

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
function parseAmount(raw: unknown, field: string, fallback: number): number
function parseAmount(raw: unknown, field: string, fallback: undefined): number | undefined
function parseAmount(raw: unknown, field: string, fallback: number | undefined) {
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
  advance?: number
}) {
  const { user, site, scope } = await requireAssignedSiteMutation(String(formData?.siteId ?? ''), 'labour.manage', 'LABOUR')
  const companyId = user.companyId
  const id = requiredName(formData.id, 'Labour')
  const name = requiredName(formData.name, 'Name')
  const { trade, customTag } = parseTrade(formData.trade, formData.customTrade)
  const dailyWage = parseAmount(formData.dailyWage, 'daily wage', 0) || DEFAULT_DAILY_WAGE
  const advance = parseAmount(formData.advance, 'advance', undefined)

  const worker = await prisma.$transaction(async (tx) => {
    const existing = await tx.labour.findFirst({
      where: companyLabourWhere(id, companyId, scope),
      select: { id: true, phone: true },
    })
    if (!existing) throw new Error(LABOUR_NOT_FOUND)

    // A standard trade clears a previous custom-trade tag but keeps a real phone number.
    const phone = customTag ?? (existing.phone?.startsWith('CUSTOM_TRADE:') ? null : existing.phone ?? null)

    const updated = await tx.labour.updateMany({
      where: companyLabourWhere(existing.id, companyId, scope),
      data: { name, trade, phone, dailyWage, siteId: site.id },
    })
    if (updated.count !== 1) throw new Error(LABOUR_NOT_FOUND)

    // Upsert today's attendance record with the advance payment
    if (advance !== undefined) {
      const today = startOfToday()
      await tx.labourAttendance.upsert({
        where: { labourId_date: { labourId: existing.id, date: today } },
        create: {
          labourId: existing.id,
          siteId: site.id,
          date: today,
          status: 'PRESENT',
          advance,
          markedById: user.id
        },
        update: {
          advance,
          markedById: user.id
        }
      })
    }

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

  const marked = records
    .filter((item) => item?.status)
    .map((item) => ({
      labourId: requiredName(item.labourId, 'Labour'),
      siteId: requiredName(item.siteId, 'Site'),
      status: parseStatus(item.status),
      advance: parseAmount(item.advance, 'advance', undefined),
      startTime: parseStartTime(item.startTime),
    }))

  // Every worker must be of this company on a site in the principal's scope, and each row
  // must name the worker's own site; one bad row refuses the whole batch.
  const labourIds = [...new Set(marked.map((item) => item.labourId))]
  const workers = labourIds.length > 0
    ? await prisma.labour.findMany({
        where: { id: { in: labourIds }, companyId, site: scope },
        select: { id: true, siteId: true },
      })
    : []
  const siteOf = new Map(workers.map((worker) => [worker.id, worker.siteId]))
  for (const item of marked) {
    if (siteOf.get(item.labourId) !== item.siteId) throw new Error(LABOUR_NOT_FOUND)
  }

  await prisma.$transaction(async (tx) => {
    for (const item of marked) {
      await tx.labourAttendance.upsert({
        where: {
          labourId_date: {
            labourId: item.labourId,
            date: targetDate
          }
        },
        create: {
          labourId: item.labourId,
          siteId: item.siteId,
          date: targetDate,
          status: item.status,
          advance: item.advance ?? 0,
          startTime: item.startTime,
          markedById: user.id
        },
        update: {
          status: item.status,
          advance: item.advance,
          startTime: item.startTime,
          markedById: user.id
        }
      })
    }
  })
  const count = marked.length

  // Recalculate budget for all affected sites (if they gave advances)
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
      select: { id: true },
    })
    if (!labour) throw new Error(LABOUR_NOT_FOUND)

    // Mark them present for today to add them to the roster
    const attendance = await tx.labourAttendance.upsert({
      where: {
        labourId_date: {
          labourId: labour.id,
          date: today
        }
      },
      create: {
        labourId: labour.id,
        siteId: site.id,
        date: today,
        status: 'PRESENT',
        advance: 0,
        startTime: start,
        markedById: user.id
      },
      update: {
        status: 'PRESENT',
        startTime: start
      }
    })

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

export async function saveContractorAttendance(data: {
  siteId: string
  contractorName: string
  contractorType: string
  labourCount: number
  dailyAdvance: number
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
  const dailyAdvance = parseAmount(data.dailyAdvance, 'daily advance', 0)
  const startTime = parseStartTime(data.startTime)

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
        dailyAdvance,
        createdById: user.id
      }
    })

    // Update total advance on the subcontractor record
    if (dailyAdvance > 0) {
      const result = await tx.subcontractor.updateMany({
        where: { id: sub.id, companyId },
        data: { advance: { increment: dailyAdvance } },
      })
      if (result.count !== 1) throw new Error(SUBCONTRACTOR_NOT_FOUND)
    }

    return { id: log.id }
  })

  revalidatePath('/mobile/attendance')
  revalidatePath('/sites/[id]', 'page')
  return { success: true, attendance }
}

export async function removeLabourAttendanceAction(labourId: string, confirmationText?: string) {
  const { user, scope } = await requireAttendanceScope()
  const companyId = user.companyId

  const today = startOfToday()

  const labour = await prisma.labour.findFirst({
    where: companyLabourWhere(String(labourId ?? ''), companyId, scope),
    select: { id: true, name: true, siteId: true, trade: true }
  })

  if (!labour) throw new Error(LABOUR_NOT_FOUND)
  if ((confirmationText ?? '').trim() !== labour.name.trim()) {
    throw new Error('Roster removal confirmation text did not match the worker name')
  }

  // Delete today's attendance record
  await prisma.labourAttendance.deleteMany({
    where: {
      labourId: labour.id,
      date: today,
      labour: { companyId },
    }
  })

  await logActivity({
    userId: user.id,
    companyId,
    action: 'DELETE',
    module: 'ATTENDANCE',
    recordId: labour.id,
    description: `${user.name ?? user.email} removed worker "${labour.name}" from today's roster`,
    before: { labourId: labour.id, name: labour.name, trade: labour.trade, siteId: labour.siteId, date: today.toISOString() },
    after: { removedFromRoster: true, date: today.toISOString() },
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

  // The log is deleted and its advance reversed together, or neither.
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
  })

  await logActivity({
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
  })

  revalidatePath('/mobile/attendance')
  revalidatePath('/sites/[id]', 'page')
  return { success: true }
}
