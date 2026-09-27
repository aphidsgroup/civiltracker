'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auditLogData } from '@/lib/audit-data'
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

const VENDOR_PAYABLE_CHANGED = 'Vendor payable changed. Refresh and retry.'
const MAX_SETTLEMENT_REASON = 500

/** The balance the caller is settling, in rupees with at most two decimals. */
function parseSettledAmount(raw: FormDataEntryValue | null): number {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(text)) throw new Error('Invalid settled amount')
  return Number(text)
}

/** Rupee amounts compared in whole paise, so a `Decimal(14, 2)` balance and form text agree. */
function paise(amount: number): number {
  return Math.round(amount * 100)
}

/*
 * Settles a vendor's whole payable. Needs live `payments.manage` + MATERIALS, the vendor
 * name typed back, a reason, and the balance the caller saw. There is no vendor payment
 * model, so the audit record is the settlement record: the re-read of an active vendor of
 * the live company, the write guarded on that balance and the audit share one transaction.
 */
export async function markVendorPaidAction(formData: FormData) {
  const user = await requireTenantMutation('payments.manage', 'MATERIALS')
  const companyId = user.companyId
  const id = requiredText(formData.get('id'), 'Vendor')
  const typed = typeof formData.get('dangerConfirmText') === 'string' ? (formData.get('dangerConfirmText') as string).trim() : ''
  const reason = requiredText(formData.get('reason'), 'Settlement reason')
  if (reason.length > MAX_SETTLEMENT_REASON) throw new Error(`Settlement reason must be at most ${MAX_SETTLEMENT_REASON} characters`)
  const expected = parseSettledAmount(formData.get('amount'))

  await prisma.$transaction(async (tx) => {
    const where = { ...boundVendorWhere(id, companyId), isActive: true }
    const vendor = await tx.vendor.findFirst({
      where,
      select: { id: true, name: true, siteId: true, isActive: true, amountPayable: true },
    })
    if (!vendor) throw new Error(VENDOR_NOT_FOUND)
    if (typed !== vendor.name.trim()) {
      throw new Error('Settlement confirmation text did not match the vendor name.')
    }

    const settled = Number(vendor.amountPayable)
    if (paise(settled) <= 0) throw new Error('Vendor has no payable balance to settle.')
    if (paise(settled) !== paise(expected)) throw new Error(VENDOR_PAYABLE_CHANGED)

    const result = await tx.vendor.updateMany({
      where: { ...where, id: vendor.id, amountPayable: vendor.amountPayable },
      data: { amountPayable: 0 },
    })
    if (result.count !== 1) throw new Error(VENDOR_PAYABLE_CHANGED)

    const snapshot = { name: vendor.name, siteId: vendor.siteId, isActive: vendor.isActive }
    await tx.auditLog.create({
      data: auditLogData({
        userId: user.id,
        companyId,
        action: 'PAID',
        module: 'VENDOR',
        recordId: vendor.id,
        description: `${user.name ?? user.email} settled ₹${settled.toLocaleString('en-IN')} payable to vendor "${vendor.name}": ${reason}`,
        before: { ...snapshot, amountPayable: settled },
        after: { ...snapshot, amountPayable: 0, settledAmount: settled, reason },
      }),
    })
  })

  revalidatePath('/vendors')
}

/*
 * Deactivates a vendor once its name is typed back; audited as the live principal. The
 * re-read, guarded write and audit record share one transaction.
 */
export async function deactivateVendorAction(formData: FormData) {
  const user = await requireTenantMutation('materials.update', 'MATERIALS')
  const companyId = user.companyId
  const id = requiredText(formData.get('id'), 'Vendor')
  const typed = typeof formData.get('dangerConfirmText') === 'string' ? (formData.get('dangerConfirmText') as string).trim() : ''

  await prisma.$transaction(async (tx) => {
    const vendor = await tx.vendor.findFirst({
      where: boundVendorWhere(id, companyId),
      select: { id: true, name: true, category: true, amountPayable: true, isActive: true },
    })
    if (!vendor) throw new Error(VENDOR_NOT_FOUND)
    if (typed !== vendor.name.trim()) {
      throw new Error('Remove confirmation text did not match the vendor name.')
    }

    const result = await tx.vendor.updateMany({ where: boundVendorWhere(vendor.id, companyId), data: { isActive: false } })
    if (result.count !== 1) throw new Error(VENDOR_NOT_FOUND)

    await tx.auditLog.create({
      data: auditLogData({
        userId: user.id,
        companyId,
        action: 'UPDATE',
        module: 'VENDOR',
        recordId: vendor.id,
        description: `${user.name ?? user.email} deactivated vendor "${vendor.name}"`,
        before: { isActive: vendor.isActive, category: vendor.category, amountPayable: Number(vendor.amountPayable), name: vendor.name },
        after: { isActive: false, category: vendor.category, amountPayable: Number(vendor.amountPayable), name: vendor.name },
      }),
    })
  })

  revalidatePath('/vendors')
}
