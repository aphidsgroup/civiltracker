import { NextResponse } from 'next/server'

export type ApproveRequestBody = {
  confirmationText: string
  note?: string
}

/**
 * Reads the JSON body of a REST approve request.
 *
 * The approve action demands an explicit confirmation token so a request cannot approve
 * by accident, and a REST caller must supply that token itself: the handler never injects
 * a default. An absent, unparseable or non-object body, or one without a string
 * `confirmationText`, is refused here with a generic 400 before the action is reached.
 * The supplied value is passed through verbatim — whether it matches is decided by the
 * action, which stays the confirmation authority alongside every authorization, tenant
 * and state rule.
 */
export async function parseApproveRequestBody(
  request: Request
): Promise<{ ok: true; body: ApproveRequestBody } | { ok: false; response: NextResponse }> {
  const refused = {
    ok: false as const,
    response: NextResponse.json({ error: 'Approval confirmation is required' }, { status: 400 }),
  }

  let parsed: unknown
  try {
    const raw = await request.text()
    if (!raw.trim()) return refused
    parsed = JSON.parse(raw)
  } catch {
    return refused
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return refused

  const { confirmationText, note } = parsed as Record<string, unknown>
  if (typeof confirmationText !== 'string') return refused

  return {
    ok: true,
    body: {
      confirmationText,
      note: typeof note === 'string' && note.trim() ? note : undefined,
    },
  }
}
