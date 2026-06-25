import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import type { ApprovalEntityType, ApprovalPriority, ApprovalStatus } from '@prisma/client'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const entityType = searchParams.get('entityType')

  const companyFilter = session.user.role === 'SUPER_ADMIN' ? {} : { companyId: session.user.companyId }
  const where: Record<string, unknown> = { ...companyFilter, deletedAt: null }

  if (status && status !== 'ALL') where.currentStatus = status as ApprovalStatus
  if (entityType && entityType !== 'ALL') where.entityType = entityType as ApprovalEntityType

  const approvals = await prisma.approval.findMany({
    where,
    include: {
      site: { select: { name: true } },
      requestedBy: { select: { name: true, email: true, avatar: true } },
      approvedBy: { select: { name: true } },
      rejectedBy: { select: { name: true } },
    },
    orderBy: { submittedAt: 'desc' },
  })

  return NextResponse.json({ success: true, data: approvals })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { entityType, entityId, title, amount, description, priority, siteId } = body

  if (!entityType || !entityId || !title) {
    return NextResponse.json({ error: 'Missing mandatory fields' }, { status: 400 })
  }

  const companyId = session.user.companyId || (session.user.role === 'SUPER_ADMIN' ? 'cm7companyadmin00000000001' : null)
  if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 })

  const approval = await prisma.approval.create({
    data: {
      companyId,
      siteId: siteId || null,
      entityType: entityType as ApprovalEntityType,
      entityId,
      title,
      amount: amount ? amount : null,
      description: description || null,
      priority: (priority as ApprovalPriority) || 'NORMAL',
      requestedById: session.user.id,
      currentStatus: 'PENDING',
    },
  })

  await prisma.approvalTimeline.create({
    data: {
      companyId,
      approvalId: approval.id,
      actorUserId: session.user.id,
      action: 'SUBMITTED',
      toStatus: 'PENDING',
      note: 'API request submitted',
    },
  })

  return NextResponse.json({ success: true, data: approval })
}
