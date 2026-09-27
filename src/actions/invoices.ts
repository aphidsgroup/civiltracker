'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { auditLogData } from '@/lib/audit-data'
import { readsAssignedSitesOnly, requireAssignedScopeMutation } from '@/lib/auth/site-mutation'
import { MAX_AMOUNT_14_2, paise, rupeeSum } from '@/lib/validation/financial-mutations'
import { parseInvoiceForm } from '@/lib/validation/invoices'

const CLIENT_NOT_FOUND = 'FORBIDDEN: Client not found or access denied'
const SITE_NOT_FOUND = 'FORBIDDEN: Site not found or access denied'
const RECEIVABLE_CHANGED = 'Client receivable changed. Refresh and retry.'

/*
 * Raises a payment demand. Live `payments.manage` + CLIENTS is checked before any read and
 * every field is parsed strictly before the transaction. The client must belong to exactly
 * the live company; a named site must be a live site of that company in the principal's
 * assigned scope and linked to that client, and a field role must name one. The invoice,
 * the receivable write guarded on the balance read and the immutable audit share one
 * transaction, so an invoice without its audit record rolls back.
 */
export async function raiseInvoice(formData: FormData) {
  const { user, scope } = await requireAssignedScopeMutation('payments.manage', 'CLIENTS')
  const companyId = user.companyId
  const { clientId, siteId, amount, milestone, dueDate } = parseInvoiceForm(formData)
  if (!siteId && readsAssignedSitesOnly(user.role)) throw new Error(SITE_NOT_FOUND)

  const invoiceNumber = await prisma.$transaction(async (tx) => {
    const client = await tx.client.findFirst({
      where: { id: clientId, companyId },
      select: { id: true, name: true, siteId: true, amountDue: true },
    })
    if (!client) throw new Error(CLIENT_NOT_FOUND)

    if (siteId) {
      const site = await tx.site.findFirst({
        where: {
          id: siteId,
          AND: [scope, { OR: [{ clientId: client.id }, ...(client.siteId ? [{ id: client.siteId }] : [])] }],
        },
        select: { id: true },
      })
      if (!site) throw new Error(SITE_NOT_FOUND)
    }

    const amountDue = Number(client.amountDue)
    const nextDue = rupeeSum(amountDue, amount)
    if (paise(nextDue) > paise(MAX_AMOUNT_14_2)) throw new Error('Invoice would exceed the client receivable limit.')

    const invoiceCount = await tx.invoice.count({ where: { companyId } })
    const number = `INV-${String(invoiceCount + 1).padStart(4, '0')}`

    const invoice = await tx.invoice.create({
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
      select: { id: true },
    })

    const receivable = await tx.client.updateMany({
      where: { id: client.id, companyId, amountDue: client.amountDue },
      data: { amountDue: nextDue },
    })
    if (receivable.count !== 1) throw new Error(RECEIVABLE_CHANGED)

    await tx.auditLog.create({
      data: auditLogData({
        userId: user.id,
        companyId,
        action: 'CREATE',
        module: 'INVOICE',
        recordId: invoice.id,
        description: `${user.name ?? user.email} raised invoice ${number} of ₹${amount.toLocaleString('en-IN')} to client "${client.name}"`,
        before: { clientId: client.id, amountDue },
        after: {
          invoiceNumber: number,
          clientId: client.id,
          siteId,
          amount,
          milestone,
          dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
          status: 'DUE',
          amountDue: nextDue,
        },
      }),
    })

    return number
  })

  revalidatePath('/clients')
  return { success: true, invoiceNumber }
}
