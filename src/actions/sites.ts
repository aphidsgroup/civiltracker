'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth/require-permission'
import { requireCompanyAccess } from '@/lib/auth/require-company-access'
import { slugify } from '@/lib/utils'
import { SiteStatus } from '@prisma/client'

export async function createSite(data: any) {
  const user = await requirePermission('sites.create')
  const companyId = user.companyId

  if (!companyId) {
    throw new Error('User does not belong to a company')
  }

  // Check limits
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

  const slug = slugify(data.name)
  const existing = await prisma.site.findUnique({
    where: { companyId_slug: { companyId, slug } }
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
      areaSqft: data.areaSqft ? Number(data.areaSqft) : null,
      floors: data.floors ? Number(data.floors) : null,
      budget: data.budget ? Number(data.budget) : 0,
      contractValue: data.contractValue ? Number(data.contractValue) : null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      targetEndDate: data.targetEndDate ? new Date(data.targetEndDate) : null,
      assignedPmId: data.assignedPmId,
      assignedEngineerId: data.assignedEngineerId,
      status: SiteStatus.PLANNING,
      createdById: user.id,
    }
  })

  return { success: true, siteId: site.id }
}

export async function updateSite(siteId: string, data: any) {
  const user = await requirePermission('sites.update')
  await requireCompanyAccess(siteId, 'site')

  await prisma.site.update({
    where: { id: siteId },
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
      assignedEngineerId: data.assignedEngineerId,
      status: data.status,
    }
  })

  return { success: true }
}
