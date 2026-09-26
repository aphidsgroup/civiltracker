import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { getRoleRedirect } from '@/lib/permissions'
import type { SessionUser } from '@/types'

/**
 * Read gate for the super-admin layout and every super-admin page, run before the first
 * query.
 *
 * The principal is the live one from `requireUser`, never the JWT role claim: a stale,
 * deactivated or missing session goes to `/login`, and a principal whose live role is no
 * longer SUPER_ADMIN goes to its own home. The layout and its pages render in parallel,
 * so each of them must call this rather than rely on the layout alone.
 */
export async function requireSuperAdminPage(): Promise<SessionUser> {
  const user = await requireUser().catch(() => null)
  if (!user) redirect('/login')
  if (user.role !== 'SUPER_ADMIN') redirect(getRoleRedirect(user.role))
  return user
}
