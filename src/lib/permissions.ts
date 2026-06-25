import { Role } from '@prisma/client'

export const ROLE_HIERARCHY: Record<Role, number> = {
  SUPER_ADMIN: 100,
  COMPANY_ADMIN: 90,
  PROJECT_MANAGER: 70,
  ACCOUNTANT: 60,
  PURCHASE_MANAGER: 55,
  SUPERVISOR: 50,
  SITE_ENGINEER: 40,
  CLIENT: 20,
  VENDOR: 10,
  SUBCONTRACTOR: 10,
}

const APPROVER_ROLES: Role[] = [Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.ACCOUNTANT, Role.PROJECT_MANAGER]
const NON_UPLOAD_ROLES: Role[] = [Role.CLIENT, Role.VENDOR]
const COMPANY_MGMT_ROLES: Role[] = [Role.SUPER_ADMIN, Role.COMPANY_ADMIN]

export function canApprove(role: Role): boolean {
  return APPROVER_ROLES.includes(role)
}

export function canUpload(role: Role): boolean {
  return !NON_UPLOAD_ROLES.includes(role)
}

export function canAccessSuperAdmin(role: Role): boolean {
  return role === Role.SUPER_ADMIN
}

export function canManageCompany(role: Role): boolean {
  return COMPANY_MGMT_ROLES.includes(role)
}

export function getRoleRedirect(role: Role, _companyId?: string): string {
  switch (role) {
    case Role.SUPER_ADMIN:
      return '/super-admin/dashboard'
    case Role.COMPANY_ADMIN:
    case Role.PROJECT_MANAGER:
    case Role.ACCOUNTANT:
    case Role.PURCHASE_MANAGER:
      return '/dashboard'
    case Role.SITE_ENGINEER:
    case Role.SUPERVISOR:
      return '/mobile/home'
    case Role.CLIENT:
      return '/client-portal'
    default:
      return '/dashboard'
  }
}
