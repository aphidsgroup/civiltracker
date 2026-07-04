'use server'

import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

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
  const status = formData.get('status') as any

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

export async function softDeleteSite(id: string) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  await prisma.site.updateMany({
    where: { id, companyId: session.user.companyId },
    data: { deletedAt: new Date() }
  })

  revalidatePath('/sites')
  return { success: true }
}

export async function restoreSite(id: string) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  await prisma.site.updateMany({
    where: { id, companyId: session.user.companyId },
    data: { deletedAt: null }
  })

  revalidatePath('/sites')
  return { success: true }
}
