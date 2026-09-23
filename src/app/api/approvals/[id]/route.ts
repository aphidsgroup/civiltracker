import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { approvalApiError } from '@/lib/approvals/api-errors'
import { requireApprovalApiUser } from '@/lib/approvals/api-guard'
import {
  hasValidApprovalSiteBinding,
  WELL_FORMED_APPROVAL_SITE_FILTER,
} from '@/lib/approvals/site-binding'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const user = await requireApprovalApiUser('approvals.view')
    const companyFilter = user.role === 'SUPER_ADMIN' ? {} : { companyId: user.companyId! }

    const approval = await prisma.approval.findFirst({
      where: {
        id,
        ...companyFilter,
        deletedAt: null,
        // A site-bound approval without a site is excluded by the query itself: it can
        // never be actioned, so it must not be detailed either.
        ...WELL_FORMED_APPROVAL_SITE_FILTER,
      },
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

    // The guard repeats the rule for a malformed row that reaches the handler anyway, and
    // answers exactly as it would for a row that does not exist, so a reader cannot tell
    // an unreadable approval apart from a missing one.
    if (!approval || !hasValidApprovalSiteBinding(approval)) {
      return NextResponse.json({ error: 'Approval not found or access denied' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: approval })
  } catch (error) {
    return approvalApiError(error)
  }
}
