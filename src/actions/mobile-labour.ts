'use server'

import { requireUser } from '@/lib/auth/require-user'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function addMobileWorkerAction(formData: {
  name: string
  trade: string
  customTrade?: string
  dailyRate: number
  siteId: string
}) {
  const user = await requireUser()
  if (!user.companyId) throw new Error('No active company context')

  if (!formData.name || !formData.siteId) {
    throw new Error('Name and site are required')
  }

  let tradeVal = (formData.trade as any) || 'HELPER'
  let phoneVal: string | null = null

  if (formData.trade === 'OTHERS' && formData.customTrade?.trim()) {
    tradeVal = 'HELPER' // Fallback enum
    phoneVal = `CUSTOM_TRADE:${formData.customTrade.trim()}`
  }

  const worker = await prisma.labour.create({
    data: {
      companyId: user.companyId,
      siteId: formData.siteId,
      name: formData.name.trim(),
      trade: tradeVal,
      phone: phoneVal,
      dailyWage: Number(formData.dailyRate) || 650,
      isActive: true,
    }
  })

  revalidatePath('/mobile/attendance')
  revalidatePath('/labour/attendance')
  return { success: true, worker }
}

export async function updateWorkerAction(formData: {
  id: string
  name: string
  trade: string
  customTrade?: string
  dailyWage: number
  siteId: string
  advance?: number
}) {
  const user = await requireUser()
  if (!user.companyId) throw new Error('No active company context')

  let tradeVal = (formData.trade as any) || 'HELPER'
  let phoneVal: string | null = null

  if (formData.trade === 'OTHERS' && formData.customTrade?.trim()) {
    tradeVal = 'HELPER'
    phoneVal = `CUSTOM_TRADE:${formData.customTrade.trim()}`
  } else if (formData.trade !== 'OTHERS') {
    // If switching back from custom trade to standard trade, clear custom trade tag
    const existing = await prisma.labour.findUnique({ where: { id: formData.id }, select: { phone: true } })
    if (existing?.phone?.startsWith('CUSTOM_TRADE:')) {
      phoneVal = null
    } else {
      phoneVal = existing?.phone || null
    }
  }

  const worker = await prisma.labour.update({
    where: { id: formData.id, companyId: user.companyId },
    data: {
      name: formData.name.trim(),
      trade: tradeVal,
      phone: phoneVal !== undefined ? phoneVal : undefined,
      dailyWage: Number(formData.dailyWage) || 650,
      siteId: formData.siteId,
    }
  })

  // Upsert today's attendance record with advance payment
  if (formData.advance !== undefined) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    await prisma.labourAttendance.upsert({
      where: { labourId_date: { labourId: formData.id, date: today } },
      create: {
        labourId: formData.id,
        siteId: formData.siteId,
        date: today,
        status: 'PRESENT',
        advance: Number(formData.advance) || 0,
        markedById: user.id
      },
      update: {
        advance: Number(formData.advance) || 0,
        markedById: user.id
      }
    })
  }

  revalidatePath('/mobile/attendance')
  revalidatePath('/labour/attendance')
  return { success: true, worker }
}

export async function saveMobileAttendanceAction(records: { labourId: string; status: string; siteId: string; advance?: number }[]) {
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
        advance: Number(item.advance) || 0,
        markedById: user.id
      },
      update: {
        status: item.status as any,
        advance: item.advance !== undefined ? Number(item.advance) : undefined,
        markedById: user.id
      }
    })
    count++
  }

  revalidatePath('/mobile/attendance')
  revalidatePath('/labour/attendance')
  return { success: true, count }
}
