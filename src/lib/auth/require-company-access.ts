import { Role } from '@prisma/client'
import { requireUser } from './require-user'
import { SessionUser } from '@/types'

export async function requireCompanyAccess(targetCompanyId: string): Promise<SessionUser> {
  const user = await requireUser()
  if (user.role === Role.SUPER_ADMIN) {
    return user
  }
  if (!user.companyId || user.companyId !== targetCompanyId) {
    throw new Error('FORBIDDEN: Tenant data access violation')
  }
  return user
}

export async function getCurrentCompanyId(): Promise<string> {
  const user = await requireUser()
  if (!user.companyId && user.role !== Role.SUPER_ADMIN) {
    throw new Error('UNAUTHORIZED: No active company context')
  }
  return user.companyId || ''
}
