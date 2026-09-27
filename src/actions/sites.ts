'use server'

import { requireAssignedScopeMutation, requireTenantMutation } from '@/lib/auth/site-mutation'
import { createSiteForTenant } from '@/lib/sites/create-site'
import { updateSiteForTenant } from '@/lib/sites/update-site'
import { parseCreateSiteInput, parseUpdateSiteInput } from '@/lib/validation/sites'

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
 * Live `sites.update` + SITES and the principal's assigned-site scope before the payload
 * is even parsed; the payload is validated field by field with the create rules
 * (`parseUpdateSiteInput`): only the sent keys of the allowlist are written. The write
 * goes through the audited update service shared with `updateSiteDetails`: the site is
 * re-read in exactly the live company inside the scope, a lone date is checked against
 * the stored other date, sent assignees must be active members of the live company, and
 * the guarded write (which must match exactly one live row) and the required audit record
 * share one transaction, so an audit failure rolls the update back.
 */
export async function updateSite(siteId: string, input: unknown) {
  const { user, scope } = await requireAssignedScopeMutation('sites.update', 'SITES')
  const data = parseUpdateSiteInput(input)
  if (typeof siteId !== 'string' || !siteId) throw new Error(SITE_NOT_FOUND)

  const updatedId = await updateSiteForTenant(user, siteId, scope, data)
  return { success: true, siteId: updatedId }
}
