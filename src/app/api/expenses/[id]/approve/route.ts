import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { hasPermission } from '@/lib/permissions'
import { Role } from '@prisma/client'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasPermission(session.user.role as Role, 'expenses.approve')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const companyFilter = session.user.role === 'SUPER_ADMIN' ? {} : { companyId: session.user.companyId }

  const expense = await prisma.expense.findFirst({
    where: { id, ...companyFilter },
  })

  if (!expense) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.expense.update({
    where: { id },
    data: { approvalStatus: 'APPROVED', approvedById: session.user.id, approvedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
