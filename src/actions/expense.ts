'use server'

import { auth } from '@/lib/auth'
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
  const session = await auth()
  if (!session?.user?.companyId) {
    throw new Error('Unauthorized')
  }

  const expense = await prisma.expense.create({
    data: {
      companyId: session.user.companyId,
      siteId: data.siteId,
      category: data.category,
      amount: data.amount,
      paymentMode: data.paymentMode,
      paidTo: data.paidTo,
      billNumber: data.billNumber,
      notes: data.notes,
      description: data.notes ? data.notes.substring(0, 50) : `Expense for ${data.category}`,
      createdById: session.user.id,
      ...(data.secureUrl && data.cloudinaryPublicId
        ? {
            billAttachments: {
              create: {
                cloudinaryPublicId: data.cloudinaryPublicId,
                secureUrl: data.secureUrl,
                format: data.format,
                bytes: data.bytes,
                uploadedById: session.user.id,
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
