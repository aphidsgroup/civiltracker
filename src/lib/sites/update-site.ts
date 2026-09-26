import type { Prisma, SiteStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { auditLogData } from '@/lib/audit-data'
import type { TenantMutationUser } from '@/lib/auth/site-mutation'
import { assertActiveCompanyAssignees } from '@/lib/sites/create-site'
import { SITE_FORM_EDITABLE_STATUSES } from '@/lib/validation/sites'
import type { UpdateSiteInput } from '@/lib/validation/sites'

/*
 * The audited site-update write path. Deliberately not a `'use server'` module: it trusts
 * its caller to have run the `sites.update` + SITES gate (`requireAssignedScopeMutation`)
 * and validated the payload with `@/lib/validation/sites`, so it must never be exposed
 * as an endpoint.
 */

const SITE_NOT_FOUND = 'FORBIDDEN: Site not found or access denied'

/** Every column the update may change, read before the write for the audit `before`. */
const SITE_AUDIT_SELECT = {
  id: true,
  name: true,
  location: true,
  address: true,
  clientName: true,
  clientPhone: true,
  clientEmail: true,
  mapLink: true,
  projectType: true,
  contractType: true,
  areaSqft: true,
  floors: true,
  budget: true,
  contractValue: true,
  startDate: true,
  targetEndDate: true,
  assignedPmId: true,
  assignedEngineerId: true,
  status: true,
} satisfies Prisma.SiteSelect

type SiteChanges = UpdateSiteInput & { status?: SiteStatus }

/** A column value as it should appear in the audit JSON: dates as ISO, decimals as numbers. */
function auditValue(value: unknown) {
  if (value instanceof Date) return value.toISOString()
  if (value !== null && typeof value === 'object') return Number(value)
  return value ?? null
}

function auditSnapshot(source: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, auditValue(source[key])]))
}

/**
 * Updates a validated site of `user`'s live company inside `scope` (the principal's
 * assigned-site scope). The site is re-read on the transaction client, a date sent on its
 * own must stay in order with the stored other date, a status outside
 * `SITE_FORM_EDITABLE_STATUSES` may only be posted back unchanged, and assignees must be
 * active members of the live company. The guarded write and the required audit record
 * share the transaction, so an audit failure rolls the update back.
 */
export async function updateSiteForTenant(
  user: TenantMutationUser,
  siteId: string,
  scope: Prisma.SiteWhereInput,
  data: UpdateSiteInput,
  status?: SiteStatus,
) {
  return prisma.$transaction(async (tx) => {
    const stored = await tx.site.findFirst({
      where: { ...scope, id: siteId, companyId: user.companyId, deletedAt: null },
      select: SITE_AUDIT_SELECT,
    })
    if (!stored) throw new Error(SITE_NOT_FOUND)

    const startDate = data.startDate === undefined ? stored.startDate : data.startDate
    const targetEndDate = data.targetEndDate === undefined ? stored.targetEndDate : data.targetEndDate
    if (startDate && targetEndDate && targetEndDate < startDate) {
      throw new Error('Invalid site: targetEndDate must not be before the start date')
    }

    const changes: SiteChanges = { ...data }
    if (status !== undefined && status !== stored.status) {
      if (!SITE_FORM_EDITABLE_STATUSES.has(status)) {
        throw new Error(`Invalid site: status cannot be changed to ${status} here`)
      }
      changes.status = status
    }

    await assertActiveCompanyAssignees(tx, user.companyId, [data.assignedPmId, data.assignedEngineerId])

    const result = await tx.site.updateMany({
      where: { id: stored.id, companyId: user.companyId, deletedAt: null },
      data: changes,
    })
    if (result.count !== 1) throw new Error(SITE_NOT_FOUND)

    const fields = Object.keys(changes)
    await tx.auditLog.create({
      data: auditLogData({
        userId: user.id,
        companyId: user.companyId,
        action: 'UPDATE',
        module: 'SITE',
        recordId: stored.id,
        description: `${user.name ?? user.email} updated site "${stored.name}"`,
        before: auditSnapshot(stored, fields),
        after: { ...auditSnapshot(changes, fields), fields },
      }),
    })

    return stored.id
  })
}
