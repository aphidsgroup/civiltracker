'use server'

import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import {
  bindOptionalSite,
  optionalText,
  parseNonNegativeAmount,
  requiredText,
  requireTenantMutation,
} from '@/lib/auth/site-mutation'

/*
 * Adds a client. Live `payments.manage` + CLIENTS is checked before any read; a chosen
 * site must be a live site of exactly the live company, blank stays company-wide.
 */
export async function createClientAction(formData: FormData) {
  const user = await requireTenantMutation('payments.manage', 'CLIENTS')
  const name = requiredText(formData.get('name'), 'Client name')
  const contractValue = parseNonNegativeAmount(formData.get('contractValue'), 'contract value', 0)
  const siteId = await bindOptionalSite(formData.get('siteId'), user.companyId)

  await prisma.client.create({
    data: {
      companyId: user.companyId,
      name,
      phone: optionalText(formData.get('phone')),
      email: optionalText(formData.get('email')),
      siteId,
      contractValue,
      portalAccess: formData.get('portalAccess') === 'on',
    },
  })

  redirect('/clients')
}
