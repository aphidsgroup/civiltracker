import { notFound, redirect } from 'next/navigation'
import type { Prisma } from '@prisma/client'
import { requireUser } from '@/lib/auth/require-user'
import { isModuleEnabled } from '@/lib/auth/require-module'
import { getRoleRedirect, hasPermission } from '@/lib/permissions'
import type { Permission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import type { SessionUser } from '@/types'

/**
 * One way into a page: a permission, and optionally the company module that permission
 * reads from. A grant only opens the page when the live role holds the permission *and*
 * its own module is enabled, so a module switched on for one grant never opens another.
 */
export type TenantPageGrant = {
  permission: Permission
  module?: string
}

export type TenantPageGate = {
  grants: TenantPageGrant[]
}

export type TenantPageAccess = {
  user: SessionUser & { companyId: string }
  companyId: string
  /** Live-role permission check, for gating each section a page renders. */
  can: (permission: Permission) => boolean
  /** Company module check against the modules loaded once by the gate. */
  moduleEnabled: (moduleName: string) => boolean
}

export type TenantPageDenial = { status: 'denied'; redirectTo: string }

export type TenantPageResult = { status: 'ok'; access: TenantPageAccess } | TenantPageDenial

function denied(redirectTo: string): TenantPageDenial {
  return { status: 'denied', redirectTo }
}

/**
 * Read gate for tenant pages, run before the page's first data query.
 *
 * The principal is always the live one from `requireUser`, never the JWT claims, so a
 * revoked membership, a deactivated account or a suspended company throws here, and a
 * demoted role is judged on its current permissions. The permission is decided on the
 * live role before any query; the company modules are loaded only for a principal that
 * already holds one of the permissions, and a denial is returned before any page data is
 * read.
 *
 * SUPER_ADMIN carries no tenant context, so a tenant page turns it away to the platform
 * dashboard instead of reading any company's data.
 */
export async function resolveTenantPageAccess(gate: TenantPageGate): Promise<TenantPageResult> {
  const user = await requireUser()
  if (user.role === 'SUPER_ADMIN') return denied('/super-admin/dashboard')
  if (!user.companyId) return denied('/login')

  const can = (permission: Permission) => hasPermission(user.role, permission)
  const held = gate.grants.filter((grant) => can(grant.permission))
  if (held.length === 0) return denied(getRoleRedirect(user.role))

  const companyId = user.companyId
  const company = await prisma.company.findFirst({
    where: { id: companyId, deletedAt: null },
    select: { modulesJson: true },
  })
  if (!company) return denied('/login')

  const moduleEnabled = (moduleName: string) => isModuleEnabled(company.modulesJson, moduleName)
  if (!held.some((grant) => !grant.module || moduleEnabled(grant.module))) {
    return denied(getRoleRedirect(user.role))
  }

  return { status: 'ok', access: { user: { ...user, companyId }, companyId, can, moduleEnabled } }
}

/**
 * Leaves a denied page. A denial that would send the page back onto itself — a role whose
 * home is the page it may not read — answers not found instead of looping.
 */
export function exitDeniedPage(denial: TenantPageDenial, currentPath: string): never {
  if (denial.redirectTo === currentPath) notFound()
  redirect(denial.redirectTo)
}

/**
 * The site binding every tenant page read carries: a site that is not soft deleted and
 * belongs to exactly the principal's company.
 */
export function liveCompanySiteWhere(companyId: string): Prisma.SiteWhereInput {
  return { companyId, deletedAt: null }
}

/** Field roles, which read only the sites they are assigned to. */
const ASSIGNED_SITE_ROLES: ReadonlySet<string> = new Set(['SITE_ENGINEER', 'SUPERVISOR'])

export function readsAssignedSitesOnly(role: string) {
  return ASSIGNED_SITE_ROLES.has(role)
}

/**
 * The sites a page may show the principal: `liveCompanySiteWhere`, narrowed for a field
 * role to the sites it is the engineer of or that its *active* membership lists. Call it
 * only after the page gate; list and detail pages share it so a site a field role cannot
 * see in the list cannot be opened by id either.
 */
export async function assignedSiteWhere(access: TenantPageAccess): Promise<Prisma.SiteWhereInput> {
  const live = liveCompanySiteWhere(access.companyId)
  if (!readsAssignedSitesOnly(access.user.role)) return live

  const member = await prisma.companyMember.findFirst({
    where: { userId: access.user.id, companyId: access.companyId, isActive: true },
    select: { siteIds: true },
  })
  const siteIds = member?.siteIds ?? []
  return {
    ...live,
    OR: [
      { assignedEngineerId: access.user.id },
      { engineerId: access.user.id },
      ...(siteIds.length > 0 ? [{ id: { in: siteIds } }] : []),
    ],
  }
}

/** Bounded, validated page size from a `?limit=` search param. */
export function parsePageSize(limit: string | undefined, fallback = 50, max = 500) {
  const parsed = limit ? Number.parseInt(limit, 10) : fallback
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}
