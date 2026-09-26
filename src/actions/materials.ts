'use server'

import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { optionalText, parseNonNegativeAmount, requiredText, requireAssignedSiteMutation } from '@/lib/auth/site-mutation'

/*
 * Adds a material to a site's stock register. Live `materials.create` + MATERIALS is
 * checked before any read, and the site must be a live site of exactly the live company
 * that a field role is assigned to.
 */
export async function createMaterialAction(formData: FormData) {
  const { user, site } = await requireAssignedSiteMutation(String(formData.get('siteId') ?? ''), 'materials.create', 'MATERIALS')

  const name = requiredText(formData.get('name'), 'Material name')
  const unit = requiredText(formData.get('unit'), 'Unit')
  const openingStock = parseNonNegativeAmount(formData.get('openingStock'), 'opening stock', 0)
  const minStock = parseNonNegativeAmount(formData.get('minStock'), 'minimum stock', 0)

  await prisma.material.create({
    data: {
      companyId: user.companyId,
      siteId: site.id,
      name,
      brand: optionalText(formData.get('brand')),
      unit,
      openingStock,
      currentStock: openingStock,
      minStock,
      isActive: true,
    },
  })

  redirect('/materials')
}
