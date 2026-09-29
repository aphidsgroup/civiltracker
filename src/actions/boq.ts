'use server'

import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { auditLogData } from '@/lib/audit-data'
import { assignedSiteScope, requireTenantMutation } from '@/lib/auth/site-mutation'
import { parseBoqItemCreateForm } from '@/lib/validation/commercial-records'

const SITE_NOT_FOUND = 'FORBIDDEN: Site not found or access denied'

/*
 * Adds a BOQ line. Live `sites.update` + BOQ is checked before any read and the form is
 * parsed strictly before the transaction; the amount and the total with GST are derived
 * there in `Decimal`, never taken from the form. The site must be a live site of exactly
 * the live company in the principal's assigned scope. The site binding, the line and its
 * immutable audit record share one transaction.
 */
export async function createBoqItemAction(formData: FormData) {
  const user = await requireTenantMutation('sites.update', 'BOQ')
  const companyId = user.companyId
  const input = parseBoqItemCreateForm(formData)
  const scope = await assignedSiteScope(user, companyId)

  await prisma.$transaction(async (tx) => {
    const site = await tx.site.findFirst({ where: { id: input.siteId, ...scope }, select: { id: true, name: true } })
    if (!site) throw new Error(SITE_NOT_FOUND)

    const item = await tx.bOQItem.create({
      data: {
        companyId,
        siteId: site.id,
        category: input.category,
        description: input.description,
        unit: input.unit,
        quantity: input.quantity,
        rate: input.rate,
        amount: input.amount,
        // A Float column; the value is exact percent text of at most two decimals.
        gstPercent: input.gstPercent.toNumber(),
        totalWithGst: input.totalWithGst,
        clientApproved: false,
      },
      select: { id: true },
    })

    const quantity = input.quantity.toFixed(3)
    const rate = input.rate.toFixed(2)
    const totalWithGst = input.totalWithGst.toFixed(2)
    await tx.auditLog.create({
      data: auditLogData({
        userId: user.id,
        companyId,
        action: 'CREATE',
        module: 'BOQ',
        recordId: item.id,
        description: `${user.name ?? user.email} added BOQ item to ${site.name}: ${quantity} ${input.unit} × ₹${rate} = ₹${totalWithGst} incl. GST`,
        after: {
          boqItemId: item.id,
          siteId: site.id,
          siteName: site.name,
          category: input.category,
          description: input.description,
          unit: input.unit,
          quantity,
          rate,
          amount: input.amount.toFixed(2),
          gstPercent: input.gstPercent.toFixed(2),
          totalWithGst,
          clientApproved: false,
        },
      }),
    })
  })

  redirect('/boq')
}
