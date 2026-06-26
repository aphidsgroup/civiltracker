'use server'

import { requireUser } from '@/lib/auth/require-user'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function addMobileWorkerAction(formData: {
  name: string
  trade: string
  dailyRate: number
  siteId: string
}) {
  const user = await requireUser()
  if (!user.companyId) throw new Error('No active company context')

  if (!formData.name || !formData.siteId) {
    throw new Error('Name and site are required')
  }

  const worker = await prisma.labour.create({
    data: {
      companyId: user.companyId,
      siteId: formData.siteId,
      name: formData.name.trim(),
      trade: (formData.trade as any) || 'HELPER',
      dailyWage: Number(formData.dailyRate) || 650,
      isActive: true,
    }
  })

  revalidatePath('/mobile/attendance')
  revalidatePath('/labour/attendance')
  return { success: true, worker }
}

export async function saveMobileAttendanceAction(records: { labourId: string; status: string; siteId: string }[]) {
  const user = await requireUser()
  if (!user.companyId) throw new Error('No active company context')

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let count = 0
  for (const item of records) {
    if (!item.status) continue
    await prisma.labourAttendance.upsert({
      where: {
        labourId_date: {
          labourId: item.labourId,
          date: today
        }
      },
      create: {
        labourId: item.labourId,
        siteId: item.siteId,
        date: today,
        status: item.status as any,
        markedById: user.id
      },
      update: {
        status: item.status as any,
        markedById: user.id
      }
    })
    count++
  }

  revalidatePath('/mobile/attendance')
  revalidatePath('/labour/attendance')
  return { success: true, count }
}
