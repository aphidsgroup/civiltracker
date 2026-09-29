'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { LabourTrade } from '@prisma/client'
import type { Prisma } from '@prisma/client'
import { auditLogData } from '@/lib/audit-data'
import {
  optionalText,
  parseNonNegativeAmount,
  requiredText,
  requireAssignedScopeMutation,
  requireAssignedSiteMutation,
} from '@/lib/auth/site-mutation'
import type { TenantMutationUser } from '@/lib/auth/site-mutation'
import { assertNoOtherSiteAttendanceFrom } from '@/lib/labour-attendance'
import { LABOUR_NOT_FOUND, payLabourAdvance } from '@/lib/labour-payment'
import { assertPayrollPeriodOpen, payrollTransaction } from '@/lib/payroll-period-lock'
import { MAX_AMOUNT_10_2, parseAmountText } from '@/lib/validation/financial-mutations'

/**
 * A worker of exactly `companyId` whose current site is in `scope`: a live site of that
 * company, narrowed for a field role to the sites it is assigned to.
 */
function boundLabourWhere(id: string, companyId: string, scope: Prisma.SiteWhereInput) {
  return { id, companyId, site: scope }
}

function parseDailyWage(raw: FormDataEntryValue | null) {
  return parseNonNegativeAmount(requiredText(raw, 'Daily wage'), 'daily wage', 0)
}

function parseTrade(raw: FormDataEntryValue | null): LabourTrade {
  if (typeof raw !== 'string' || !(Object.values(LabourTrade) as string[]).includes(raw)) {
    throw new Error('Invalid labour trade')
  }
  return raw as LabourTrade
}

function parseActive(raw: FormDataEntryValue | null): boolean {
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw new Error('Invalid labour status')
}

function startOfTodayUtc() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** The master data a roster edit may write. The opening advance is never among it. */
type WorkerMasterData = {
  name: string
  phone: string | null
  trade: LabourTrade
  dailyWage: number
  overtimeRate: number | undefined
  isActive: boolean
}

const WORKER_EDIT_SELECT = {
  id: true, name: true, phone: true, trade: true, dailyWage: true, overtimeRate: true, isActive: true, siteId: true,
} as const

/*
 * Roster edit of a worker's master data, shared by `updateLabourAction` and
 * `updateLabourRosterAction`.
 *
 * Money policy: an edit moves no money. The opening advance is a payment balance written
 * only by `payLabourAdvance` (payroll-period lock, guarded balance write, PAID audit), so
 * an `openingAdvance` field sent to an edit is ignored and never written.
 *
 * Site policy: the edit re-reads the worker inside a serializable `payrollTransaction`
 * under the principal's scope. Moving it to another site is refused while it has
 * attendance for today or later on any site but the destination
 * (`assertNoOtherSiteAttendanceFrom`), and while today is settled by a salary run past
 * DRAFT for either the current or the destination site (`assertPayrollPeriodOpen`); a
 * run's transition reads the workers of its site, so a move racing it is aborted and
 * retried. The write is guarded on the scope and the site read, must hit exactly one row,
 * and its audit record — before/after, including both sites on a move — is written on the
 * same transaction, so an edit without its audit trail rolls back.
 */
async function updateWorkerMasterData(
  user: TenantMutationUser,
  scope: Prisma.SiteWhereInput,
  targetSiteId: string,
  id: string,
  data: WorkerMasterData,
) {
  const companyId = user.companyId

  await payrollTransaction(prisma, async (tx) => {
    const worker = await tx.labour.findFirst({ where: boundLabourWhere(id, companyId, scope), select: WORKER_EDIT_SELECT })
    if (!worker) throw new Error(LABOUR_NOT_FOUND)

    const moved = worker.siteId !== targetSiteId
    if (moved) {
      const today = startOfTodayUtc()
      await assertNoOtherSiteAttendanceFrom(tx, worker.id, targetSiteId, today)
      await assertPayrollPeriodOpen(tx, companyId, today, [
        { labourId: worker.id, siteId: worker.siteId },
        { labourId: worker.id, siteId: targetSiteId },
      ])
    }

    const result = await tx.labour.updateMany({
      where: { ...boundLabourWhere(worker.id, companyId, scope), siteId: worker.siteId },
      data: { ...data, siteId: targetSiteId },
    })
    if (result.count !== 1) throw new Error(LABOUR_NOT_FOUND)

    const before = {
      siteId: worker.siteId,
      name: worker.name,
      phone: worker.phone,
      trade: worker.trade,
      dailyWage: Number(worker.dailyWage),
      overtimeRate: worker.overtimeRate === null ? null : Number(worker.overtimeRate),
      isActive: worker.isActive,
    }
    const after = {
      ...before,
      ...data,
      overtimeRate: data.overtimeRate ?? before.overtimeRate,
      siteId: targetSiteId,
    }
    await tx.auditLog.create({
      data: auditLogData({
        userId: user.id,
        companyId,
        action: 'UPDATE',
        module: 'LABOUR',
        recordId: worker.id,
        description: moved
          ? `${user.name ?? user.email} edited worker "${data.name}" and moved them to another site`
          : `${user.name ?? user.email} edited worker "${data.name}"`,
        before,
        after,
      }),
    })
  })
}

/*
 * Edits a worker's master data. Live `labour.manage` + LABOUR is checked before any read,
 * the target site must be a live site of exactly the live company in the principal's
 * assigned scope, and the write is scoped to a worker of that company whose current site
 * is in the same scope, so a field role can move a worker neither onto nor off a site it
 * is not assigned to. See `updateWorkerMasterData` for the money and move policy.
 */
