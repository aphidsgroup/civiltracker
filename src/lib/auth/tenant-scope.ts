import { prisma } from '@/lib/prisma'
import { requireUser } from './require-user'
import { Role } from '@prisma/client'

export async function assertCanAccessSite(siteId: string): Promise<void> {
  const user = await requireUser()
  if (user.role === Role.SUPER_ADMIN) return

  if (!user.companyId) {
    throw new Error('FORBIDDEN: Tenant data access violation')
  }

  const site = await prisma.site.findFirst({
    where: { id: siteId, companyId: user.companyId, deletedAt: null },
    select: { id: true }
  })

  if (!site) {
    throw new Error('FORBIDDEN: Site not found or access denied')
  }
}

export async function assertCanAccessExpense(expenseId: string): Promise<void> {
  const user = await requireUser()
  if (user.role === Role.SUPER_ADMIN) return

  if (!user.companyId) {
    throw new Error('FORBIDDEN: Tenant data access violation')
  }

  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, companyId: user.companyId },
    select: { id: true }
  })

  if (!expense) {
    throw new Error('FORBIDDEN: Expense not found or access denied')
  }
}

export async function assertCanAccessBill(billId: string): Promise<void> {
  const user = await requireUser()
  if (user.role === Role.SUPER_ADMIN) return

  if (!user.companyId) {
    throw new Error('FORBIDDEN: Tenant data access violation')
  }

  const bill = await prisma.expense.findFirst({
    where: { id: billId, companyId: user.companyId },
    select: { id: true }
  })

  if (!bill) {
    throw new Error('FORBIDDEN: Bill not found or access denied')
  }
}

export async function assertCanAccessDPR(dprId: string): Promise<void> {
  const user = await requireUser()
  if (user.role === Role.SUPER_ADMIN) return

  if (!user.companyId) {
    throw new Error('FORBIDDEN: Tenant data access violation')
  }

  const dpr = await prisma.dailyProgressReport.findFirst({
    where: { id: dprId, companyId: user.companyId },
    select: { id: true }
  })

  if (!dpr) {
    throw new Error('FORBIDDEN: DPR not found or access denied')
  }
}

export async function assertCanAccessClientPortal(projectId: string): Promise<void> {
  const user = await requireUser()
  if (user.role === Role.SUPER_ADMIN) return

  if (user.role === Role.CLIENT) {
    const site = await prisma.site.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true }
    })
    if (!site) {
      throw new Error('FORBIDDEN: Project access denied')
    }
    return
  }

  if (!user.companyId) {
    throw new Error('FORBIDDEN: Tenant data access violation')
  }

  const site = await prisma.site.findFirst({
    where: { id: projectId, companyId: user.companyId, deletedAt: null },
    select: { id: true }
  })

  if (!site) {
    throw new Error('FORBIDDEN: Project access denied')
  }
}
