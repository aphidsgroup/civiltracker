'use server'

import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { parseNonNegativeAmount, requiredText, requireSiteMutation } from '@/lib/auth/site-mutation'

function parsePositive(raw: FormDataEntryValue | null, field: string): number {
  const value = parseNonNegativeAmount(requiredText(raw, field), field, 0)
  if (value <= 0) throw new Error(`Invalid ${field}`)
  return value
}

/*
 * Adds a BOQ line. Live `sites.update` + BOQ is checked before any read, and the site
 * must be a live site of exactly the live company.
 */
export async function createBoqItemAction(formData: FormData) {
  const { user, site } = await requireSiteMutation(String(formData.get('siteId') ?? ''), 'sites.update', 'BOQ')

  const description = requiredText(formData.get('description'), 'Description')
  const unit = requiredText(formData.get('unit'), 'Unit')
  const category = typeof formData.get('category') === 'string' ? (formData.get('category') as string).trim() : ''
  const quantity = parsePositive(formData.get('quantity'), 'quantity')
  const rate = parsePositive(formData.get('rate'), 'rate')
  const gstPercent = parseNonNegativeAmount(formData.get('gstPercent'), 'GST percent', 0)

  const amount = quantity * rate
  const totalWithGst = amount + amount * (gstPercent / 100)

  await prisma.bOQItem.create({
    data: {
      companyId: user.companyId,
      siteId: site.id,
      category: category || 'General',
      description,
      unit,
      quantity,
      rate,
      amount,
      gstPercent,
      totalWithGst,
      clientApproved: false,
    },
  })

  redirect('/boq')
}
