import { NextResponse } from 'next/server'
import { rejectApprovalAction } from '@/actions/approvals'
import { approvalApiError } from '@/lib/approvals/api-errors'
import { requireApprovalApiUser } from '@/lib/approvals/api-guard'
import { resolveExpenseApprovalId } from '@/lib/approvals/expense-approval-link'

/**
 * Legacy bills endpoint, the rejection counterpart of the approve handler: the approval id
 * is derived from a company- and site-exact lookup for the expense, and the transition,
 * the linked expense write, the timeline entry and the audit record all stay inside the
 * hardened action.
 */

/** The rationale this endpoint has always recorded when the caller supplies none. */
const LEGACY_REJECTION_REASON = 'Rejected via Bills page'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const user = await requireApprovalApiUser('expenses.reject', 'EXPENSES')

    // The bills UI posts without a body, so an unparseable request is not a failure.
    let reason = LEGACY_REJECTION_REASON
    try {
      const body = await request.json()
      if (typeof body?.reason === 'string' && body.reason.trim()) reason = body.reason
    } catch {}

    const approvalId = await resolveExpenseApprovalId(id, user)
    await rejectApprovalAction(approvalId, reason)

    return NextResponse.json({ success: true })
  } catch (error) {
    return approvalApiError(error)
  }
}
