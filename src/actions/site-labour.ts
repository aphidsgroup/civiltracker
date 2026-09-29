'use server'

import { LabourTrade } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import {
  optionalText,
  parseNonNegativeAmount,
  requiredText,
  requireAssignedSiteMutation,
  requireSiteMutation,
} from '@/lib/auth/site-mutation'
import { LABOUR_NOT_FOUND, payLabourAdvance } from '@/lib/labour-payment'
import { payrollTransaction } from '@/lib/payroll-period-lock'
import { MAX_AMOUNT_10_2, parseAmountText } from '@/lib/validation/financial-mutations'

/*
 * Site labour page actions. Each is bound to the page's site id, which arrives from the
 * client and is re-authorized here: live `labour.manage` + LABOUR, then a live site of
 * exactly the live company, then a worker of that company assigned to that site.
 */

function requireLabourMutation(siteId: string) {
  return requireSiteMutation(siteId, 'labour.manage', 'LABOUR')
}

function siteLabourWhere(id: string, companyId: string, siteId: string) {
  return { id, companyId, siteId, site: { deletedAt: null } }
}

/**
 * Resolves the worker on the bound site before any write, so a foreign, missing or
 * wrong-site id is refused without issuing a mutation. The write that follows repeats
 * the same where and requires exactly one row, covering a worker moved or removed in
 * between.
 */
async function requireSiteLabour(id: string, companyId: string, siteId: string) {
  const labour = await prisma.labour.findFirst({ where: siteLabourWhere(id, companyId, siteId), select: { id: true } })
  if (!labour) throw new Error(LABOUR_NOT_FOUND)
}

function parseTrade(raw: FormDataEntryValue | null): LabourTrade {
  if (typeof raw !== 'string' || !(Object.values(LabourTrade) as string[]).includes(raw)) {
    throw new Error('Invalid labour trade')
  }
  return raw as LabourTrade
}

function parseActive(raw: FormDataEntryValue | null): boolean {
  if (raw === 'active') return true
  if (raw === 'inactive') return false
  throw new Error('Invalid labour status')
}

export async function updateSiteLabour(siteId: string, formData: FormData) {
  const { user, site } = await requireLabourMutation(siteId)
  const id = formData.get('id') as string
  const name = requiredText(formData.get('name'), 'Name')
  const phone = formData.get('phone') as string
  const trade = parseTrade(formData.get('trade'))
  const dailyWage = parseNonNegativeAmount(formData.get('dailyWage'), 'daily wage', 0)
  const overtimeRate = parseNonNegativeAmount(formData.get('overtimeRate'), 'overtime rate', 0)
  const openingAdvance = parseNonNegativeAmount(formData.get('openingAdvance'), 'opening advance', 0)
  const isActive = parseActive(formData.get('status'))

  await requireSiteLabour(id, user.companyId, site.id)
  const result = await prisma.labour.updateMany({
    where: siteLabourWhere(id, user.companyId, site.id),
    data: { name, phone: phone || null, trade, dailyWage, overtimeRate, openingAdvance, isActive }
  })
  if (result.count !== 1) throw new Error(LABOUR_NOT_FOUND)
  revalidatePath(`/sites/${site.id}/labour`)
}

/**
 * Pays a worker an advance (see `payLabourAdvance`). The URL site is bound through the
 * assigned-site mutation gate, the amount is strict positive decimal text within the
 * `Decimal(10, 2)` column, and the worker must be active and currently on this site; the
 * advance is booked only on attendance of this site, audited in the same transaction.
 */
export async function markSiteLabourPaid(siteId: string, formData: FormData) {
  const { user, site } = await requireAssignedSiteMutation(siteId, 'labour.manage', 'LABOUR')
  const id = requiredText(formData.get('id'), 'Labour')
  const amount = parseAmountText(formData.get('amount'), 'payment amount', { max: MAX_AMOUNT_10_2, positive: true })

  await payrollTransaction(prisma, (tx) => payLabourAdvance(tx, user, { ...siteLabourWhere(id, user.companyId, site.id), isActive: true }, amount))

  revalidatePath(`/sites/${site.id}/labour`)
}

/**
 * Deactivation is confirmed on the server: the site is bound through the assigned-site
 * mutation gate, the worker is re-read inside the transaction and the typed text must
 * equal its current name. The guarded write and the audit record share the transaction,
 * so a deactivation without its audit trail rolls back.
 */
export async function deactivateSiteLabour(siteId: string, formData: FormData) {
  const { user, site } = await requireAssignedSiteMutation(siteId, 'labour.manage', 'LABOUR')
  const id = formData.get('id') as string
  const typed = optionalText(formData.get('dangerConfirmText')) ?? ''
  const where = siteLabourWhere(id, user.companyId, site.id)

  await prisma.$transaction(async (tx) => {
    const labour = await tx.labour.findFirst({
      where,
      select: { id: true, name: true, trade: true, isActive: true, siteId: true },
    })
    if (!labour) throw new Error(LABOUR_NOT_FOUND)
    if (typed !== labour.name.trim()) {
      throw new Error('Remove confirmation text did not match the worker name.')
    }

    const result = await tx.labour.updateMany({ where, data: { isActive: false } })
    if (result.count !== 1) throw new Error(LABOUR_NOT_FOUND)

    const snapshot = { name: labour.name, trade: labour.trade, siteId: labour.siteId, siteName: site.name }
    await tx.auditLog.create({
      data: {
        userId: user.id,
        companyId: user.companyId,
        action: 'UPDATE',
        module: 'LABOUR',
        recordId: labour.id,
        before: { ...snapshot, isActive: labour.isActive },
        after: {
          ...snapshot,
          isActive: false,
          _description: `${user.name ?? user.email} deactivated worker "${labour.name}" on site "${site.name}"`,
        },
      },
    })
  })

  revalidatePath(`/sites/${site.id}/labour`)
}
