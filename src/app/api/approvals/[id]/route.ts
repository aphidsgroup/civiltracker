import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { ensureCompanyContext, requireApiPermission } from '@/lib/auth/require-api-permission'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const authResult = await requireApiPermission('approvals.view', 'APPROVALS')
  if (authResult instanceof NextResponse) return authResult

  const companyContextError = ensureCompanyContext(authResult)
  if (companyContextError) return companyContextError

  const companyFilter = authResult.role === 'SUPER_ADMIN' ? {} : { companyId: authResult.companyId }

  const approval = await prisma.approval.findFirst({
    where: { id, ...companyFilter, deletedAt: null },
    include: {
      site: { select: { name: true, location: true } },
      requestedBy: { select: { name: true, email: true, role: true, avatar: true } },
      reviewedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      rejectedBy: { select: { name: true } },
      comments: {
        include: { user: { select: { name: true, avatar: true, role: true } } },
        orderBy: { createdAt: 'asc' },
      },
      timelines: {
        include: { actor: { select: { name: true, role: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!approval) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ success: true, data: approval })
}
