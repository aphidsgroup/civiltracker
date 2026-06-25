import { Permission, hasPermission } from '@/lib/permissions'
import { requireUser } from './require-user'
import type { SessionUser } from '@/types'

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser()
  if (!hasPermission(user.role, permission)) {
    throw new Error(`FORBIDDEN: Missing required permission "${permission}"`)
  }
  return user
}
