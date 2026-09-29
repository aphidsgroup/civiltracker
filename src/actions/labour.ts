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
import { LABOUR_NOT_FOUND, payLabourAdvance } from '@/lib/labour-payment'
import { payrollTransaction } from '@/lib/payroll-period-lock'
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

/*
 * Edits a worker's master data. Live `labour.manage` + LABOUR is checked before any read,
 * the target site must be a live site of exactly the live company in the principal's
 * assigned scope, and the write is scoped to a worker of that company whose current site
 * is in the same scope, so a field role can move a worker neither onto nor off a site it
 * is not assigned to.
 */
export async function updateLabourAction(formData: FormData) {
  const { user, site, scope } = await requireAssignedSiteMutation(String(formData.get('siteId') ?? ''), 'labour.manage', 'LABOUR')
  const companyId = user.companyId

  const id = requiredText(formData.get('id'), 'Labour')
  const name = requiredText(formData.get('name'), 'Name')
  const phone = typeof formData.get('phone') === 'string' ? (formData.get('phone') as string).trim() : ''
  const trade = parseTrade(formData.get('trade'))
  const dailyWage = parseDailyWage(formData.get('dailyWage'))
  const overtimeRate = parseNonNegativeAmount(formData.get('overtimeRate'), 'overtime rate', null) ?? undefined
  const openingAdvance = parseNonNegativeAmount(formData.get('openingAdvance'), 'opening advance', 0)
  const isActive = parseActive(formData.get('isActive'))

  // Resolve the worker's current site under the same scope before any write; the update
  // repeats the binding so a worker moved off an assigned site in between is not written.
  const worker = await prisma.labour.findFirst({ where: boundLabourWhere(id, companyId, scope), select: { id: true } })
  if (!worker) throw new Error(LABOUR_NOT_FOUND)

  const result = await prisma.labour.updateMany({
    where: boundLabourWhere(worker.id, companyId, scope),
    data: {
      siteId: site.id,
      name,
      phone: phone || null,
      trade,
      dailyWage,
      overtimeRate,
      openingAdvance,
      isActive,
    },
  })
  if (result.count !== 1) throw new Error(LABOUR_NOT_FOUND)

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
  const companyId = user.companyId

  const id = requiredText(formData.get('id'), 'Labour')
  const name = requiredText(formData.get('name'), 'Name')
  const trade = parseTrade(formData.get('trade'))
  const dailyWage = parseDailyWage(formData.get('dailyWage'))
  const overtimeRate = parseNonNegativeAmount(formData.get('overtimeRate'), 'overtime rate', null) ?? undefined
  const openingAdvance = parseNonNegativeAmount(formData.get('openingAdvance'), 'opening advance', 0)
  const status = formData.get('status')
  if (status !== 'active' && status !== 'inactive') throw new Error('Invalid labour status')

  const worker = await prisma.labour.findFirst({ where: boundLabourWhere(id, companyId, scope), select: { id: true } })
  if (!worker) throw new Error(LABOUR_NOT_FOUND)

  await prisma.labour.updateMany({
    where: { id: worker.id, companyId },
    data: {
      siteId: site.id,
      name,
      phone: optionalText(formData.get('phone')),
      trade,
      dailyWage,
      overtimeRate,
      openingAdvance,
      isActive: status === 'active',
    },
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
