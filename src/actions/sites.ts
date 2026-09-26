'use server'

import { prisma } from '@/lib/prisma'
import { requireAssignedSiteMutation, requireTenantMutation } from '@/lib/auth/site-mutation'
import { assertActiveCompanyAssignees, createSiteForTenant } from '@/lib/sites/create-site'
import { parseCreateSiteInput, parseUpdateSiteInput } from '@/lib/validation/sites'
import { logActivity } from '@/lib/audit'

const SITE_NOT_FOUND = 'FORBIDDEN: Site not found or access denied'

/**
 * Live `sites.create` + SITES before the payload is even parsed; then the payload is
 * validated as an exact field set (`parseCreateSiteInput`) and written by the shared
 * `createSiteForTenant`, which binds assignees to active members of the live company and
 * applies the site limit and duplicate rule before the first write. Status and company
 * are server-owned.
 */
export async function createSite(input: unknown) {
  const user = await requireTenantMutation('sites.create', 'SITES')
  const data = parseCreateSiteInput(input)
  const siteId = await createSiteForTenant(user, data)
  return { success: true, siteId }
}

/**
 * Live `sites.update` + SITES, then the id is bound to a live site of exactly the live
 * company inside the principal's assigned-site scope before any write. The payload is
 * validated field by field with the create rules (`parseUpdateSiteInput`): only the sent
 * keys of the allowlist are written, and a sent assignee must be an active member of the
 * live company. The write repeats the binding and must match exactly one row, so a site
 * deleted in between is refused.
 */
export async function updateSite(siteId: string, input: unknown) {
  const { user, site } = await requireAssignedSiteMutation(siteId, 'sites.update', 'SITES')
  const data = parseUpdateSiteInput(input)

  // A date sent on its own must stay in order with the stored other date.
  if ((data.startDate === undefined) !== (data.targetEndDate === undefined)) {
    const stored = await prisma.site.findFirst({
      where: { id: site.id, companyId: user.companyId, deletedAt: null },
      select: { startDate: true, targetEndDate: true },
    })
    if (!stored) throw new Error(SITE_NOT_FOUND)
    const startDate = data.startDate === undefined ? stored.startDate : data.startDate
    const targetEndDate = data.targetEndDate === undefined ? stored.targetEndDate : data.targetEndDate
    if (startDate && targetEndDate && targetEndDate < startDate) {
      throw new Error('Invalid site: targetEndDate must not be before the start date')
    }
  }

  await assertActiveCompanyAssignees(prisma, user.companyId, [data.assignedPmId, data.assignedEngineerId])

  const result = await prisma.site.updateMany({
    where: { id: site.id, companyId: user.companyId, deletedAt: null },
    data,
  })
  if (result.count !== 1) throw new Error(SITE_NOT_FOUND)

  await logActivity({
    userId: user.id,
    companyId: user.companyId,
    action: 'UPDATE',
    module: 'SITE',
    recordId: site.id,
    description: `${user.name ?? user.email} updated site "${site.name}"`,
    before: { name: site.name },
    after: { name: data.name ?? site.name, fields: Object.keys(data) },
  })

  return { success: true, siteId: site.id }
}