export async function updateLabourAction(formData: FormData) {
  const { user, site, scope } = await requireAssignedSiteMutation(String(formData.get('siteId') ?? ''), 'labour.manage', 'LABOUR')

  const id = requiredText(formData.get('id'), 'Labour')
  const name = requiredText(formData.get('name'), 'Name')
  const phone = typeof formData.get('phone') === 'string' ? (formData.get('phone') as string).trim() : ''
  const trade = parseTrade(formData.get('trade'))
  const dailyWage = parseDailyWage(formData.get('dailyWage'))
  const overtimeRate = parseNonNegativeAmount(formData.get('overtimeRate'), 'overtime rate', null) ?? undefined
  const isActive = parseActive(formData.get('isActive'))

  await updateWorkerMasterData(user, scope, site.id, id, { name, phone: phone || null, trade, dailyWage, overtimeRate, isActive })

  revalidatePath('/labour')
  redirect('/labour')
}

/*
 * Registers a worker. Live `labour.manage` + LABOUR is checked before any read, and the
 * site must be a live site of exactly the live company in the principal's assigned scope.
 */
export async function createLabourAction(formData: FormData) {
  const { user, site } = await requireAssignedSiteMutation(String(formData.get('siteId') ?? ''), 'labour.manage', 'LABOUR')

  const name = requiredText(formData.get('name'), 'Name')
  const trade = parseTrade(formData.get('trade'))
  const dailyWage = parseDailyWage(formData.get('dailyWage'))
  const overtimeRate = parseNonNegativeAmount(formData.get('overtimeRate'), 'overtime rate', null) ?? undefined

  await prisma.labour.create({
    data: {
      companyId: user.companyId,
      siteId: site.id,
      name,
      phone: optionalText(formData.get('phone')) ?? undefined,
      trade,
      dailyWage,
      overtimeRate,
      isActive: true,
    },
  })

  revalidatePath('/labour')
  redirect('/labour')
}

/*
 * The `/labour` roster card edit: `updateLabourAction` with the card's `status` field
 * (`active` / `inactive`), staying on the list.
 */
export async function updateLabourRosterAction(formData: FormData) {
  const { user, site, scope } = await requireAssignedSiteMutation(String(formData.get('siteId') ?? ''), 'labour.manage', 'LABOUR')

  const id = requiredText(formData.get('id'), 'Labour')
  const name = requiredText(formData.get('name'), 'Name')
  const trade = parseTrade(formData.get('trade'))
  const dailyWage = parseDailyWage(formData.get('dailyWage'))
  const overtimeRate = parseNonNegativeAmount(formData.get('overtimeRate'), 'overtime rate', null) ?? undefined
  const status = formData.get('status')
  if (status !== 'active' && status !== 'inactive') throw new Error('Invalid labour status')

  await updateWorkerMasterData(user, scope, site.id, id, {
    name,
    phone: optionalText(formData.get('phone')),
    trade,
    dailyWage,
    overtimeRate,
    isActive: status === 'active',
  })

  revalidatePath('/labour')
}

/*
 * Pays a worker out as an advance (see `payLabourAdvance`). The amount is strict positive
 * decimal text within the `Decimal(10, 2)` column; the worker must be an active worker of
 * the live company whose current site is in the principal's assigned scope. The advance is
 * booked only on attendance of that current site, and the guarded write and its audit
 * record share one transaction.
 */
export async function markLabourPaidAction(formData: FormData) {
  const { user, scope } = await requireAssignedScopeMutation('labour.manage', 'LABOUR')
  const id = requiredText(formData.get('id'), 'Labour')
  const amount = parseAmountText(formData.get('amount'), 'payment amount', { max: MAX_AMOUNT_10_2, positive: true })

  await payrollTransaction(prisma, (tx) => payLabourAdvance(tx, user, { ...boundLabourWhere(id, user.companyId, scope), isActive: true }, amount))

  revalidatePath('/labour')
}

/*
 * Deactivates a worker of the principal's assigned scope once their name is typed back;
 * audited as the live principal. The re-read, guarded write and audit record share one
 * transaction, so a deactivation without its audit trail rolls back.
 */
export async function deactivateLabourAction(formData: FormData) {
  const { user, scope } = await requireAssignedScopeMutation('labour.manage', 'LABOUR')
  const companyId = user.companyId
  const id = requiredText(formData.get('id'), 'Labour')
  const typed = optionalText(formData.get('dangerConfirmText')) ?? ''

  await prisma.$transaction(async (tx) => {
    const worker = await tx.labour.findFirst({
      where: boundLabourWhere(id, companyId, scope),
      select: { id: true, name: true, trade: true, siteId: true, isActive: true },
    })
    if (!worker) throw new Error(LABOUR_NOT_FOUND)
    if (typed !== worker.name.trim()) {
      throw new Error('Remove confirmation text did not match the worker name.')
    }

    const result = await tx.labour.updateMany({ where: boundLabourWhere(worker.id, companyId, scope), data: { isActive: false } })
    if (result.count !== 1) throw new Error(LABOUR_NOT_FOUND)

    await tx.auditLog.create({
      data: auditLogData({
        userId: user.id,
        companyId,
        action: 'UPDATE',
        module: 'LABOUR',
        recordId: worker.id,
        description: `${user.name ?? user.email} deactivated worker "${worker.name}"`,
        before: { isActive: worker.isActive, trade: worker.trade, siteId: worker.siteId, name: worker.name },
        after: { isActive: false, trade: worker.trade, siteId: worker.siteId, name: worker.name },
      }),
    })
  })

  revalidatePath('/labour')
}
