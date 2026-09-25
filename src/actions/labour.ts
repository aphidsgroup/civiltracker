'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { LabourTrade } from '@prisma/client'
import { parseNonNegativeAmount, requiredText, requireSiteMutation } from '@/lib/auth/site-mutation'

const LABOUR_NOT_FOUND = 'FORBIDDEN: Labour not found or access denied'

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
 * the target site must be a live site of exactly the live company, and the write is
 * scoped to a worker of that company whose current site is live too.
 */
export async function updateLabourAction(formData: FormData) {
  const { user, site } = await requireSiteMutation(String(formData.get('siteId') ?? ''), 'labour.manage', 'LABOUR')
  const companyId = user.companyId

  const id = requiredText(formData.get('id'), 'Labour')
  const name = requiredText(formData.get('name'), 'Name')
  const phone = typeof formData.get('phone') === 'string' ? (formData.get('phone') as string).trim() : ''
  const trade = parseTrade(formData.get('trade'))
  const dailyWage = parseNonNegativeAmount(requiredText(formData.get('dailyWage'), 'Daily wage'), 'daily wage', 0)
  const overtimeRate = parseNonNegativeAmount(formData.get('overtimeRate'), 'overtime rate', null) ?? undefined
  const openingAdvance = parseNonNegativeAmount(formData.get('openingAdvance'), 'opening advance', 0)
  const isActive = parseActive(formData.get('isActive'))

  const result = await prisma.labour.updateMany({
    where: { id, companyId, site: { companyId, deletedAt: null } },
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
