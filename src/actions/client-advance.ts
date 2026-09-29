'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { auditLogData } from '@/lib/audit-data'
import { requireAssignedScopeMutation } from '@/lib/auth/site-mutation'
import { clientAdvanceAmountFromForm, parseClientAdvanceInput } from '@/lib/validation/client-advances'

const SITE_NOT_FOUND = 'FORBIDDEN: Site not found or access denied'
const CLIENT_NOT_FOUND = 'FORBIDDEN: Client not found or access denied'

/*
 * Records a client advance. Live `payments.manage` + CLIENTS is checked before any read,
 * then the payload is parsed strictly (`parseClientAdvanceInput`). The site must be a live
 * site of exactly the live company within the principal's assigned scope, and the client
 * it is linked to must belong to that company too. The site and client bindings, a
 * generated client and its site link when the site has none yet, the confirmed payment
 * and its immutable financial audit record are written in one transaction, so a failure
 * of any of them (the audit included) leaves none behind.
 */
export async function createClientAdvance(data: {
  siteId: string
  amount: number
  purpose: string
  receivedAt: string
}) {
  const { user, scope } = await requireAssignedScopeMutation('payments.manage', 'CLIENTS')
  const companyId = user.companyId
  const { siteId, amount, purpose, paidAt } = parseClientAdvanceInput(data)

  const advance = await prisma.$transaction(async (tx) => {
    const site = await tx.site.findFirst({
      where: { id: siteId, ...scope },
      select: { id: true, name: true, clientId: true },
    })
    if (!site) throw new Error(SITE_NOT_FOUND)

    let clientId: string
    let clientCreated = false
    if (site.clientId) {
      const client = await tx.client.findFirst({
        where: { id: site.clientId, companyId },
        select: { id: true },
      })
      if (!client) throw new Error(CLIENT_NOT_FOUND)
      clientId = client.id
    } else {
      const genericClient = await tx.client.create({
        data: {
          companyId,
          name: `Client – ${site.name}`,
          phone: '',
          siteId: site.id,
        },
      })
      const linked = await tx.site.updateMany({
        where: { id: site.id, companyId, deletedAt: null, clientId: null },
        data: { clientId: genericClient.id },
      })
      if (linked.count !== 1) throw new Error('Site client changed. Please retry.')
      clientId = genericClient.id
      clientCreated = true
    }

    const payment = await tx.payment.create({
      data: {
        companyId,
        clientId,
        siteId: site.id,
        amount,
        type: 'ADVANCE',
        mode: 'BANK_TRANSFER',
        notes: purpose,
        status: 'CONFIRMED',
        paidAt,
      },
    })

    await tx.auditLog.create({
      data: auditLogData({
        userId: user.id,
        companyId,
        action: 'CREATE',
        module: 'CLIENT_ADVANCE',
        recordId: payment.id,
        description: `${user.name ?? user.email} recorded ₹${amount.toLocaleString('en-IN')} client advance for ${site.name}: ${purpose}`,
        after: {
          paymentId: payment.id,
          clientId,
          clientCreated,
          siteId: site.id,
          siteName: site.name,
          amount,
          type: 'ADVANCE',
          mode: 'BANK_TRANSFER',
          status: 'CONFIRMED',
          paidAt: paidAt.toISOString(),
          purpose,
        },
      }),
    })

    return payment
  })

  revalidatePath('/clients/advances')
  revalidatePath('/mobile/add-client-advance')
  return { success: true, id: advance.id }
}

/* The `/clients/advances` form entry point; the same live gate, parsing and bindings apply. */
export async function createClientAdvanceFromFormAction(formData: FormData) {
  await createClientAdvance({
    siteId: String(formData.get('siteId') ?? ''),
    amount: clientAdvanceAmountFromForm(formData.get('amount')),
    purpose: String(formData.get('purpose') ?? ''),
    receivedAt: String(formData.get('receivedAt') ?? ''),
  })
}
