import { Role } from '@prisma/client'
import { requireUser } from './require-user'
import { SessionUser } from '@/types'

export async function requireRole(allowedRoles: Role[]): Promise<SessionUser> {
  const user = await requireUser()
  if (!allowedRoles.includes(user.role) && user.role !== Role.SUPER_ADMIN) {
    throw new Error(`FORBIDDEN: Requires role ${allowedRoles.join(' or ')}`)
  }
  return user
}

function getRole(arg: Role | { role: Role } | undefined | null): Role | undefined {
  if (!arg) return undefined
  if (typeof arg === 'string') return arg as Role
  return arg.role
}

export function isSuperAdmin(arg?: Role | { role: Role } | null): boolean {
  return getRole(arg) === Role.SUPER_ADMIN
}

export function isCompanyAdmin(arg?: Role | { role: Role } | null): boolean {
  return getRole(arg) === Role.COMPANY_ADMIN
}

export function isAccountant(arg?: Role | { role: Role } | null): boolean {
  return getRole(arg) === Role.ACCOUNTANT
}

export function isSiteEngineer(arg?: Role | { role: Role } | null): boolean {
  return getRole(arg) === Role.SITE_ENGINEER
}

export function isClient(arg?: Role | { role: Role } | null): boolean {
  return getRole(arg) === Role.CLIENT
}
