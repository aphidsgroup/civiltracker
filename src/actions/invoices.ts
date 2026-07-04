'use server'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function raiseInvoice(formData: FormData) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  const clientId = formData.get('clientId') as string
  const siteId = formData.get('siteId') as string | null
  const amount = parseFloat(formData.get('amount') as string)
  const milestone = formData.get('milestone') as string
  const dueDate = formData.get('dueDate') as string
  const notes = formData.get('notes') as string

  if (!clientId || isNaN(amount) || amount <= 0) {
    throw new Error('Invalid invoice details')
  }

  // Generate invoice number
  const invoiceCount = await prisma.invoice.count({ where: { companyId: session.user.companyId } })
  const invoiceNumber = `INV-${String(invoiceCount + 1).padStart(4, '0')}`

  await prisma.invoice.create({
    data: {
      companyId: session.user.companyId,
      clientId,
      siteId: siteId || null,
      invoiceNumber,
      amount,
      milestone: milestone || null,
      status: 'DUE',
      dueDate: dueDate ? new Date(dueDate) : null,
    }
  })

  // Update client amountDue
  await prisma.client.update({
    where: { id: clientId },
    data: { amountDue: { increment: amount } }
  })

  revalidatePath('/clients')
  return { success: true, invoiceNumber }
}
