'use server'

import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { auditLogData } from '@/lib/audit-data'
import { assignedSiteScope, requireTenantMutation } from '@/lib/auth/site-mutation'
import { parsePurchaseOrderCreateForm } from '@/lib/validation/commercial-records'

const VENDOR_NOT_FOUND = 'FORBIDDEN: Vendor not found or access denied'

/*
 * Drafts a purchase order. Live `materials.update` + MATERIALS is checked before any
 * read and the form is parsed strictly before the transaction. A chosen vendor must be an
 * active vendor of exactly the live company that is company-wide or on a live site in the
 * principal's assigned scope. Status and creator are server-owned. The vendor binding,
 * the order and its immutable audit record share one transaction.
 */
export async function createPurchaseOrderAction(formData: FormData) {
  const user = await requireTenantMutation('materials.update', 'MATERIALS')
  const companyId = user.companyId
  const input = parsePurchaseOrderCreateForm(formData)
  const scope = await assignedSiteScope(user, companyId)

  await prisma.$transaction(async (tx) => {
    let vendor: { id: string; name: string } | null = null
    if (input.vendorId) {
      vendor = await tx.vendor.findFirst({
        where: {
          id: input.vendorId,
          companyId,
          isActive: true,
          OR: [{ siteId: null }, { site: scope }],
        },
        select: { id: true, name: true },
      })
      if (!vendor) throw new Error(VENDOR_NOT_FOUND)
    }

    const order = await tx.purchaseOrder.create({
      data: {
        companyId,
        vendorId: vendor?.id ?? null,
        poNumber: input.poNumber,
        totalAmount: input.totalAmount,
        notes: input.notes,
        status: 'DRAFT',
        createdById: user.id,
      },
      select: { id: true },
    })

    const totalAmount = input.totalAmount.toFixed(2)
    await tx.auditLog.create({
      data: auditLogData({
        userId: user.id,
        companyId,
        action: 'CREATE',
        module: 'PURCHASE_ORDER',
        recordId: order.id,
        description: `${user.name ?? user.email} drafted purchase order ${input.poNumber} for ₹${totalAmount}`,
        after: {
          purchaseOrderId: order.id,
          poNumber: input.poNumber,
          vendorId: vendor?.id ?? null,
          vendorName: vendor?.name ?? null,
          totalAmount,
          status: 'DRAFT',
          hasNotes: input.notes !== null,
        },
      }),
    })
  })

  redirect('/purchase')
}
