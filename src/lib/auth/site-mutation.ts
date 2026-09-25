import type { Permission } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import type { SessionUser } from '@/types'
import { requireModuleEnabled } from './require-module'
import { requirePermission } from './require-permission'

export type TenantMutationUser = SessionUser & { companyId: string }

/**
 * Write gate for tenant mutations, run before the action's first read.
 *
 * The principal is the live one from `requireUser` (via `requirePermission`), so a revoked
 * membership, a deactivated account or a suspended company throws here, and a demoted
 * role is judged on its current permissions. The module is checked against the live
 * company. SUPER_ADMIN carries no tenant context and is refused rather than writing into
 * an arbitrary company.
 */
export async function requireTenantMutation(permission: Permission, moduleName: string): Promise<TenantMutationUser> {
  const user = await requirePermission(permission)
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
export async function requireSiteMutation(siteId: string, permission: Permission, moduleName: string) {
  const user = await requireTenantMutation(permission, moduleName)
  const site = await prisma.site.findFirst({
    where: { id: siteId, companyId: user.companyId, deletedAt: null },
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
