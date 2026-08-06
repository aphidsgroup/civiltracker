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
  const authResult = await requireApiPermission('expenses.reject', 'EXPENSES')
  if (authResult instanceof NextResponse) return authResult

  const companyContextError = ensureCompanyContext(authResult)
  if (companyContextError) return companyContextError

  if (!hasPermission(authResult.role as Role, 'expenses.reject')) {
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
      approvalStatus: 'REJECTED',
      rejectedById: authResult.id,
      rejectedAt: now,
    },
  })

  // Update any linked approval records (using raw SQL to avoid Prisma relation constraint)
  try {
    await prisma.$executeRaw`
      UPDATE "Approval"
      SET "currentStatus" = 'REJECTED',
          "rejectedById" = ${authResult.id},
          "rejectedAt" = ${now},
          "rejectionReason" = 'Rejected via Bills page'
      WHERE "entityId" = ${id}
        AND "entityType" IN ('EXPENSE', 'BILL')
    `
  } catch {
    // Non-critical: approval record update failure doesn't block expense rejection
  }

  return NextResponse.json({ success: true })
}
