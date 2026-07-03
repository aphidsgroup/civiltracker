'use server'

import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { LabourTrade } from '@prisma/client'

export async function updateLabourAction(formData: FormData) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')
  const { companyId } = session.user

  const id = formData.get('id') as string
  const name = formData.get('name') as string
  const phone = (formData.get('phone') as string) || undefined
  const trade = formData.get('trade') as LabourTrade
  const dailyWage = parseFloat(formData.get('dailyWage') as string)
  const overtimeRate = formData.get('overtimeRate') ? parseFloat(formData.get('overtimeRate') as string) : undefined
  const siteId = formData.get('siteId') as string
  const isActive = formData.get('isActive') === 'true'

  if (!id || !name || !trade || !siteId || isNaN(dailyWage)) throw new Error('Missing required fields')

  await prisma.labour.update({
    where: { id, companyId },
    data: {
      siteId,
      name,
      phone,
      trade,
      dailyWage,
      overtimeRate,
      isActive,
    },
  })

  revalidatePath('/labour')
  redirect('/labour')
}
