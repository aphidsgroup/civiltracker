import { NextResponse } from 'next/server'
import { approveApprovalAction } from '@/actions/approvals'
import { approvalApiError } from '@/lib/approvals/api-errors'
import { requireApprovalApiUser } from '@/lib/approvals/api-guard'

/**
 * The action demands an explicit confirmation token so a single UI click cannot approve
 * by accident. A REST caller has no such surface — the POST to this endpoint is itself
 * the explicit intent — so the token is supplied here. It is a misclick guard, not an
 * authorization control: the live principal, the tenant scope, the site binding, the
 * per-entity approve permission and the atomic transition all stay in the action.
 */
const API_APPROVE_CONFIRMATION = 'APPROVE'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    await requireApprovalApiUser('approvals.view')

    let note: string | undefined
    try {
      const body = await request.json()
      if (typeof body?.note === 'string' && body.note.trim()) note = body.note
    } catch {}

    const updated = await approveApprovalAction(id, note, API_APPROVE_CONFIRMATION)

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    return approvalApiError(error)
  }
}
