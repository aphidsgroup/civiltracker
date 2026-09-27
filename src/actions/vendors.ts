'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auditLogData } from '@/lib/audit-data'
import { bindOptionalSite, optionalText, requiredText, requireTenantMutation } from '@/lib/auth/site-mutation'
import {
  MAX_AMOUNT_14_2,
  confirmationText,
  paise,
  parseAmountText,
  parseFinancialReason,
  rupeeDelta,
} from '@/lib/validation/financial-mutations'

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

const VENDOR_CHANGED = 'Vendor changed. Refresh and retry.'
const VENDOR_PAYABLE_NOT_PROFILE = 'Vendor payable changes only through a confirmed adjustment.'

/*
 * Edits a vendor's profile. Live `materials.update` + MATERIALS is checked before any read.
 * The payable balance is not a profile field: a payable the form echoes back must equal
 * the stored balance, anything else is refused (see `adjustVendorPayableAction`). An
 * absent status is left as is; a reactivation is allowed, a deactivation must go through
 * the confirmed `deactivateVendorAction`. The re-read of the bound vendor, the write
 * guarded on its status and the before/after audit share one transaction.
 */
export async function updateVendorAction(formData: FormData) {
  const user = await requireTenantMutation('materials.update', 'MATERIALS')
  const companyId = user.companyId

  const id = requiredText(formData.get('id'), 'Vendor')
  const profile = {
    name: requiredText(formData.get('name'), 'Vendor name'),
    phone: optionalText(formData.get('phone')),
    email: optionalText(formData.get('email')),
    gst: optionalText(formData.get('gst')),
    category: optionalText(formData.get('category')),
    address: optionalText(formData.get('address')),
    paymentTerms: optionalText(formData.get('paymentTerms')),
  }
  const payableText = optionalText(formData.get('amountPayable'))
  const echoedPayable = payableText === null ? null : parseAmountText(payableText, 'amount payable', { max: MAX_AMOUNT_14_2 })
  const isActive = formData.has('isActive') ? parseActive(formData.get('isActive')) : null

  await prisma.$transaction(async (tx) => {
    const vendor = await tx.vendor.findFirst({
      where: boundVendorWhere(id, companyId),
      select: { id: true, name: true, phone: true, email: true, gst: true, category: true, address: true, paymentTerms: true, isActive: true, amountPayable: true },
    })
    if (!vendor) throw new Error(VENDOR_NOT_FOUND)
    if (echoedPayable !== null && paise(echoedPayable) !== paise(Number(vendor.amountPayable))) {
      throw new Error(VENDOR_PAYABLE_NOT_PROFILE)
    }
    if (isActive === false && vendor.isActive) {
      throw new Error('Deactivate a vendor with Remove Vendor, which asks for confirmation.')
    }
    const reactivate = isActive === true && !vendor.isActive

    const result = await tx.vendor.updateMany({
      where: { ...boundVendorWhere(vendor.id, companyId), isActive: vendor.isActive },
      data: reactivate ? { ...profile, isActive: true } : profile,
    })
    if (result.count !== 1) throw new Error(VENDOR_CHANGED)

    const { name, phone, email, gst, category, address, paymentTerms } = vendor
    await tx.auditLog.create({
      data: auditLogData({
        userId: user.id,
        companyId,
        action: 'UPDATE',
        module: 'VENDOR',
        recordId: vendor.id,
        description: `${user.name ?? user.email} ${reactivate ? 'reactivated' : 'updated'} vendor "${profile.name}"`,
        before: { name, phone, email, gst, category, address, paymentTerms, isActive: vendor.isActive },
        after: { ...profile, isActive: reactivate || vendor.isActive },
      }),
    })
  })

  revalidatePath('/vendors')
}

const VENDOR_PAYABLE_CHANGED = 'Vendor payable changed. Refresh and retry.'

/*
 * Sets a vendor's payable to a new balance, the one way to change it besides a full
 * settlement. Needs live `payments.manage` + MATERIALS, the vendor name typed back, a
 * reason, the new balance and the balance the caller saw. The re-read of an active vendor
 * of the live company, the write guarded on that balance and the immutable before/after
 * audit share one transaction, so an adjustment without its audit record rolls back.
 */
export async function adjustVendorPayableAction(formData: FormData) {
  const user = await requireTenantMutation('payments.manage', 'MATERIALS')
  const companyId = user.companyId
  const id = requiredText(formData.get('id'), 'Vendor')
  const typed = confirmationText(formData.get('dangerConfirmText'))
  const reason = parseFinancialReason(formData.get('reason'), 'Adjustment reason')
  const amount = parseAmountText(formData.get('amount'), 'amount payable', { max: MAX_AMOUNT_14_2 })
  const expected = parseAmountText(formData.get('expectedAmount'), 'current amount payable', { max: MAX_AMOUNT_14_2 })
  if (paise(amount) === paise(expected)) throw new Error('Vendor payable is unchanged.')

  await prisma.$transaction(async (tx) => {
    const where = { ...boundVendorWhere(id, companyId), isActive: true }
    const vendor = await tx.vendor.findFirst({
      where,
      select: { id: true, name: true, siteId: true, isActive: true, amountPayable: true },
    })
    if (!vendor) throw new Error(VENDOR_NOT_FOUND)
    if (typed !== vendor.name.trim()) {
      throw new Error('Adjustment confirmation text did not match the vendor name.')
    }

    const current = Number(vendor.amountPayable)
    if (paise(current) !== paise(expected)) throw new Error(VENDOR_PAYABLE_CHANGED)

    const result = await tx.vendor.updateMany({
      where: { ...where, id: vendor.id, amountPayable: vendor.amountPayable },
      data: { amountPayable: amount },
    })
    if (result.count !== 1) throw new Error(VENDOR_PAYABLE_CHANGED)

    const snapshot = { name: vendor.name, siteId: vendor.siteId, isActive: vendor.isActive }
    await tx.auditLog.create({
      data: auditLogData({
        userId: user.id,
        companyId,
        action: 'ADJUST',
        module: 'VENDOR',
        recordId: vendor.id,
        description: `${user.name ?? user.email} adjusted payable to vendor "${vendor.name}" from ₹${current.toLocaleString('en-IN')} to ₹${amount.toLocaleString('en-IN')}: ${reason}`,
        before: { ...snapshot, amountPayable: current },
        after: { ...snapshot, amountPayable: amount, adjustment: rupeeDelta(current, amount), reason },
      }),
    })
  })

  revalidatePath('/vendors')
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
  const typed = confirmationText(formData.get('dangerConfirmText'))
  const reason = parseFinancialReason(formData.get('reason'), 'Settlement reason')
  const expected = parseAmountText(formData.get('amount'), 'settled amount', { max: MAX_AMOUNT_14_2 })

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
