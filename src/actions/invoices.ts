'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { parsePositiveAmount, requireTenantMutation } from '@/lib/auth/site-mutation'

const CLIENT_NOT_FOUND = 'FORBIDDEN: Client not found or access denied'
const SITE_NOT_FOUND = 'FORBIDDEN: Site not found or access denied'

function optionalText(raw: FormDataEntryValue | null): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function optionalDate(raw: FormDataEntryValue | null): Date | null {
  const text = optionalText(raw)
  if (!text) return null
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) throw new Error('Invalid due date')
  return date
}

/*
 * Raises a payment demand. Live `payments.manage` + CLIENTS is checked before any read;
 * the client must belong to exactly the live company and a named site must be a live
 * site of that company linked to that client. The invoice and the client's receivable
 * are written in one transaction, and the receivable update must hit exactly one row.
 */
export async function raiseInvoice(formData: FormData) {
  const user = await requireTenantMutation('payments.manage', 'CLIENTS')
  const companyId = user.companyId

  const clientId = optionalText(formData.get('clientId'))
  if (!clientId) throw new Error('Invalid invoice details')
  const siteId = optionalText(formData.get('siteId'))
  const amount = parsePositiveAmount(formData.get('amount'))
  const milestone = optionalText(formData.get('milestone'))
  const dueDate = optionalDate(formData.get('dueDate'))

  const invoiceNumber = await prisma.$transaction(async (tx) => {
    const client = await tx.client.findFirst({
      where: { id: clientId, companyId },
      select: { id: true, siteId: true },
    })
    if (!client) throw new Error(CLIENT_NOT_FOUND)

    if (siteId) {
      const site = await tx.site.findFirst({
        where: {
          id: siteId,
          companyId,
          deletedAt: null,
          OR: [{ clientId: client.id }, ...(client.siteId ? [{ id: client.siteId }] : [])],
        },
        select: { id: true },
      })
      if (!site) throw new Error(SITE_NOT_FOUND)
    }

    const invoiceCount = await tx.invoice.count({ where: { companyId } })
    const number = `INV-${String(invoiceCount + 1).padStart(4, '0')}`

    await tx.invoice.create({
      data: {
        companyId,
        clientId: client.id,
        siteId,
        invoiceNumber: number,
        amount,
        milestone,
        status: 'DUE',
        dueDate,
      },
    })

    const receivable = await tx.client.updateMany({
      where: { id: client.id, companyId },
      data: { amountDue: { increment: amount } },
    })
    if (receivable.count !== 1) throw new Error(CLIENT_NOT_FOUND)

    return number
  })

  revalidatePath('/clients')
  return { success: true, invoiceNumber }
}
