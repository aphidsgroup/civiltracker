import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { hasPermission } from '@/lib/permissions'
import { Role } from '@prisma/client'
import { ensureCompanyContext, requireApiPermission } from '@/lib/auth/require-api-permission'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const authResult = await requireApiPermission('expenses.approve', 'EXPENSES')
  if (authResult instanceof NextResponse) return authResult

  const companyContextError = ensureCompanyContext(authResult)
  if (companyContextError) return companyContextError

  if (!hasPermission(authResult.role as Role, 'expenses.approve')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const companyFilter = authResult.role === 'SUPER_ADMIN' ? {} : { companyId: authResult.companyId }

  const expense = await prisma.expense.findFirst({
    where: { id, ...companyFilter },
  })

  if (!expense) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date()

  // Update the expense status
  await prisma.expense.update({
    where: { id },
    data: {
      approvalStatus: 'APPROVED',
      approvedById: authResult.id,
      approvedAt: now,
    },
  })

  // Update any linked approval records (using updateMany with raw scalar fields only)
  try {
    await prisma.$executeRaw`
      UPDATE "Approval"
      SET "currentStatus" = 'APPROVED',
          "approvedById" = ${authResult.id},
          "approvedAt" = ${now}
      WHERE "entityId" = ${id}
        AND "entityType" IN ('EXPENSE', 'BILL')
    `
  } catch {
    // Non-critical: approval record update failure doesn't block expense approval
  }

  return NextResponse.json({ success: true })
}
