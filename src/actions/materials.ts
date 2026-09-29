'use server'

import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { auditLogData } from '@/lib/audit-data'
import { assignedSiteScope, requireTenantMutation } from '@/lib/auth/site-mutation'
import { parseMaterialCreateForm } from '@/lib/validation/commercial-records'

const SITE_NOT_FOUND = 'FORBIDDEN: Site not found or access denied'

/*
 * Adds a material to a site's stock register. Live `materials.create` + MATERIALS is
 * checked before any read and the form is parsed strictly before the transaction. The
 * site must be a live site of exactly the live company that a field role is assigned to.
 * Current stock starts at the opening stock; cost is not set here. The site binding, the
 * material and its immutable audit record share one transaction.
 */
export async function createMaterialAction(formData: FormData) {
  const user = await requireTenantMutation('materials.create', 'MATERIALS')
  const companyId = user.companyId
  const input = parseMaterialCreateForm(formData)
  const scope = await assignedSiteScope(user, companyId)

  await prisma.$transaction(async (tx) => {
    const site = await tx.site.findFirst({ where: { id: input.siteId, ...scope }, select: { id: true, name: true } })
    if (!site) throw new Error(SITE_NOT_FOUND)

    const material = await tx.material.create({
      data: {
        companyId,
        siteId: site.id,
        name: input.name,
        brand: input.brand,
        unit: input.unit,
        openingStock: input.openingStock,
        currentStock: input.openingStock,
        minStock: input.minStock,
        isActive: true,
      },
      select: { id: true },
    })

    const openingStock = input.openingStock.toFixed(3)
    await tx.auditLog.create({
      data: auditLogData({
        userId: user.id,
        companyId,
        action: 'CREATE',
        module: 'MATERIAL',
        recordId: material.id,
        description: `${user.name ?? user.email} added material ${input.name} to ${site.name} with opening stock ${openingStock} ${input.unit}`,
        after: {
          materialId: material.id,
          siteId: site.id,
          siteName: site.name,
          name: input.name,
          brand: input.brand,
          unit: input.unit,
          openingStock,
          currentStock: openingStock,
          minStock: input.minStock.toFixed(3),
        },
      }),
    })
  })

  redirect('/materials')
}
