'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { logActivity } from '@/lib/audit'
import {
  parseNonNegativeAmount,
  parsePositiveAmount,
  requiredText,
  requireSiteMutation,
} from '@/lib/auth/site-mutation'

/*
 * Site subcontractor page actions. Each is bound to the page's site id, which arrives
 * from the client and is re-authorized here: the live permission + MATERIALS, then a
 * live site of exactly the live company, then a subcontractor of that company that is
 * unassigned or assigned to that site. Edits need `materials.update`; recording a
 * payment needs `payments.manage`.
 */

const SUB_NOT_FOUND = 'FORBIDDEN: Subcontractor not found or access denied'
const SUB_STATUSES = ['Active', 'Inactive', 'Completed']

function siteSubcontractorWhere(id: string, companyId: string, siteId: string) {
  return { id, companyId, OR: [{ siteId: null }, { siteId }] }
}

/**
 * Resolves the subcontractor within the site binding before any write, so a foreign,
 * missing or other-site id is refused without issuing a mutation. Only the id is read;
 * the write that follows repeats the same where and requires exactly one row.
 */
async function requireSiteSubcontractor(id: string, companyId: string, siteId: string) {
  const sub = await prisma.subcontractor.findFirst({ where: siteSubcontractorWhere(id, companyId, siteId), select: { id: true } })
  if (!sub) throw new Error(SUB_NOT_FOUND)
}

export async function updateSiteSubcontractor(siteId: string, formData: FormData) {
  const { user, site } = await requireSiteMutation(siteId, 'materials.update', 'MATERIALS')
  const id = formData.get('id') as string
  const status = (formData.get('status') as string) || 'Active'
  if (!SUB_STATUSES.includes(status)) throw new Error('Invalid subcontractor status')

  const data = {
    name: requiredText(formData.get('name'), 'Name'),
    phone: (formData.get('phone') as string) || null,
    trade: (formData.get('trade') as string) || null,
    gst: (formData.get('gst') as string) || null,
    workOrderValue: parseNonNegativeAmount(formData.get('workOrderValue'), 'work order value', 0),
    raBilled: parseNonNegativeAmount(formData.get('raBilled'), 'RA billed', 0),
    advance: parseNonNegativeAmount(formData.get('advance'), 'advance', 0),
    retention: parseNonNegativeAmount(formData.get('retention'), 'retention', 0),
    status,
  }

  await requireSiteSubcontractor(id, user.companyId, site.id)
  const result = await prisma.subcontractor.updateMany({
    where: siteSubcontractorWhere(id, user.companyId, site.id),
    data,
  })
  if (result.count !== 1) throw new Error(SUB_NOT_FOUND)
  revalidatePath(`/sites/${site.id}/subcontractors`)
}

export async function markSiteSubcontractorPaid(siteId: string, formData: FormData) {
  const { user, site } = await requireSiteMutation(siteId, 'payments.manage', 'MATERIALS')
  const id = formData.get('id') as string
  const amount = parsePositiveAmount(formData.get('amount'))

  // One guarded statement: the database applies the increment, so concurrent payments
  // cannot overwrite each other. The advance itself is never read.
  await requireSiteSubcontractor(id, user.companyId, site.id)
  const result = await prisma.subcontractor.updateMany({
    where: siteSubcontractorWhere(id, user.companyId, site.id),
    data: { advance: { increment: amount } },
  })
  if (result.count !== 1) throw new Error(SUB_NOT_FOUND)
  revalidatePath(`/sites/${site.id}/subcontractors`)
}

export async function deactivateSiteSubcontractor(siteId: string, formData: FormData) {
  const { user, site } = await requireSiteMutation(siteId, 'materials.update', 'MATERIALS')
  const id = formData.get('id') as string
  const typed = (formData.get('dangerConfirmText') as string | null)?.trim()

  const where = siteSubcontractorWhere(id, user.companyId, site.id)
  const sub = await prisma.subcontractor.findFirst({
    where,
    select: { id: true, name: true, trade: true, status: true, isActive: true, raBilled: true, advance: true, retention: true },
  })
  if (!sub) throw new Error(SUB_NOT_FOUND)
  if (typed !== sub.name.trim()) {
    throw new Error('Remove confirmation text did not match the subcontractor name.')
  }

  const result = await prisma.subcontractor.updateMany({ where, data: { isActive: false } })
  if (result.count !== 1) throw new Error(SUB_NOT_FOUND)

  await logActivity({
    userId: user.id,
    companyId: user.companyId,
    action: 'UPDATE',
    module: 'SUBCONTRACTOR',
    recordId: sub.id,
    description: `${user.name ?? user.email} deactivated subcontractor "${sub.name}"`,
    before: { isActive: sub.isActive, trade: sub.trade, status: sub.status, raBilled: Number(sub.raBilled), advance: Number(sub.advance), retention: Number(sub.retention), name: sub.name },
    after: { isActive: false, trade: sub.trade, status: sub.status, raBilled: Number(sub.raBilled), advance: Number(sub.advance), retention: Number(sub.retention), name: sub.name },
  })

  revalidatePath(`/sites/${site.id}/subcontractors`)
}
