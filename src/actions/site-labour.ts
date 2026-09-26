'use server'

import { LabourTrade } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import {
  optionalText,
  parseNonNegativeAmount,
  parsePositiveAmount,
  requiredText,
  requireAssignedSiteMutation,
  requireSiteMutation,
} from '@/lib/auth/site-mutation'

/*
 * Site labour page actions. Each is bound to the page's site id, which arrives from the
 * client and is re-authorized here: live `labour.manage` + LABOUR, then a live site of
 * exactly the live company, then a worker of that company assigned to that site.
 */

const LABOUR_NOT_FOUND = 'FORBIDDEN: Labour not found or access denied'

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

export async function markSiteLabourPaid(siteId: string, formData: FormData) {
  const { user, site } = await requireLabourMutation(siteId)
  const id = formData.get('id') as string
  const amount = parsePositiveAmount(formData.get('amount'))

  // The worker is re-read, the latest attendance picked and the advance incremented in
  // one transaction; the increment is applied by the database, never a read-modify-write.
  await prisma.$transaction(async (tx) => {
    const labour = await tx.labour.findFirst({
      where: siteLabourWhere(id, user.companyId, site.id),
      select: { id: true },
    })
    if (!labour) throw new Error(LABOUR_NOT_FOUND)

    const latest = await tx.labourAttendance.findFirst({
      where: { labourId: labour.id },
      orderBy: { date: 'desc' },
      select: { id: true },
    })
    const result = latest
      ? await tx.labourAttendance.updateMany({
          where: { id: latest.id, labourId: labour.id },
          data: { advance: { increment: amount } },
        })
      : await tx.labour.updateMany({
          where: { id: labour.id, companyId: user.companyId, siteId: site.id },
          data: { openingAdvance: { increment: amount } },
        })
    if (result.count !== 1) throw new Error(LABOUR_NOT_FOUND)
  })
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
