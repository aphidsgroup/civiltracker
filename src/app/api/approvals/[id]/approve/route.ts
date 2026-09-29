import { NextResponse } from 'next/server'
import { approveApprovalAction } from '@/actions/approvals'
import { approvalApiError } from '@/lib/approvals/api-errors'
import { parseApproveRequestBody } from '@/lib/approvals/api-approve-body'
import { requireApprovalApiUser } from '@/lib/approvals/api-guard'

/**
 * The caller must send `{ "confirmationText": "APPROVE" }`. The handler does not supply
 * the token on the caller's behalf; the live principal, the tenant scope, the site
 * binding, the per-entity approve permission, the confirmation match and the atomic
 * transition all stay in the action.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    await requireApprovalApiUser('approvals.view')

    const parsed = await parseApproveRequestBody(request)
    if (!parsed.ok) return parsed.response
    const { note, confirmationText } = parsed.body

    const updated = await approveApprovalAction(id, note, confirmationText)

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    return approvalApiError(error)
  }
}
