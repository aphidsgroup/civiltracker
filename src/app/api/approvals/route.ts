import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import type { ApprovalEntityType, ApprovalPriority, ApprovalStatus } from '@prisma/client'
import { ensureCompanyContext, requireApiPermission } from '@/lib/auth/require-api-permission'

function validateApprovalEntityType(entityType: ApprovalEntityType, userRole: string): boolean {
  if (userRole === 'SUPER_ADMIN' || userRole === 'COMPANY_ADMIN') return true

  return ['EXPENSE', 'BILL', 'SALARY_RUN', 'DPR', 'MATERIAL_REQUEST', 'PURCHASE_ORDER', 'VARIATION', 'DOCUMENT'].includes(entityType)
}

export async function GET(request: Request) {
  const authResult = await requireApiPermission('approvals.view', 'APPROVALS')
  if (authResult instanceof NextResponse) return authResult

  const companyContextError = ensureCompanyContext(authResult)
  if (companyContextError) return companyContextError

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const entityType = searchParams.get('entityType')

  const companyFilter = authResult.role === 'SUPER_ADMIN' ? {} : { companyId: authResult.companyId }
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
  const authResult = await requireApiPermission('approvals.view', 'APPROVALS')
  if (authResult instanceof NextResponse) return authResult

  const companyContextError = ensureCompanyContext(authResult)
  if (companyContextError) return companyContextError

  const body = await request.json()
  const { entityType, entityId, title, amount, description, priority, siteId } = body

  if (!entityType || !entityId || !title) {
    return NextResponse.json({ error: 'Missing mandatory fields' }, { status: 400 })
  }

  if (!validateApprovalEntityType(entityType as ApprovalEntityType, authResult.role)) {
    return NextResponse.json({ error: 'Unsupported approval entity type for this role' }, { status: 403 })
  }

  const site = siteId
    ? await prisma.site.findFirst({
        where: {
          id: siteId,
          ...(authResult.role === 'SUPER_ADMIN' ? {} : { companyId: authResult.companyId }),
          deletedAt: null,
        },
        select: { id: true, companyId: true },
      })
    : null

  if (siteId && !site) {
    return NextResponse.json({ error: 'Forbidden: Site not found or access denied' }, { status: 404 })
  }

  const companyId = site?.companyId ?? authResult.companyId
  if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 })

  const approval = await prisma.approval.create({
    data: {
      companyId,
      siteId: site?.id ?? null,
      entityType: entityType as ApprovalEntityType,
      entityId,
      title,
      amount: amount ? amount : null,
      description: description || null,
      priority: (priority as ApprovalPriority) || 'NORMAL',
      requestedById: authResult.id,
      currentStatus: 'PENDING',
    },
  })

  await prisma.approvalTimeline.create({
    data: {
      companyId,
      approvalId: approval.id,
      actorUserId: authResult.id,
      action: 'SUBMITTED',
      toStatus: 'PENDING',
      note: 'API request submitted',
    },
  })

  return NextResponse.json({ success: true, data: approval })
}
