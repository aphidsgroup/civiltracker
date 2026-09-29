import { NextResponse } from 'next/server'
import { approveApprovalAction } from '@/actions/approvals'
import { approvalApiError } from '@/lib/approvals/api-errors'
import { parseApproveRequestBody } from '@/lib/approvals/api-approve-body'
import { requireApprovalApiUser } from '@/lib/approvals/api-guard'
import { resolveExpenseApprovalId } from '@/lib/approvals/expense-approval-link'

/**
 * Legacy bills endpoint. It addresses an expense id, so it derives the approval id from a
 * company- and site-exact lookup for that expense and then delegates the decision to the
 * hardened action — it no longer runs an approval workflow of its own.
 *
 * The caller must send `{ "confirmationText": "APPROVE" }`. The handler does not supply
 * the token on the caller's behalf; the action decides whether it matches.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const user = await requireApprovalApiUser('expenses.approve', 'EXPENSES')

    const parsed = await parseApproveRequestBody(request)
    if (!parsed.ok) return parsed.response
    const { note, confirmationText } = parsed.body

    const approvalId = await resolveExpenseApprovalId(id, user)
    await approveApprovalAction(approvalId, note, confirmationText)

    return NextResponse.json({ success: true })
  } catch (error) {
    return approvalApiError(error)
  }
}
