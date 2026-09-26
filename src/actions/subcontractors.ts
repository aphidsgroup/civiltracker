'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { logActivity } from '@/lib/audit'
import {
  bindOptionalSite,
  optionalText,
  parseNonNegativeAmount,
  parsePositiveAmount,
  requiredText,
  requireTenantMutation,
} from '@/lib/auth/site-mutation'

const SUBCONTRACTOR_NOT_FOUND = 'FORBIDDEN: Subcontractor not found or access denied'
const STATUSES = ['Active', 'Inactive', 'Completed']

/** A subcontractor of exactly `companyId` that is company-wide or on a live site. */
function boundSubcontractorWhere(id: string, companyId: string) {
  return { id, companyId, OR: [{ siteId: null }, { site: { companyId, deletedAt: null } }] }
}

/** An amount the form may omit: absent leaves the stored value unchanged. */
function optionalAmount(formData: FormData, key: string, field: string): number | undefined {
  return formData.has(key) ? parseNonNegativeAmount(formData.get(key), field, 0) : undefined
}

/*
 * Adds a subcontractor. Live `materials.update` + MATERIALS is checked before any read;
 * a chosen site must be a live site of exactly the live company, blank stays company-wide.
 */
export async function createSubcontractorAction(formData: FormData) {
  const user = await requireTenantMutation('materials.update', 'MATERIALS')
  const name = requiredText(formData.get('name'), 'Subcontractor name')
  const workOrderValue = parseNonNegativeAmount(formData.get('workOrderValue'), 'work order value', 0)
  const siteId = await bindOptionalSite(formData.get('siteId'), user.companyId)

  await prisma.subcontractor.create({
    data: {
      companyId: user.companyId,
      siteId,
      name,
      phone: optionalText(formData.get('phone')),
      trade: optionalText(formData.get('trade')),
      gst: optionalText(formData.get('gst')),
      workOrderValue,
      status: 'Active',
    },
  })

  redirect('/subcontractors')
}

/* Edits a subcontractor; bound to the live company before the write. */
export async function updateSubcontractorAction(formData: FormData) {
  const user = await requireTenantMutation('materials.update', 'MATERIALS')
  const companyId = user.companyId

  const id = requiredText(formData.get('id'), 'Subcontractor')
  const name = requiredText(formData.get('name'), 'Subcontractor name')
  const status = typeof formData.get('status') === 'string' ? (formData.get('status') as string).trim() : ''
  if (!STATUSES.includes(status)) throw new Error('Invalid subcontractor status')
  const workOrderValue = optionalAmount(formData, 'workOrderValue', 'work order value')
  const raBilled = optionalAmount(formData, 'raBilled', 'RA billed')
  const advance = optionalAmount(formData, 'advance', 'advance')
  const retention = optionalAmount(formData, 'retention', 'retention')

  const sub = await prisma.subcontractor.findFirst({ where: boundSubcontractorWhere(id, companyId), select: { id: true } })
  if (!sub) throw new Error(SUBCONTRACTOR_NOT_FOUND)

  await prisma.subcontractor.updateMany({
    where: { id: sub.id, companyId },
    data: {
      name,
      phone: optionalText(formData.get('phone')),
      trade: optionalText(formData.get('trade')),
      gst: optionalText(formData.get('gst')),
      workOrderValue,
      raBilled,
      advance,
      retention,
      status,
    },
  })
  revalidatePath('/subcontractors')
}

/* Records a payment as an advance increment. Needs live `payments.manage`. */
export async function markSubcontractorPaidAction(formData: FormData) {
  const user = await requireTenantMutation('payments.manage', 'MATERIALS')
  const companyId = user.companyId
  const id = requiredText(formData.get('id'), 'Subcontractor')
  const amount = parsePositiveAmount(formData.get('amount'))

  const sub = await prisma.subcontractor.findFirst({ where: boundSubcontractorWhere(id, companyId), select: { id: true } })
  if (!sub) throw new Error(SUBCONTRACTOR_NOT_FOUND)

  await prisma.subcontractor.updateMany({
    where: { id: sub.id, companyId },
    data: { advance: { increment: amount } },
  })
  revalidatePath('/subcontractors')
}

/* Deactivates a subcontractor once its name is typed back; audited as the live principal. */
export async function deactivateSubcontractorAction(formData: FormData) {
  const user = await requireTenantMutation('materials.update', 'MATERIALS')
  const companyId = user.companyId
  const id = requiredText(formData.get('id'), 'Subcontractor')
  const typed = typeof formData.get('dangerConfirmText') === 'string' ? (formData.get('dangerConfirmText') as string).trim() : ''

  const sub = await prisma.subcontractor.findFirst({
    where: boundSubcontractorWhere(id, companyId),
    select: { id: true, name: true, trade: true, status: true, isActive: true, raBilled: true, advance: true, retention: true },
  })
  if (!sub) throw new Error(SUBCONTRACTOR_NOT_FOUND)
  if (typed !== sub.name.trim()) {
    throw new Error('Remove confirmation text did not match the subcontractor name.')
  }

  await prisma.subcontractor.updateMany({ where: { id: sub.id, companyId }, data: { isActive: false } })

  const snapshot = { trade: sub.trade, status: sub.status, raBilled: Number(sub.raBilled), advance: Number(sub.advance), retention: Number(sub.retention), name: sub.name }
  await logActivity({
    userId: user.id,
    companyId,
    action: 'UPDATE',
    module: 'SUBCONTRACTOR',
    recordId: sub.id,
    description: `${user.name ?? user.email} deactivated subcontractor "${sub.name}"`,
    before: { isActive: sub.isActive, ...snapshot },
    after: { isActive: false, ...snapshot },
  })

  revalidatePath('/subcontractors')
}
