import { requireUser } from '@/lib/auth/require-user'
import { hasPermission } from '@/lib/permissions'
import type { Permission } from '@/lib/permissions'
import type { SessionUser } from '@/types'

const APPROVAL_READ_PERMISSION: Permission = 'approvals.view'

/**
 * Entry guard the approval *read* actions share.
 *
 * `requireUser` only answers "who is this, and which tenant do they belong to", and the
 * company predicate on each query only keeps the rows inside that tenant. Neither says
 * whether the principal may see the approval queue at all. A Server Action is a public
 * POST endpoint, so without this gate an active member of the same company whose role
 * carries no `approvals.view` — VENDOR, SUBCONTRACTOR, CLIENT, SUPERVISOR — could invoke
 * the list, stats and detail actions directly and enumerate approval rows, pipeline
 * totals, comment threads, timelines and linked bill attachment URLs that the UI would
 * never route them to.
 *
 * The role is taken from the `requireUser` principal, which is re-resolved from the
 * database on every call, so a revoked membership or a demoted role is refused on the
 * next invocation instead of at token expiry — never from the JWT claim or a UI hint.
 *
 * The refusal is thrown, never returned, and lands before any Prisma query, so it cannot
 * be told apart from a lookup that was never attempted: no row, count or existence fact
 * leaks out of a denied read.
 *
 * This is only the read gate. Tenant scope, the malformed site-binding filter and the
 * per-entity approve permission stay where they already live in the approval actions.
 */
export async function requireApprovalReader(): Promise<SessionUser> {
  const user = await requireUser()

  if (!hasPermission(user.role, APPROVAL_READ_PERMISSION)) {
    throw new Error(`Forbidden: Missing required permission "${APPROVAL_READ_PERMISSION}"`)
  }

  return user
}
