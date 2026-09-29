export const BILL_APPROVE_CONFIRM_TEXT = 'APPROVE'

export type BillAction = 'approve' | 'reject'

/** The approve action is only armed once the user has typed the token exactly. */
export function isBillApproveConfirmed(typed: string): boolean {
  return typed === BILL_APPROVE_CONFIRM_TEXT
}

/**
 * Posts a bill decision to the legacy expenses endpoint.
 *
 * An approve request carries the user's own typed confirmation verbatim as
 * `{ confirmationText }`; nothing here supplies the token on the user's behalf. When the
 * typed value does not match, no request is sent and `null` is returned. Reject keeps its
 * bodyless POST.
 */
export async function submitBillAction(
  id: string,
  action: BillAction,
  confirmationText?: string,
  fetchImpl: typeof fetch = fetch
): Promise<Response | null> {
  const url = `/api/expenses/${id}/${action}`

  if (action === 'reject') return fetchImpl(url, { method: 'POST' })

  if (confirmationText === undefined || !isBillApproveConfirmed(confirmationText)) return null

  return fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmationText }),
  })
}
