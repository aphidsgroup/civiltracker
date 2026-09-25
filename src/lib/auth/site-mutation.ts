import type { Prisma } from '@prisma/client'
import { hasPermission } from '@/lib/permissions'
import type { Permission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import type { SessionUser } from '@/types'
import { requireModuleEnabled } from './require-module'
import { requireUser } from './require-user'

export type TenantMutationUser = SessionUser & { companyId: string }

/** One permission, or several of which the live role must hold at least one. */
export type PermissionGrant = Permission | readonly Permission[]

/**
 * Write gate for tenant mutations, run before the action's first read.
 *
 * The principal is the live one from `requireUser`, so a revoked membership, a
 * deactivated account or a suspended company throws here, and a demoted role is judged
 * on its current permissions. The module is checked against the live company.
 * SUPER_ADMIN carries no tenant context and is refused rather than writing into an
 * arbitrary company.
 */
export async function requireTenantMutation(permission: PermissionGrant, moduleName: string): Promise<TenantMutationUser> {
  const grants: readonly Permission[] = typeof permission === 'string' ? [permission] : permission
  const user = await requireUser()
  if (!grants.some((grant) => hasPermission(user.role, grant))) {
    throw new Error(`FORBIDDEN: Missing required permission ${grants.map((grant) => `"${grant}"`).join(' or ')}`)
  }
  if (!user.companyId) {
    throw new Error('FORBIDDEN: Tenant context required')
  }
  await requireModuleEnabled(moduleName)
  return { ...user, companyId: user.companyId }
}

/**
 * `requireTenantMutation`, then binds a URL site id to a site that is not soft deleted
 * and belongs to exactly the live company.
 */
export async function requireSiteMutation(siteId: string, permission: PermissionGrant, moduleName: string) {
  const user = await requireTenantMutation(permission, moduleName)
  const site = await prisma.site.findFirst({
    where: { id: siteId, companyId: user.companyId, deletedAt: null },
    select: { id: true, companyId: true, name: true },
  })
  if (!site) throw new Error('FORBIDDEN: Site not found or access denied')
  return { user, site }
}

/** Field roles, which read and write only the sites they are assigned to. */
const ASSIGNED_SITE_ROLES: ReadonlySet<string> = new Set(['SITE_ENGINEER', 'SUPERVISOR'])

export function readsAssignedSitesOnly(role: string) {
  return ASSIGNED_SITE_ROLES.has(role)
}

/**
 * The sites the principal may act on: live sites of exactly `companyId`, narrowed for a
 * field role to the sites it is the engineer of or that its *active* membership lists.
 */
export async function assignedSiteScope(user: Pick<SessionUser, 'id' | 'role'>, companyId: string): Promise<Prisma.SiteWhereInput> {
  const live = { companyId, deletedAt: null }
  if (!readsAssignedSitesOnly(user.role)) return live

  const member = await prisma.companyMember.findFirst({
    where: { userId: user.id, companyId, isActive: true },
    select: { siteIds: true },
  })
  const siteIds = member?.siteIds ?? []
  return {
    ...live,
    OR: [
      { assignedEngineerId: user.id },
      { engineerId: user.id },
      ...(siteIds.length > 0 ? [{ id: { in: siteIds } }] : []),
    ],
  }
}

/**
 * `requireTenantMutation`, then binds the site id to a live site of exactly the live
 * company that the principal is assigned to (see `assignedSiteScope`).
 */
export async function requireAssignedSiteMutation(siteId: string, permission: PermissionGrant, moduleName: string) {
  const user = await requireTenantMutation(permission, moduleName)
  const site = await prisma.site.findFirst({
    where: { id: siteId, ...(await assignedSiteScope(user, user.companyId)) },
    select: { id: true, companyId: true, name: true },
  })
  if (!site) throw new Error('FORBIDDEN: Site not found or access denied')
  return { user, site }
}

/** A form number that must be finite and non-negative; blank becomes `fallback`. */
export function parseNonNegativeAmount(raw: FormDataEntryValue | null, field: string, fallback: number): number
export function parseNonNegativeAmount(raw: FormDataEntryValue | null, field: string, fallback: null): number | null
export function parseNonNegativeAmount(raw: FormDataEntryValue | null, field: string, fallback: number | null) {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (text === '') return fallback
  const value = Number(text)
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${field}`)
  return value
}

/** A form payment amount that must be finite and strictly positive. */
export function parsePositiveAmount(raw: FormDataEntryValue | null): number {
  const text = typeof raw === 'string' ? raw.trim() : ''
  const value = text === '' ? NaN : Number(text)
  if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid payment amount')
  return value
}

/** A required non-blank form string. */
export function requiredText(raw: FormDataEntryValue | null, field: string): string {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) throw new Error(`${field} is required`)
  return text
}
