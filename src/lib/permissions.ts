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

export type Permission =
  | 'company.manage'
  | 'company.view'
  | 'sites.view'
  | 'sites.create'
  | 'sites.update'
  | 'sites.delete'
  | 'expenses.view'
  | 'expenses.create'
  | 'expenses.update'
  | 'expenses.approve'
  | 'expenses.reject'
  | 'bills.view'
  | 'bills.upload'
  | 'bills.approve'
  | 'bills.reject'
  | 'labour.view'
  | 'labour.manage'
  | 'attendance.mark'
  | 'salary.view'
  | 'salary.generate'
  | 'salary.approve'
  | 'salary.markPaid'
  | 'materials.view'
  | 'materials.create'
  | 'materials.update'
  | 'materials.approveRequest'
  | 'dpr.view'
  | 'dpr.create'
  | 'dpr.update'
  | 'dpr.approve'
  | 'tasks.manage'
  | 'reports.view'
  | 'reports.finance'
  | 'reports.project'
  | 'clientPortal.view'
  | 'clientPortal.manage'
  | 'documents.view'
  | 'documents.upload'
  | 'documents.approve'
  | 'uploads.sign'
  | 'uploads.saveMetadata'
  | 'sitePhotos.upload'
  | 'issues.create'
  | 'vendors.view'
  | 'payments.view'
  | 'payments.manage'
  | 'purchase.approve'
  | 'variations.approve'
  | 'approvals.view'

const ALL_PERMISSIONS: Permission[] = [
  'company.manage', 'company.view',
  'sites.view', 'sites.create', 'sites.update', 'sites.delete',
  'expenses.view', 'expenses.create', 'expenses.update', 'expenses.approve', 'expenses.reject',
  'bills.view', 'bills.upload', 'bills.approve', 'bills.reject',
  'labour.view', 'labour.manage', 'attendance.mark',
  'salary.view', 'salary.generate', 'salary.approve', 'salary.markPaid',
  'materials.view', 'materials.create', 'materials.update', 'materials.approveRequest',
  'dpr.view', 'dpr.create', 'dpr.update', 'dpr.approve',
  'tasks.manage',
  'reports.view', 'reports.finance', 'reports.project',
  'clientPortal.view', 'clientPortal.manage',
  'documents.view', 'documents.upload', 'documents.approve',
  'uploads.sign', 'uploads.saveMetadata',
  'sitePhotos.upload', 'issues.create',
  'vendors.view', 'payments.view', 'payments.manage',
  'purchase.approve', 'variations.approve', 'approvals.view'
]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  COMPANY_ADMIN: ALL_PERMISSIONS,
  PROJECT_MANAGER: [
    'company.view',
    'sites.view', 'sites.update',
    'expenses.view', 'expenses.create',
    'bills.view', 'bills.upload',
    'labour.view', 'attendance.mark',
    'materials.view', 'materials.create',
    'dpr.view', 'dpr.create', 'dpr.update', 'dpr.approve',
    'tasks.manage',
    'reports.view', 'reports.project',
    'documents.view', 'documents.upload', 'documents.approve',
    'purchase.approve', 'variations.approve', 'approvals.view',
    'uploads.sign', 'uploads.saveMetadata'
  ],
  ACCOUNTANT: [
    'company.view',
    'expenses.view', 'expenses.approve', 'expenses.reject',
    'bills.view', 'bills.approve', 'bills.reject',
    'salary.view', 'salary.generate', 'salary.approve', 'salary.markPaid',
    'vendors.view', 'payments.view', 'payments.manage',
    'reports.view', 'reports.finance',
    'documents.view', 'documents.approve',
    'approvals.view',
    'uploads.sign', 'uploads.saveMetadata'
  ],
  SITE_ENGINEER: [
    'sites.view',
    'expenses.create',
    'bills.upload',
    'attendance.mark',
    'dpr.view', 'dpr.create',
    'sitePhotos.upload',
    'materials.view', 'materials.create',
    'issues.create',
    'documents.view', 'documents.upload',
    'approvals.view',
    'uploads.sign', 'uploads.saveMetadata'
  ],
  SUPERVISOR: [
    'sites.view',
    'attendance.mark',
    'dpr.view', 'dpr.create',
    'sitePhotos.upload',
    'materials.view', 'materials.create',
    'uploads.sign', 'uploads.saveMetadata'
  ],
  PURCHASE_MANAGER: [
    'company.view',
    'materials.view', 'materials.create', 'materials.update', 'materials.approveRequest',
    'bills.view', 'bills.upload',
    'vendors.view',
    'purchase.approve', 'approvals.view',
    'uploads.sign', 'uploads.saveMetadata'
  ],
  CLIENT: [
    'clientPortal.view'
  ],
  VENDOR: [
    'bills.upload',
    'uploads.sign'
  ],
  SUBCONTRACTOR: [
    'attendance.mark'
  ],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  if (role === Role.SUPER_ADMIN) return true
  const perms = ROLE_PERMISSIONS[role] || []
  return perms.includes(permission)
}

export function canApprove(role: Role): boolean {
  return (
    hasPermission(role, 'expenses.approve') ||
    hasPermission(role, 'bills.approve') ||
    hasPermission(role, 'salary.approve') ||
    hasPermission(role, 'dpr.approve') ||
    hasPermission(role, 'materials.approveRequest') ||
    hasPermission(role, 'purchase.approve') ||
    hasPermission(role, 'variations.approve') ||
    hasPermission(role, 'documents.approve')
  )
}

export function canUpload(role: Role): boolean {
  return hasPermission(role, 'bills.upload') || hasPermission(role, 'documents.upload') || hasPermission(role, 'sitePhotos.upload') || hasPermission(role, 'uploads.sign')
}

export function canAccessSuperAdmin(role: Role): boolean {
  return role === Role.SUPER_ADMIN
}

export function canManageCompany(role: Role): boolean {
  return hasPermission(role, 'company.manage') || role === Role.SUPER_ADMIN
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
