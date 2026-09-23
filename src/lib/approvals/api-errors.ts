import { NextResponse } from 'next/server'

/**
 * Maps a failure thrown by a hardened approval action onto the JSON error contract the
 * approval REST surface has always spoken.
 *
 * The actions stay the single source of truth for *what* is allowed; this only chooses
 * a status code, so a handler can delegate without reimplementing any rule. Every
 * authentication failure collapses onto the documented generic `Unauthorized` body, so
 * a caller cannot tell a revoked membership from an expired session, and an
 * unrecognised failure is reported as a 500 with no internal detail.
 */
export function approvalApiError(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : 'Unknown error'

  if (/^unauthorized/i.test(message)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // The module gate throws plain sentences rather than the prefixed vocabulary used by
  // the actions, so they are matched explicitly instead of collapsing onto a generic 500.
  // Matched ahead of the not-found branch so a disabled module is reported as a denial
  // and not as a missing record.
  if (/module .+ is not enabled|suspended or cancelled|does not belong to a company|company not found/i.test(message)) {
    return NextResponse.json({ error: message }, { status: 403 })
  }
  // Checked before the Forbidden branch: "Forbidden: Site not found or access denied"
  // is a missing record, and the route has always answered 404 for it.
  if (/not found/i.test(message)) {
    return NextResponse.json({ error: message }, { status: 404 })
  }
  if (/^forbidden/i.test(message) || /is not authorized/i.test(message)) {
    return NextResponse.json({ error: message }, { status: 403 })
  }
  if (/already processed|no longer/i.test(message)) {
    return NextResponse.json({ error: message }, { status: 409 })
  }
  if (/^unsupported/i.test(message) || /is mandatory|must exactly match|cannot be empty/i.test(message)) {
    return NextResponse.json({ error: message }, { status: 400 })
  }

  return NextResponse.json({ error: 'Approval request could not be processed' }, { status: 500 })
}
