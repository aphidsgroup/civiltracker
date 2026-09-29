'use server'

import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { auditLogData } from '@/lib/audit-data'
import { assignedSiteScope, requireTenantMutation } from '@/lib/auth/site-mutation'
import { parseClientCreateForm } from '@/lib/validation/commercial-records'

const SITE_NOT_FOUND = 'FORBIDDEN: Site not found or access denied'

/*
 * Adds a client. Live `payments.manage` + CLIENTS is checked before any read and the form
 * is parsed strictly before the transaction. A chosen site must be a live site of exactly
 * the live company in the principal's assigned scope; blank stays company-wide. The
 * receivable counters are server-owned and start at zero (raising an invoice moves them).
 * The site binding, the client and its immutable audit record share one transaction.
 */
export async function createClientAction(formData: FormData) {
  const user = await requireTenantMutation('payments.manage', 'CLIENTS')
  const companyId = user.companyId
  const input = parseClientCreateForm(formData)
  const scope = await assignedSiteScope(user, companyId)

  await prisma.$transaction(async (tx) => {
    let site: { id: string; name: string } | null = null
    if (input.siteId) {
      site = await tx.site.findFirst({ where: { id: input.siteId, ...scope }, select: { id: true, name: true } })
      if (!site) throw new Error(SITE_NOT_FOUND)
    }

    const zero = new Prisma.Decimal(0)
    const client = await tx.client.create({
      data: {
        companyId,
        name: input.name,
        phone: input.phone,
        email: input.email,
        siteId: site?.id ?? null,
        contractValue: input.contractValue,
        amountPaid: zero,
        amountDue: zero,
        portalAccess: input.portalAccess,
      },
      select: { id: true },
    })

    const contractValue = input.contractValue.toFixed(2)
    await tx.auditLog.create({
      data: auditLogData({
        userId: user.id,
        companyId,
        action: 'CREATE',
        module: 'CLIENT',
        recordId: client.id,
        description: `${user.name ?? user.email} added client ${input.name} (contract ₹${contractValue})`,
        after: {
          clientId: client.id,
          name: input.name,
          siteId: site?.id ?? null,
          siteName: site?.name ?? null,
          contractValue,
          amountPaid: zero.toFixed(2),
          amountDue: zero.toFixed(2),
          portalAccess: input.portalAccess,
          hasPhone: input.phone !== null,
          hasEmail: input.email !== null,
        },
      }),
    })
  })

  redirect('/clients')
}
