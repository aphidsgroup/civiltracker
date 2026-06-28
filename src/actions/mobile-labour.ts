'use server'

import { requireUser } from '@/lib/auth/require-user'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/audit'

export async function addMobileWorkerAction(formData: {
  name: string
  trade: string
  customTrade?: string
  dailyRate: number
  siteId: string
  startTime?: string
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

  await logActivity({
    userId: user.id,
    companyId: user.companyId,
    action: 'CREATE',
    module: 'LABOUR',
    recordId: worker.id,
    description: `${user.name ?? user.email} registered worker "${formData.name.trim()}" (${tradeVal}) at site`,
    after: { name: formData.name, trade: tradeVal, dailyRate: formData.dailyRate },
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

export async function saveMobileAttendanceAction(records: { labourId: string; status: string; siteId: string; advance?: number, startTime?: string }[]) {
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
        startTime: item.startTime,
        markedById: user.id
      },
      update: {
        status: item.status as any,
        advance: item.advance !== undefined ? Number(item.advance) : undefined,
        startTime: item.startTime !== undefined ? item.startTime : undefined,
        markedById: user.id
      }
    })
    count++
  }

  revalidatePath('/mobile/attendance')
  revalidatePath('/labour/attendance')

  if (count > 0 && records[0]?.siteId) {
    await logActivity({
      userId: user.id,
      companyId: user.companyId,
      action: 'CREATE',
      module: 'ATTENDANCE',
      recordId: records[0].siteId,
      description: `${user.name ?? user.email} marked attendance for ${count} worker(s) for today`,
      after: { count, date: new Date().toLocaleDateString('en-IN') },
    })
  }

  return { success: true, count }
}

export async function addExistingWorkerToRoster(labourId: string, siteId: string, startTime?: string) {
  const user = await requireUser()
  if (!user.companyId) throw new Error('No active company context')

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Mark them present for today to add them to the roster
  const record = await prisma.labourAttendance.upsert({
    where: {
      labourId_date: {
        labourId,
        date: today
      }
    },
    create: {
      labourId,
      siteId,
      date: today,
      status: 'PRESENT',
      advance: 0,
      startTime,
      markedById: user.id
    },
    update: {
      status: 'PRESENT',
      startTime: startTime !== undefined ? startTime : undefined
    }
  })

  // Update their default site assignment too
  await prisma.labour.update({
    where: { id: labourId },
    data: { siteId }
  })

  revalidatePath('/mobile/attendance')
  return { success: true, record }
}

export async function saveContractorAttendance(data: {
  siteId: string
  contractorName: string
  contractorType: string
  labourCount: number
  dailyAdvance: number
  startTime?: string
}) {
  const user = await requireUser()
  if (!user.companyId) throw new Error('No active company context')

  // Find or create subcontractor
  let sub = await prisma.subcontractor.findFirst({
    where: {
      companyId: user.companyId,
      name: { equals: data.contractorName, mode: 'insensitive' }
    }
  })

  if (!sub) {
    sub = await prisma.subcontractor.create({
      data: {
        companyId: user.companyId,
        name: data.contractorName,
        trade: data.contractorType,
      }
    })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Log the daily attendance for this contractor
  const attendance = await prisma.contractorAttendance.create({
    data: {
      companyId: user.companyId,
      siteId: data.siteId,
      subcontractorId: sub.id,
      date: today,
      contractorType: data.contractorType,
      labourCount: data.labourCount,
      startTime: data.startTime,
      dailyAdvance: data.dailyAdvance,
      createdById: user.id
    }
  })

  // Update total advance on the subcontractor record
  if (data.dailyAdvance > 0) {
    await prisma.subcontractor.update({
      where: { id: sub.id },
      data: {
        advance: {
          increment: data.dailyAdvance
        }
      }
    })
  }

  revalidatePath('/mobile/attendance')
  revalidatePath('/sites/[id]', 'page')
  return { success: true, attendance }
}

export async function removeLabourAttendanceAction(labourId: string) {
  const user = await requireUser()
  if (!user.companyId) throw new Error('No active company context')

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const labour = await prisma.labour.findUnique({
    where: { id: labourId },
    select: { companyId: true }
  })

  if (!labour || labour.companyId !== user.companyId) {
    throw new Error('Unauthorized or not found')
  }

  // Delete today's attendance record
  await prisma.labourAttendance.deleteMany({
    where: {
      labourId,
      date: today
    }
  })

  revalidatePath('/mobile/attendance')
  revalidatePath('/labour/attendance')
  return { success: true }
}

export async function removeContractorAttendanceAction(attendanceId: string) {
  const user = await requireUser()
  if (!user.companyId) throw new Error('No active company context')

  // Find the record to reverse the advance amount if any
  const record = await prisma.contractorAttendance.findUnique({
    where: { id: attendanceId, companyId: user.companyId }
  })

  if (record) {
    if (Number(record.dailyAdvance) > 0) {
      await prisma.subcontractor.update({
        where: { id: record.subcontractorId },
        data: {
          advance: {
            decrement: record.dailyAdvance
          }
        }
      })
    }
    await prisma.contractorAttendance.delete({
      where: { id: attendanceId }
    })
  }

  revalidatePath('/mobile/attendance')
  revalidatePath('/sites/[id]', 'page')
  return { success: true }
}
