'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function createClientAdvance(data: {
  siteId: string
  amount: number
  purpose: string
  receivedAt: string
}) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  if (!data.siteId) throw new Error('Please select a site.')
  if (!data.amount || data.amount <= 0) throw new Error('Amount must be greater than 0.')
  if (!data.purpose?.trim()) throw new Error('Purpose / notes are required.')

  const companyId = session.user.companyId

  // Verify site belongs to this company
  const site = await prisma.site.findFirst({
    where: { id: data.siteId, companyId },
    select: { id: true, name: true, clientId: true },
  })
  if (!site) throw new Error('Site not found or access denied.')

  // Resolve or create a Client record for this site
  let clientId: string
  if (site.clientId) {
    clientId = site.clientId
  } else {
    const genericClient = await prisma.client.create({
      data: {
        companyId,
        name: `Client – ${site.name}`,
        phone: '',
      },
    })
    clientId = genericClient.id
    await prisma.site.update({
      where: { id: site.id },
      data: { clientId: genericClient.id },
    })
  }

  const advance = await prisma.payment.create({
    data: {
      companyId,
      clientId,
      siteId: data.siteId,
      amount: data.amount,
      type: 'ADVANCE',
      mode: 'BANK_TRANSFER',
      notes: data.purpose,
      status: 'CONFIRMED',
      paidAt: new Date(data.receivedAt),
    },
  })

  // Audit log
  try {
    const { logActivity } = await import('@/lib/audit')
    await logActivity({
      userId: session.user.id!,
      companyId,
      action: 'CREATE',
      module: 'CLIENT_ADVANCE',
      recordId: advance.id,
      description: `${session.user.name ?? session.user.email} recorded ₹${data.amount.toLocaleString('en-IN')} client advance — ${data.purpose.substring(0, 80)}`,
      after: { amount: data.amount, purpose: data.purpose, siteId: data.siteId },
    })
  } catch {
    // Non-critical
  }

  revalidatePath('/clients/advances')
  revalidatePath('/mobile/add-client-advance')
  return { success: true, id: advance.id }
}
