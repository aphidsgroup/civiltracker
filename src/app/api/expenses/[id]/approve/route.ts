import { NextResponse } from 'next/server'
import { approveApprovalAction } from '@/actions/approvals'
import { approvalApiError } from '@/lib/approvals/api-errors'
import { requireApprovalApiUser } from '@/lib/approvals/api-guard'
import { resolveExpenseApprovalId } from '@/lib/approvals/expense-approval-link'

/**
 * Legacy bills endpoint. It addresses an expense id, so it derives the approval id from a
 * company- and site-exact lookup for that expense and then delegates the decision to the
 * hardened action — it no longer runs an approval workflow of its own.
 *
 * The action demands an explicit confirmation token so a single UI click cannot approve by
 * accident. A REST caller has no such surface — the POST is itself the explicit intent —
 * so the token is supplied here. It is a misclick guard, not an authorization control.
 */
const API_APPROVE_CONFIRMATION = 'APPROVE'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const user = await requireApprovalApiUser('expenses.approve', 'EXPENSES')

    // The bills UI posts without a body, so an unparseable request is not a failure.
    let note: string | undefined
    try {
      const body = await request.json()
      if (typeof body?.note === 'string' && body.note.trim()) note = body.note
    } catch {}

    const approvalId = await resolveExpenseApprovalId(id, user)
    await approveApprovalAction(approvalId, note, API_APPROVE_CONFIRMATION)

    return NextResponse.json({ success: true })
  } catch (error) {
    return approvalApiError(error)
  }
}
