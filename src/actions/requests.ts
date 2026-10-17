'use server'

import { requireUser } from '@/lib/auth/require-user'
import { assertCanAccessSite } from '@/lib/auth/permissions'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/audit'
import type { ApprovalPriority, PurchaseRequestStatus } from '@prisma/client'

export async function createMaterialRequestAction(data: {
  siteId: string
  description: string
  quantity: number
  unit?: string
  urgency?: string
  neededBy?: string
  notes?: string
}) {
  const user = await requireUser()
  if (!user.companyId && user.role !== 'SUPER_ADMIN') {
    throw new Error('Unauthorized: No active company context')
  }

  if (!data.siteId) {
    throw new Error('Site is required')
  }
  if (!data.description || data.description.trim().length < 2) {
    throw new Error('Material description is required')
  }
  if (!data.quantity || isNaN(Number(data.quantity)) || Number(data.quantity) <= 0) {
    throw new Error('Valid positive quantity is required')
  }

  await assertCanAccessSite(data.siteId)

  const site = await prisma.site.findUnique({
    where: { id: data.siteId },
    select: { id: true, companyId: true, name: true }
  })
  if (!site) throw new Error('Site not found')

  const companyId = site.companyId || user.companyId!
  const trimmedDesc = data.description.trim()
  const unit = data.unit?.trim() || 'Units'
  const urgency = data.urgency || 'Normal'

  // Map urgency to ApprovalPriority
  const priority: ApprovalPriority =
    urgency === 'Urgent' ? 'URGENT' : urgency === 'High' ? 'HIGH' : 'NORMAL'

  const notesWithDate = [
    data.notes?.trim(),
    data.neededBy ? `Needed by: ${data.neededBy}` : null,
  ].filter(Boolean).join(' • ')

  // 1. Create PurchaseRequest
  const purchaseRequest = await prisma.purchaseRequest.create({
    data: {
      companyId,
      siteId: site.id,
      description: trimmedDesc,
      quantity: Number(data.quantity),
      unit,
      urgency,
      notes: notesWithDate || null,
      status: 'PENDING' as PurchaseRequestStatus,
      requestedById: user.id,
    }
  })

  // 2. Create linked Approval entry
  const title = `Material Request: ${data.quantity} ${unit} ${trimmedDesc}`
  const approval = await prisma.approval.create({
    data: {
      companyId,
      siteId: site.id,
      entityType: 'MATERIAL_REQUEST',
      entityId: purchaseRequest.id,
      title,
      description: notesWithDate || `Requested by ${user.name || user.email}`,
      priority,
      approvalType: 'OPERATIONAL',
      requestedById: user.id,
      currentStatus: 'PENDING',
      submittedAt: new Date(),
    }
  })

  // 3. Create Timeline
  await prisma.approvalTimeline.create({
    data: {
      companyId,
      approvalId: approval.id,
      actorUserId: user.id,
      action: 'SUBMITTED',
      toStatus: 'PENDING',
      note: `Material request submitted for ${data.quantity} ${unit} ${trimmedDesc} (${urgency} priority)`,
    }
  })

  // 4. Audit Log
  await logActivity({
    userId: user.id,
    companyId,
    action: 'CREATE',
    module: 'MATERIAL_REQUEST',
    recordId: purchaseRequest.id,
    description: `${user.name ?? user.email} requested ${data.quantity} ${unit} ${trimmedDesc} on site ${site.name}`,
    after: { quantity: data.quantity, unit, description: trimmedDesc, site: site.name, urgency },
  })

  revalidatePath('/mobile/home')
  revalidatePath('/mobile/approvals')
  revalidatePath('/dashboard')
  revalidatePath('/approvals')
  revalidatePath('/materials')

  return { success: true, id: purchaseRequest.id, approvalId: approval.id }
}

export async function createPettyCashRequestAction(data: {
  siteId: string
  amount: number
  purpose: string
  urgency?: string
  neededBy?: string
  notes?: string
}) {
  const user = await requireUser()
  if (!user.companyId && user.role !== 'SUPER_ADMIN') {
    throw new Error('Unauthorized: No active company context')
  }

  if (!data.siteId) {
    throw new Error('Site is required')
  }
  const numAmount = Number(data.amount)
  if (!data.amount || isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Valid numeric amount is required')
  }
  if (!data.purpose || data.purpose.trim().length < 2) {
    throw new Error('Purpose / description is required')
  }

  await assertCanAccessSite(data.siteId)

  const site = await prisma.site.findUnique({
    where: { id: data.siteId },
    select: { id: true, companyId: true, name: true }
  })
  if (!site) throw new Error('Site not found')

  const companyId = site.companyId || user.companyId!
  const trimmedPurpose = data.purpose.trim()
  const urgency = data.urgency || 'Normal'

  const notesWithDate = [
    data.notes?.trim(),
    data.neededBy ? `Needed by: ${data.neededBy}` : null,
  ].filter(Boolean).join(' • ')

  const priority: ApprovalPriority =
    urgency === 'Urgent' ? 'URGENT' : urgency === 'High' || numAmount >= 25000 ? 'HIGH' : 'NORMAL'

  // 1. Create Expense record with category SITE_PETTY_CASH
  const expense = await prisma.expense.create({
    data: {
      companyId,
      siteId: site.id,
      category: 'SITE_PETTY_CASH',
      amount: numAmount,
      paymentMode: 'CASH',
      paidTo: 'Site Petty Cash',
      description: trimmedPurpose,
      notes: notesWithDate || null,
      approvalStatus: 'PENDING',
      createdById: user.id,
    }
  })

  // 2. Create linked Approval entry
  const title = `Petty Cash Request: ₹${numAmount.toLocaleString('en-IN')} - ${trimmedPurpose}`
  const approval = await prisma.approval.create({
    data: {
      companyId,
      siteId: site.id,
      entityType: 'EXPENSE',
      entityId: expense.id,
      title,
      amount: numAmount,
      description: notesWithDate || `Petty cash requested by ${user.name || user.email}`,
      priority,
      approvalType: 'FINANCIAL',
      requestedById: user.id,
      currentStatus: 'PENDING',
      submittedAt: new Date(),
    }
  })

  // 3. Create Timeline
  await prisma.approvalTimeline.create({
    data: {
      companyId,
      approvalId: approval.id,
      actorUserId: user.id,
      action: 'SUBMITTED',
      toStatus: 'PENDING',
      note: `Petty cash request of ₹${numAmount.toLocaleString('en-IN')} submitted for ${trimmedPurpose}`,
    }
  })

  // 4. Audit Log
  await logActivity({
    userId: user.id,
    companyId,
    action: 'CREATE',
    module: 'EXPENSE',
    recordId: expense.id,
    description: `${user.name ?? user.email} requested ₹${numAmount.toLocaleString('en-IN')} petty cash on site ${site.name}`,
    after: { amount: numAmount, purpose: trimmedPurpose, site: site.name, urgency },
  })

  revalidatePath('/mobile/home')
  revalidatePath('/mobile/approvals')
  revalidatePath('/dashboard')
  revalidatePath('/approvals')
  revalidatePath('/expenses')

  return { success: true, id: expense.id, approvalId: approval.id }
}
