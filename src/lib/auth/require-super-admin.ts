import { Role } from '@prisma/client'
import { requireUser } from './require-user'
import type { SessionUser } from '@/types'

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (user.role !== Role.SUPER_ADMIN) {
    throw new Error('FORBIDDEN: Super admin access required')
  }
  return user
}
