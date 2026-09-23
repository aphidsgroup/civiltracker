import { requireUser } from '@/lib/auth/require-user'
import { requireModuleEnabled } from '@/lib/auth/require-module'
import { hasPermission } from '@/lib/permissions'
import type { Permission } from '@/lib/permissions'
import type { SessionUser } from '@/types'

const APPROVALS_MODULE = 'APPROVALS'

/**
 * Entry guard for the approval REST surface.
 *
 * The principal is resolved from the database on every request rather than read off the
 * JWT, so a revoked membership, a deactivated account or a suspended company is refused
 * on the next call instead of at token expiry. Failures are thrown, never returned, so a
 * handler cannot accidentally continue past a denied gate; `approvalApiError` maps them
 * onto the JSON error contract.
 *
 * This is only the surface gate: tenant scope, site binding and the per-entity approve
 * permission stay inside the hardened approval actions.
 */
export async function requireApprovalApiUser(permission: Permission): Promise<SessionUser> {
  const user = await requireUser()

  if (!hasPermission(user.role, permission)) {
    throw new Error(`Forbidden: Missing required permission "${permission}"`)
  }

  await requireModuleEnabled(APPROVALS_MODULE)

  return user
}
