'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { auditLogData } from '@/lib/audit-data'
import {
  requireAssignedScopeMutation,
  requireSiteMutation,
  requireTenantMutation,
} from '@/lib/auth/site-mutation'
import { updateSiteForTenant } from '@/lib/sites/update-site'
import { parseSiteDetailsForm } from '@/lib/validation/sites'

const SITE_NOT_FOUND = 'FORBIDDEN: Site not found or access denied'

/**
 * Form entry point of the Edit Site modal, on the same rules as `updateSite`: live
 * `sites.update` + SITES before the form is parsed, then the form is validated against
 * the canonical site field rules with an explicit key allowlist, and the audited update
 * service binds the site to the assigned-site scope and writes the update and its audit
 * record in one transaction. Revalidation runs only after that commit.
 */
export async function updateSiteDetails(formData: FormData) {
  const { user, scope } = await requireAssignedScopeMutation('sites.update', 'SITES')
  const { siteId, status, site } = parseSiteDetailsForm(formData)

  const updatedId = await updateSiteForTenant(user, siteId, scope, site, status)

  revalidatePath(`/sites/${updatedId}`)
  revalidatePath(`/sites`)
  return { success: true }
}

/*
 * Soft delete and restore re-read the site, apply the guarded write and write the audit
 * record on one transaction client: an audit failure rolls the lifecycle change back.
 */
export async function softDeleteSite(id: string, dangerConfirmText?: string) {
  const { user } = await requireSiteMutation(id, 'sites.delete', 'SITES')

  await prisma.$transaction(async (tx) => {
    const site = await tx.site.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      select: { id: true, name: true, location: true, status: true, deletedAt: true, budget: true },
    })
    if (!site) throw new Error(SITE_NOT_FOUND)
    if ((dangerConfirmText ?? '').trim() !== site.name.trim()) {
      throw new Error('Delete confirmation text did not match the site name.')
    }

    const deletedAt = new Date()
    const result = await tx.site.updateMany({
      where: { id: site.id, companyId: user.companyId, deletedAt: null },
      data: { deletedAt }
    })
    if (result.count !== 1) throw new Error(SITE_NOT_FOUND)

    await tx.auditLog.create({
      data: auditLogData({
        userId: user.id,
        companyId: user.companyId,
        action: 'DELETE',
        module: 'SITE',
        recordId: site.id,
        description: `${user.name ?? user.email} scheduled site "${site.name}" for deletion`,
        before: { deletedAt: site.deletedAt, location: site.location, status: site.status, budget: Number(site.budget), name: site.name },
        after: { deletedAt: deletedAt.toISOString(), location: site.location, status: site.status, budget: Number(site.budget), name: site.name },
      }),
    })
  })

  revalidatePath('/sites')
  return { success: true }
}

export async function restoreSite(id: string) {
  const user = await requireTenantMutation('sites.delete', 'SITES')

  await prisma.$transaction(async (tx) => {
    const site = await tx.site.findFirst({
      where: { id, companyId: user.companyId, deletedAt: { not: null } },
      select: { id: true, name: true, location: true, status: true, deletedAt: true, budget: true },
    })
    if (!site) throw new Error(SITE_NOT_FOUND)

    const result = await tx.site.updateMany({
      where: { id: site.id, companyId: user.companyId, deletedAt: { not: null } },
      data: { deletedAt: null }
    })
    if (result.count !== 1) throw new Error(SITE_NOT_FOUND)

    await tx.auditLog.create({
      data: auditLogData({
        userId: user.id,
        companyId: user.companyId,
        action: 'UPDATE',
        module: 'SITE',
        recordId: site.id,
        description: `${user.name ?? user.email} restored site "${site.name}"`,
        before: { deletedAt: site.deletedAt ? site.deletedAt.toISOString() : null, location: site.location, status: site.status, budget: Number(site.budget), name: site.name },
        after: { deletedAt: null, location: site.location, status: site.status, budget: Number(site.budget), name: site.name },
      }),
    })
  })

  revalidatePath('/sites')
  return { success: true }
}
