'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { logActivity } from '@/lib/audit'
import {
  bindOptionalSite,
  optionalText,
  parseNonNegativeAmount,
  requiredText,
  requireTenantMutation,
} from '@/lib/auth/site-mutation'

const VENDOR_NOT_FOUND = 'FORBIDDEN: Vendor not found or access denied'

/** A vendor of exactly `companyId` that is company-wide or on a live site. */
function boundVendorWhere(id: string, companyId: string) {
  return { id, companyId, OR: [{ siteId: null }, { site: { companyId, deletedAt: null } }] }
}

function parseActive(raw: FormDataEntryValue | null): boolean {
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw new Error('Invalid vendor status')
}

/*
 * Adds a vendor. Live `materials.update` + MATERIALS is checked before any read; a
 * chosen site must be a live site of exactly the live company, blank stays company-wide.
 */
export async function createVendorAction(formData: FormData) {
  const user = await requireTenantMutation('materials.update', 'MATERIALS')
  const name = requiredText(formData.get('name'), 'Vendor name')
  const siteId = await bindOptionalSite(formData.get('siteId'), user.companyId)

  await prisma.vendor.create({
    data: {
      companyId: user.companyId,
      siteId,
      name,
      email: optionalText(formData.get('email')),
      phone: optionalText(formData.get('phone')),
      gst: optionalText(formData.get('gst')),
      category: optionalText(formData.get('category')),
      paymentTerms: optionalText(formData.get('paymentTerms')),
      address: optionalText(formData.get('address')),
    },
  })

  redirect('/vendors')
}

/* Edits a vendor's master data; the vendor is bound to the live company before the write. */
export async function updateVendorAction(formData: FormData) {
  const user = await requireTenantMutation('materials.update', 'MATERIALS')
  const companyId = user.companyId

  const id = requiredText(formData.get('id'), 'Vendor')
  const name = requiredText(formData.get('name'), 'Vendor name')
  const amountPayable = parseNonNegativeAmount(formData.get('amountPayable'), 'amount payable', 0)
  const isActive = parseActive(formData.get('isActive'))

  const vendor = await prisma.vendor.findFirst({ where: boundVendorWhere(id, companyId), select: { id: true } })
  if (!vendor) throw new Error(VENDOR_NOT_FOUND)

  await prisma.vendor.updateMany({
    where: { id: vendor.id, companyId },
    data: {
      name,
      phone: optionalText(formData.get('phone')),
      email: optionalText(formData.get('email')),
      gst: optionalText(formData.get('gst')),
      category: optionalText(formData.get('category')),
      address: optionalText(formData.get('address')),
      paymentTerms: optionalText(formData.get('paymentTerms')),
      amountPayable,
      isActive,
    },
  })
  revalidatePath('/vendors')
}

/* Settles a vendor's payable. Needs live `payments.manage`. */
export async function markVendorPaidAction(formData: FormData) {
  const user = await requireTenantMutation('payments.manage', 'MATERIALS')
  const companyId = user.companyId
  const id = requiredText(formData.get('id'), 'Vendor')

  const vendor = await prisma.vendor.findFirst({ where: boundVendorWhere(id, companyId), select: { id: true } })
  if (!vendor) throw new Error(VENDOR_NOT_FOUND)

  await prisma.vendor.updateMany({ where: { id: vendor.id, companyId }, data: { amountPayable: 0 } })
  revalidatePath('/vendors')
}

/* Deactivates a vendor once its name is typed back; audited as the live principal. */
export async function deactivateVendorAction(formData: FormData) {
  const user = await requireTenantMutation('materials.update', 'MATERIALS')
  const companyId = user.companyId
  const id = requiredText(formData.get('id'), 'Vendor')
  const typed = typeof formData.get('dangerConfirmText') === 'string' ? (formData.get('dangerConfirmText') as string).trim() : ''

  const vendor = await prisma.vendor.findFirst({
    where: boundVendorWhere(id, companyId),
    select: { id: true, name: true, category: true, amountPayable: true, isActive: true },
  })
  if (!vendor) throw new Error(VENDOR_NOT_FOUND)
  if (typed !== vendor.name.trim()) {
    throw new Error('Remove confirmation text did not match the vendor name.')
  }

  await prisma.vendor.updateMany({ where: { id: vendor.id, companyId }, data: { isActive: false } })

  await logActivity({
    userId: user.id,
    companyId,
    action: 'UPDATE',
    module: 'VENDOR',
    recordId: vendor.id,
    description: `${user.name ?? user.email} deactivated vendor "${vendor.name}"`,
    before: { isActive: vendor.isActive, category: vendor.category, amountPayable: Number(vendor.amountPayable), name: vendor.name },
    after: { isActive: false, category: vendor.category, amountPayable: Number(vendor.amountPayable), name: vendor.name },
  })

  revalidatePath('/vendors')
}
