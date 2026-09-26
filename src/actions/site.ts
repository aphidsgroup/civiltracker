'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/audit'
import { SiteStatus } from '@prisma/client'
import {
  parseNonNegativeAmount,
  requiredText,
  requireSiteMutation,
  requireTenantMutation,
} from '@/lib/auth/site-mutation'

const SITE_NOT_FOUND = 'FORBIDDEN: Site not found or access denied'

function parseSiteStatus(raw: FormDataEntryValue | null): SiteStatus {
  if (typeof raw !== 'string' || !(Object.values(SiteStatus) as string[]).includes(raw)) {
    throw new Error('Invalid site status')
  }
  return raw as SiteStatus
}

export async function updateSiteDetails(formData: FormData) {
  const id = formData.get('id') as string
  const { site } = await requireSiteMutation(id, 'sites.update', 'SITES')

  const name = requiredText(formData.get('name'), 'Name')
  const location = requiredText(formData.get('location'), 'Location')
  const address = formData.get('address') as string
  const projectType = formData.get('projectType') as string

  const clientName = formData.get('clientName') as string
  const clientPhone = formData.get('clientPhone') as string
  const areaSqft = parseNonNegativeAmount(formData.get('areaSqft'), 'area', null)

  const startDate = formData.get('startDate') as string
  const targetEndDate = formData.get('targetEndDate') as string
  const budget = parseNonNegativeAmount(formData.get('budget'), 'budget', 0)
  const status = parseSiteStatus(formData.get('status'))

  const result = await prisma.site.updateMany({
    where: { id: site.id, companyId: site.companyId, deletedAt: null },
    data: {
      name,
      location,
      address,
      projectType,
      clientName,
      clientPhone,
      areaSqft,
      startDate: startDate ? new Date(startDate) : null,
      targetEndDate: targetEndDate ? new Date(targetEndDate) : null,
      budget,
      status
    }
  })
  if (result.count !== 1) throw new Error(SITE_NOT_FOUND)

  revalidatePath(`/sites/${site.id}`)
  revalidatePath(`/sites`)
  return { success: true }
}

export async function softDeleteSite(id: string, dangerConfirmText?: string) {
  const { user } = await requireSiteMutation(id, 'sites.delete', 'SITES')

  const site = await prisma.site.findFirst({
    where: { id, companyId: user.companyId, deletedAt: null },
    select: { id: true, name: true, location: true, status: true, deletedAt: true, budget: true },
  })
  if (!site) throw new Error(SITE_NOT_FOUND)
  if ((dangerConfirmText ?? '').trim() !== site.name.trim()) {
    throw new Error('Delete confirmation text did not match the site name.')
  }

  const deletedAt = new Date()
  const result = await prisma.site.updateMany({
    where: { id: site.id, companyId: user.companyId, deletedAt: null },
    data: { deletedAt }
  })
  if (result.count !== 1) throw new Error(SITE_NOT_FOUND)

  await logActivity({
    userId: user.id,
    companyId: user.companyId,
    action: 'DELETE',
    module: 'SITE',
    recordId: site.id,
    description: `${user.name ?? user.email} scheduled site "${site.name}" for deletion`,
    before: { deletedAt: site.deletedAt, location: site.location, status: site.status, budget: Number(site.budget), name: site.name },
    after: { deletedAt: deletedAt.toISOString(), location: site.location, status: site.status, budget: Number(site.budget), name: site.name },
  })

  revalidatePath('/sites')
  return { success: true }
}

export async function restoreSite(id: string) {
  const user = await requireTenantMutation('sites.delete', 'SITES')

  const site = await prisma.site.findFirst({
    where: { id, companyId: user.companyId, deletedAt: { not: null } },
    select: { id: true, name: true, location: true, status: true, deletedAt: true, budget: true },
  })
  if (!site) throw new Error(SITE_NOT_FOUND)

  const result = await prisma.site.updateMany({
    where: { id: site.id, companyId: user.companyId, deletedAt: { not: null } },
    data: { deletedAt: null }
  })
  if (result.count !== 1) throw new Error(SITE_NOT_FOUND)

  await logActivity({
    userId: user.id,
    companyId: user.companyId,
    action: 'UPDATE',
    module: 'SITE',
    recordId: site.id,
    description: `${user.name ?? user.email} restored site "${site.name}"`,
    before: { deletedAt: site.deletedAt ? site.deletedAt.toISOString() : null, location: site.location, status: site.status, budget: Number(site.budget), name: site.name },
    after: { deletedAt: null, location: site.location, status: site.status, budget: Number(site.budget), name: site.name },
  })

  revalidatePath('/sites')
  return { success: true }
}
