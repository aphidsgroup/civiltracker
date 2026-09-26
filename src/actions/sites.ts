'use server'

import { prisma } from '@/lib/prisma'
import { requireAssignedSiteMutation, requireTenantMutation } from '@/lib/auth/site-mutation'
import { slugify } from '@/lib/utils'
import { parseCreateSiteInput } from '@/lib/validation/sites'
import { SiteStatus } from '@prisma/client'
import { logActivity } from '@/lib/audit'

const SITE_NOT_FOUND = 'FORBIDDEN: Site not found or access denied'

/**
 * Live `sites.create` + SITES before the payload is even parsed; then the payload is
 * validated as an exact field set (`parseCreateSiteInput`) and any assignee must be an
 * active member of the live company, all before the first write. Status and company are
 * server-owned.
 */
export async function createSite(input: unknown) {
  const user = await requireTenantMutation('sites.create', 'SITES')
  const companyId = user.companyId
  const data = parseCreateSiteInput(input)

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { _count: { select: { sites: true } } }
  })

  if (!company) throw new Error('Company not found')

  if (company.status === 'SUSPENDED' || company.status === 'CANCELLED') {
    throw new Error('Company is suspended or cancelled')
  }

  if (company._count.sites >= company.siteLimit) {
    throw new Error(`Site limit reached (${company.siteLimit}). Please upgrade your plan.`)
  }

  const assigneeIds = [...new Set([data.assignedPmId, data.assignedEngineerId].filter((id): id is string => id !== null))]
  if (assigneeIds.length > 0) {
    const members = await prisma.companyMember.findMany({
      where: { companyId, isActive: true, userId: { in: assigneeIds }, user: { isActive: true, deletedAt: null } },
      select: { userId: true },
    })
    const memberIds = new Set(members.map((member) => member.userId))
    if (!assigneeIds.every((id) => memberIds.has(id))) {
      throw new Error('Invalid site: assignee is not an active member of this company')
    }
  }

  const slug = slugify(data.name)
  const existing = await prisma.site.findFirst({
    where: { companyId, slug, deletedAt: null }
  })
  
  if (existing) {
    throw new Error('A site with a similar name already exists.')
  }

  const site = await prisma.site.create({
    data: {
      companyId,
      name: data.name,
      slug,
      location: data.location,
      address: data.address,
      clientName: data.clientName,
      clientPhone: data.clientPhone,
      clientEmail: data.clientEmail,
      mapLink: data.mapLink,
      projectType: data.projectType,
      contractType: data.contractType,
      areaSqft: data.areaSqft,
      floors: data.floors,
      budget: data.budget,
      contractValue: data.contractValue,
      startDate: data.startDate,
      targetEndDate: data.targetEndDate,
      assignedPmId: data.assignedPmId,
      assignedEngineerId: data.assignedEngineerId,
      status: SiteStatus.PLANNING,
      createdById: user.id,
    }
  })

  await logActivity({
    userId: user.id,
    companyId,
    action: 'CREATE',
    module: 'SITE',
    recordId: site.id,
    description: `${user.name ?? user.email} created new project site "${data.name}" at ${data.location}`,
    after: { name: data.name, location: data.location, budget: data.budget },
  })

  return { success: true, siteId: site.id }
}

/**
 * Live `sites.update` + SITES, then the id is bound to a live site of exactly the live
 * company inside the principal's assigned-site scope before any write. The write repeats
 * the binding and must match exactly one row, so a site deleted in between is refused.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateSite(siteId: string, data: any) {
  const { user, site } = await requireAssignedSiteMutation(siteId, 'sites.update', 'SITES')

  const result = await prisma.site.updateMany({
    where: { id: site.id, companyId: user.companyId, deletedAt: null },
    data: {
      name: data.name,
      location: data.location,
      address: data.address,
      clientName: data.clientName,
      clientPhone: data.clientPhone,
      clientEmail: data.clientEmail,
      mapLink: data.mapLink,
      projectType: data.projectType,
      contractType: data.contractType,
      areaSqft: data.areaSqft ? Number(data.areaSqft) : null,
      floors: data.floors ? Number(data.floors) : null,
      budget: data.budget ? Number(data.budget) : undefined,
      contractValue: data.contractValue ? Number(data.contractValue) : null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      targetEndDate: data.targetEndDate ? new Date(data.targetEndDate) : null,
      assignedPmId: data.assignedPmId,
      assignedEngineerId: data.assignedEngineerId || null,
    }
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
    after: { name: data.name, location: data.location },
  })

  return { success: true, siteId: site.id }
}
