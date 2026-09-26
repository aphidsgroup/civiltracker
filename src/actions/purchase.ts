'use server'

import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { optionalText, parseNonNegativeAmount, requiredText, requireTenantMutation } from '@/lib/auth/site-mutation'

const VENDOR_NOT_FOUND = 'FORBIDDEN: Vendor not found or access denied'

/*
 * Drafts a purchase order. Live `materials.update` + MATERIALS is checked before any
 * read. A chosen vendor must be an active vendor of exactly the live company that is
 * company-wide or on a live site; it is bound and the order written in one transaction.
 */
export async function createPurchaseOrderAction(formData: FormData) {
  const user = await requireTenantMutation('materials.update', 'MATERIALS')
  const companyId = user.companyId

  const poNumber = requiredText(formData.get('poNumber'), 'PO number')
  const totalAmount = parseNonNegativeAmount(requiredText(formData.get('totalAmount'), 'Total amount'), 'total amount', 0)
  const notes = optionalText(formData.get('notes'))
  const vendorId = optionalText(formData.get('vendorId'))

  await prisma.$transaction(async (tx) => {
    if (vendorId) {
      const vendor = await tx.vendor.findFirst({
        where: {
          id: vendorId,
          companyId,
          isActive: true,
          OR: [{ siteId: null }, { site: { companyId, deletedAt: null } }],
        },
        select: { id: true },
      })
      if (!vendor) throw new Error(VENDOR_NOT_FOUND)
    }

    await tx.purchaseOrder.create({
      data: {
        companyId,
        vendorId,
        poNumber,
        totalAmount,
        notes,
        status: 'DRAFT',
        createdById: user.id,
      },
    })
  })

  redirect('/purchase')
}
