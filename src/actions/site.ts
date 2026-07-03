'use server'

import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function updateSiteDetails(formData: FormData) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  const id = formData.get('id') as string
  const name = formData.get('name') as string
  const targetEndDate = formData.get('targetEndDate') as string
  const budget = parseFloat(formData.get('budget') as string) || 0
  const status = formData.get('status') as any

  await prisma.site.updateMany({
    where: { id, companyId: session.user.companyId },
    data: {
      name,
      targetEndDate: targetEndDate ? new Date(targetEndDate) : null,
      budget,
      status
    }
  })

  revalidatePath(`/sites/${id}`)
  revalidatePath(`/sites`)
  return { success: true }
}
