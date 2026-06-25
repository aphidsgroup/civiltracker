'use server'

import { requireUser, assertCanAccessSite } from '@/lib/auth/permissions'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import type { ExpenseCategory, PaymentMode } from '@/types'

export async function createExpenseAction(data: {
  siteId: string
  amount: number
  category: ExpenseCategory
  paymentMode: PaymentMode
  paidTo?: string
  billNumber?: string
  notes?: string
  cloudinaryPublicId?: string
  secureUrl?: string
  format?: string
  bytes?: number
}) {
  const user = await requireUser()
  if (!user.companyId && user.role !== 'SUPER_ADMIN') {
    throw new Error('Unauthorized: No active company context')
  }

  await assertCanAccessSite(data.siteId)

  const site = await prisma.site.findUnique({ where: { id: data.siteId }, select: { companyId: true } })
  const companyId = site?.companyId || user.companyId!

  const expense = await prisma.expense.create({
    data: {
      companyId,
      siteId: data.siteId,
      category: data.category,
      amount: data.amount,
      paymentMode: data.paymentMode,
      paidTo: data.paidTo,
      billNumber: data.billNumber,
      notes: data.notes,
      description: data.notes ? data.notes.substring(0, 50) : `Expense for ${data.category}`,
      createdById: user.id,
      ...(data.secureUrl && data.cloudinaryPublicId
        ? {
            billAttachments: {
              create: {
                cloudinaryPublicId: data.cloudinaryPublicId,
                secureUrl: data.secureUrl,
                format: data.format,
                bytes: data.bytes,
                uploadedById: user.id,
              },
            },
          }
        : {}),
    },
  })

  revalidatePath('/dashboard')
  revalidatePath('/mobile/home')
  
  return { success: true, expenseId: expense.id }
}
