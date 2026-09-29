import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { getRoleRedirect } from '@/lib/permissions'

export default async function HomePage() {
  // The live role picks the home, never the JWT role claim; a principal that cannot be
  // resolved (revoked, deactivated, suspended company) goes to /login.
  const user = await requireUser().catch(() => null)
  if (!user) redirect('/login')
  redirect(getRoleRedirect(user.role))
}
