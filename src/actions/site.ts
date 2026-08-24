'use server'

import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/audit'
import { SiteStatus } from '@prisma/client'

export async function updateSiteDetails(formData: FormData) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  const id = formData.get('id') as string
  const name = formData.get('name') as string
  const location = formData.get('location') as string
  const address = formData.get('address') as string
  const projectType = formData.get('projectType') as string
  
  const clientName = formData.get('clientName') as string
  const clientPhone = formData.get('clientPhone') as string
  const areaSqft = parseFloat(formData.get('areaSqft') as string) || null

  const startDate = formData.get('startDate') as string
  const targetEndDate = formData.get('targetEndDate') as string
  const budget = parseFloat(formData.get('budget') as string) || 0
  const status = formData.get('status') as SiteStatus

  await prisma.site.updateMany({
    where: { id, companyId: session.user.companyId },
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

  revalidatePath(`/sites/${id}`)
  revalidatePath(`/sites`)
  return { success: true }
}

export async function softDeleteSite(id: string, confirmed?: boolean) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  const site = await prisma.site.findFirst({
    where: { id, companyId: session.user.companyId },
    select: { id: true, name: true, location: true, status: true, deletedAt: true, budget: true },
  })
  if (!site) throw new Error('Site not found.')
  if (confirmed !== true) {
    throw new Error('Site deletion must be explicitly confirmed.')
  }

  const deletedAt = new Date()
  await prisma.site.updateMany({
    where: { id, companyId: session.user.companyId },
    data: { deletedAt }
  })

  await logActivity({
    userId: session.user.id,
    companyId: session.user.companyId,
    action: 'DELETE',
    module: 'SITE',
    recordId: site.id,
    description: `${session.user.name ?? session.user.email} scheduled site "${site.name}" for deletion`,
    before: { deletedAt: site.deletedAt, location: site.location, status: site.status, budget: Number(site.budget), name: site.name },
    after: { deletedAt: deletedAt.toISOString(), location: site.location, status: site.status, budget: Number(site.budget), name: site.name },
  })

  revalidatePath('/sites')
  return { success: true }
}

export async function restoreSite(id: string) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  const site = await prisma.site.findFirst({
    where: { id, companyId: session.user.companyId },
    select: { id: true, name: true, location: true, status: true, deletedAt: true, budget: true },
  })
  if (!site) throw new Error('Site not found.')

  await prisma.site.updateMany({
    where: { id, companyId: session.user.companyId },
    data: { deletedAt: null }
  })

  await logActivity({
    userId: session.user.id,
    companyId: session.user.companyId,
    action: 'UPDATE',
    module: 'SITE',
    recordId: site.id,
    description: `${session.user.name ?? session.user.email} restored site "${site.name}"`,
    before: { deletedAt: site.deletedAt ? site.deletedAt.toISOString() : null, location: site.location, status: site.status, budget: Number(site.budget), name: site.name },
    after: { deletedAt: null, location: site.location, status: site.status, budget: Number(site.budget), name: site.name },
  })

  revalidatePath('/sites')
  return { success: true }
}
