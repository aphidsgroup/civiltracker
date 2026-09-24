import { NextResponse } from 'next/server'
import { approvalApiError } from '@/lib/approvals/api-errors'
import { requireApprovalApiUser } from '@/lib/approvals/api-guard'
import {
  APPROVAL_DETAIL_NOT_FOUND,
  resolveEntityBoundApprovalDetail,
} from '@/lib/approvals/detail'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const user = await requireApprovalApiUser('approvals.view')

    // A missing approval, a malformed row and an approval whose linked entity is
    // unreachable inside its own company/site all answer identically, so a reader
    // cannot tell an unreadable approval apart from a missing one.
    const detail = await resolveEntityBoundApprovalDetail(user, id)
    if (detail.status !== 'found') {
      return NextResponse.json({ error: APPROVAL_DETAIL_NOT_FOUND }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: detail.approval })
  } catch (error) {
    return approvalApiError(error)
  }
}
