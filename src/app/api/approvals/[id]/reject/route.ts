import { NextResponse } from 'next/server'
import { rejectApprovalAction } from '@/actions/approvals'
import { approvalApiError } from '@/lib/approvals/api-errors'
import { requireApprovalApiUser } from '@/lib/approvals/api-guard'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    await requireApprovalApiUser('approvals.view')

    let reason = ''
    try {
      const body = await request.json()
      if (typeof body?.reason === 'string') reason = body.reason
    } catch {}

    // The mandatory rationale, the tenant-scoped lookup, the site-binding guard and the
    // atomic transition that moves the linked entity with the rejection all belong to the
    // action — the handler only carries the payload across.
    const updated = await rejectApprovalAction(id, reason)

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    return approvalApiError(error)
  }
}
