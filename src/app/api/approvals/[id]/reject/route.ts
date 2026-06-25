import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { hasPermission } from '@/lib/permissions'
import type { Role } from '@prisma/client'

function verifyCanApproveEntity(role: string, entityType: string) {
  if (role === 'SUPER_ADMIN' || role === 'COMPANY_ADMIN') return true
  switch (entityType) {
    case 'EXPENSE':
      return hasPermission(role as Role, 'expenses.approve')
    case 'BILL':
      return hasPermission(role as Role, 'bills.approve')
    case 'SALARY_RUN':
      return hasPermission(role as Role, 'salary.approve')
    case 'DPR':
      return hasPermission(role as Role, 'dpr.approve')
    case 'MATERIAL_REQUEST':
      return hasPermission(role as Role, 'materials.approveRequest')
    case 'PURCHASE_ORDER':
      return hasPermission(role as Role, 'purchase.approve')
    case 'VARIATION':
      return hasPermission(role as Role, 'variations.approve')
    case 'DOCUMENT':
      return hasPermission(role as Role, 'documents.approve')
    default:
      return false
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyFilter = session.user.role === 'SUPER_ADMIN' ? {} : { companyId: session.user.companyId }
  const approval = await prisma.approval.findFirst({ where: { id, ...companyFilter } })
  if (!approval) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!verifyCanApproveEntity(session.user.role, approval.entityType)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let reason = ''
  try {
    const body = await request.json()
    if (body.reason) reason = body.reason
  } catch {}

  if (!reason || reason.trim().length < 3) {
    return NextResponse.json({ error: 'Mandatory rejection reason missing (min 3 chars)' }, { status: 400 })
  }

  const updated = await prisma.approval.update({
    where: { id },
    data: { currentStatus: 'REJECTED', rejectedById: session.user.id, rejectedAt: new Date(), rejectionReason: reason },
  })

  await prisma.approvalTimeline.create({
    data: {
      companyId: approval.companyId,
      approvalId: id,
      actorUserId: session.user.id,
      action: 'REJECTED',
      fromStatus: approval.currentStatus,
      toStatus: 'REJECTED',
      note: reason,
    },
  })

  if (approval.entityType === 'EXPENSE' || approval.entityType === 'BILL') {
    await prisma.expense.updateMany({
      where: { id: approval.entityId },
      data: { approvalStatus: 'REJECTED', rejectedById: session.user.id, rejectedAt: new Date(), rejectionNote: reason },
    })
  }

  return NextResponse.json({ success: true, data: updated })
}
