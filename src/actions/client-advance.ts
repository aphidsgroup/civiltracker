'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { requireTenantMutation } from '@/lib/auth/site-mutation'

const SITE_NOT_FOUND = 'FORBIDDEN: Site not found or access denied'
const CLIENT_NOT_FOUND = 'FORBIDDEN: Client not found or access denied'

/*
 * Records a client advance. Live `payments.manage` + CLIENTS is checked before any read.
 * The site must be a live site of exactly the live company, and the client it is linked
 * to must belong to that company too. When the site has no client yet, the generated
 * client, the site link and the payment are written in one transaction, so a failure
 * leaves none of them behind.
 */
export async function createClientAdvance(data: {
  siteId: string
  amount: number
  purpose: string
  receivedAt: string
}) {
  const user = await requireTenantMutation('payments.manage', 'CLIENTS')
  const companyId = user.companyId

  if (typeof data?.siteId !== 'string' || !data.siteId.trim()) throw new Error('Please select a site.')
  if (typeof data.amount !== 'number' || !Number.isFinite(data.amount) || data.amount <= 0) {
    throw new Error('Amount must be greater than 0.')
  }
  const purpose = typeof data.purpose === 'string' ? data.purpose.trim() : ''
  if (!purpose) throw new Error('Purpose / notes are required.')
  const paidAt = new Date(data.receivedAt)
  if (typeof data.receivedAt !== 'string' || Number.isNaN(paidAt.getTime())) {
    throw new Error('Invalid received date.')
  }
  const siteId = data.siteId.trim()
  const amount = data.amount

  const advance = await prisma.$transaction(async (tx) => {
    const site = await tx.site.findFirst({
      where: { id: siteId, companyId, deletedAt: null },
      select: { id: true, name: true, clientId: true },
    })
    if (!site) throw new Error(SITE_NOT_FOUND)

    let clientId: string
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
    }

    return tx.payment.create({
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
  })

  // Audit log
  try {
    const { logActivity } = await import('@/lib/audit')
    await logActivity({
      userId: user.id,
      companyId,
      action: 'CREATE',
      module: 'CLIENT_ADVANCE',
      recordId: advance.id,
      description: `${user.name ?? user.email} recorded ₹${amount.toLocaleString('en-IN')} client advance — ${purpose.substring(0, 80)}`,
      after: { amount, purpose, siteId },
    })
  } catch {
    // Non-critical
  }

  revalidatePath('/clients/advances')
  revalidatePath('/mobile/add-client-advance')
  return { success: true, id: advance.id }
}
