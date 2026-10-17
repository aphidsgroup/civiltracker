'use server'

import { requireUser } from '@/lib/auth/require-user'
import { assertCanAccessSite } from '@/lib/auth/permissions'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/audit'
import { Prisma, type ApprovalPriority, type PurchaseRequestStatus, type ApprovalStatus } from '@prisma/client'

export interface MaterialRequestItemInput {
  materialName: string
  variantId?: string
  specification?: string
  brand?: string
  quantity: number
  unit: string
  notes?: string
}

export async function createMaterialRequestAction(data: {
  siteId: string
  workLocation?: string
  urgency?: string
  neededBy?: string
  notes?: string
  // Multi-item cart
  items?: MaterialRequestItemInput[]
  // Single-item fallback
  description?: string
  quantity?: number
  unit?: string
  variantId?: string
  brand?: string
  specsJson?: Record<string, unknown>
}) {
  const user = await requireUser()
  if (!user.companyId && user.role !== 'SUPER_ADMIN') {
    throw new Error('Unauthorized: No active company context')
  }

  if (!data.siteId) {
    throw new Error('Site is required')
  }

  await assertCanAccessSite(data.siteId)

  const site = await prisma.site.findUnique({
    where: { id: data.siteId },
    select: { id: true, companyId: true, name: true }
  })
  if (!site) throw new Error('Site not found')

  const companyId = site.companyId || user.companyId!
  const urgency = data.urgency || 'Normal'
  const workLocation = data.workLocation?.trim() || null

  const priority: ApprovalPriority =
    urgency === 'Urgent' ? 'URGENT' : urgency === 'High' ? 'HIGH' : 'NORMAL'

  // Prepare items list
  const itemsList: MaterialRequestItemInput[] = []
  if (data.items && data.items.length > 0) {
    for (const item of data.items) {
      if (item.materialName && Number(item.quantity) > 0) {
        itemsList.push({
          materialName: item.materialName.trim(),
          variantId: item.variantId,
          specification: item.specification?.trim(),
          brand: item.brand?.trim(),
          quantity: Number(item.quantity),
          unit: item.unit.trim() || 'Units',
          notes: item.notes?.trim(),
        })
      }
    }
  } else if (data.description && Number(data.quantity) > 0) {
    itemsList.push({
      materialName: data.description.trim(),
      variantId: data.variantId,
      brand: data.brand?.trim(),
      quantity: Number(data.quantity),
      unit: data.unit?.trim() || 'Units',
      notes: data.notes?.trim(),
    })
  }

  if (itemsList.length === 0) {
    throw new Error('At least one valid material with positive quantity is required')
  }

  const batchId = itemsList.length > 1 ? `batch_${Date.now()}` : undefined

  // Construct summary description
  const primaryItem = itemsList[0]
  const summaryTitle =
    itemsList.length === 1
      ? `Material Request: ${primaryItem.quantity} ${primaryItem.unit} ${primaryItem.materialName}${primaryItem.specification ? ` (${primaryItem.specification})` : ''}`
      : `Material Indent (${itemsList.length} items): ${primaryItem.quantity} ${primaryItem.unit} ${primaryItem.materialName} + ${itemsList.length - 1} more`

  const locationContext = workLocation ? `📍 Location: ${workLocation}` : ''
  const neededByContext = data.neededBy ? `🗓️ Needed by: ${data.neededBy}` : ''
  const notesContext = data.notes?.trim() ? `📝 ${data.notes.trim()}` : ''

  const combinedNotes = [locationContext, neededByContext, notesContext].filter(Boolean).join(' • ')

  // 1. Create PurchaseRequest records
  const createdPRs: string[] = []
  for (const item of itemsList) {
    const fullItemDesc = `${item.materialName}${item.specification ? ` — ${item.specification}` : ''}${item.brand ? ` [Brand: ${item.brand}]` : ''}`
    const pr = await prisma.purchaseRequest.create({
      data: {
        companyId,
        siteId: site.id,
        description: fullItemDesc,
        quantity: item.quantity,
        unit: item.unit,
        urgency,
        workLocation,
        variantId: item.variantId || null,
        brand: item.brand || null,
        specsJson: item.specification ? { specification: item.specification } : ((data.specsJson as Prisma.InputJsonValue) || undefined),
        neededBy: data.neededBy ? new Date(data.neededBy) : null,
        notes: combinedNotes || null,
        batchId: batchId || null,
        itemsJson: itemsList.length > 1 ? (JSON.parse(JSON.stringify(itemsList)) as Prisma.InputJsonValue) : undefined,
        status: 'PENDING' as PurchaseRequestStatus,
        requestedById: user.id,
      }
    })
    createdPRs.push(pr.id)
  }

  const primaryPRId = createdPRs[0]

  // 2. Create linked Approval entry
  const approval = await prisma.approval.create({
    data: {
      companyId,
      siteId: site.id,
      entityType: 'MATERIAL_REQUEST',
      entityId: primaryPRId,
      title: summaryTitle,
      description: combinedNotes || `Requested by ${user.name || user.email}`,
      priority,
      approvalType: 'OPERATIONAL',
      requestedById: user.id,
      currentStatus: 'PENDING',
      submittedAt: new Date(),
      metadataJson: JSON.parse(JSON.stringify({
        workLocation,
        neededBy: data.neededBy || null,
        items: itemsList,
        batchId: batchId || null,
      })) as Prisma.InputJsonValue,
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
      note: `Material request submitted for ${itemsList.length} item(s) on ${site.name}${workLocation ? ` (${workLocation})` : ''}`,
    }
  })

  // 4. Audit Log
  await logActivity({
    userId: user.id,
    companyId,
    action: 'CREATE',
    module: 'MATERIAL_REQUEST',
    recordId: primaryPRId,
    description: `${user.name ?? user.email} requested ${summaryTitle} on site ${site.name}${workLocation ? ` (${workLocation})` : ''}`,
    after: { itemsCount: itemsList.length, site: site.name, workLocation, urgency },
  })

  revalidatePath('/mobile/home')
  revalidatePath('/mobile/approvals')
  revalidatePath('/dashboard')
  revalidatePath('/approvals')
  revalidatePath('/materials')
  revalidatePath('/materials/requests')

  return { success: true, id: primaryPRId, approvalId: approval.id, batchId }
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

export async function addCompanyCatalogueItemAction(data: {
  category: string
  materialName: string
  specification: string
  variantId?: string
  brand?: string
  defaultUnit: string
  allowedUnits?: string
  isDecimalAllowed?: boolean
  packSize?: string
  conversionFactor?: number
  aliases?: string
  notes?: string
}) {
  const user = await requireUser()
  let companyId: string | undefined = user.companyId || undefined
  if (!companyId && user.role === 'SUPER_ADMIN') {
    const firstCompany = await prisma.company.findFirst({ select: { id: true } })
    companyId = firstCompany?.id
  }
  if (!companyId) {
    throw new Error('Unauthorized: No active company context found')
  }

  const cleanName = data.materialName.trim()
  const cleanSpec = data.specification.trim()
  const variantId =
    data.variantId ||
    `${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${cleanSpec.toLowerCase().replace(/[^a-z0-9]/g, '-')}`

  const created = await prisma.companyCatalogueItem.create({
    data: {
      companyId,
      category: data.category.trim(),
      materialName: cleanName,
      variantId,
      specification: cleanSpec,
      brand: data.brand?.trim() || null,
      defaultUnit: data.defaultUnit.trim(),
      allowedUnits: data.allowedUnits?.trim() || null,
      isDecimalAllowed: Boolean(data.isDecimalAllowed),
      packSize: data.packSize?.trim() || null,
      conversionFactor: data.conversionFactor ? Number(data.conversionFactor) : null,
      aliases: data.aliases?.trim() || null,
      notes: data.notes?.trim() || null,
    }
  })

  revalidatePath('/materials')
  revalidatePath('/materials/requests')
  revalidatePath('/materials/catalogue')
  revalidatePath('/mobile/request-material')

  return {
    id: created.id,
    category: created.category,
    materialName: created.materialName,
    variantId: created.variantId,
    specification: created.specification,
    brand: created.brand,
    defaultUnit: created.defaultUnit,
    allowedUnits: created.allowedUnits ? created.allowedUnits.split(',').map((u) => u.trim()) : [created.defaultUnit],
    isDecimalAllowed: created.isDecimalAllowed,
    packSize: created.packSize || undefined,
    conversionNote: created.notes || undefined,
  }
}

export async function getCompanyCatalogueItemsAction() {
  const user = await requireUser()
  if (!user.companyId && user.role !== 'SUPER_ADMIN') return []

  const items = await prisma.companyCatalogueItem.findMany({
    where: {
      ...(user.role === 'SUPER_ADMIN' ? {} : { companyId: user.companyId! }),
      isActive: true,
    },
    orderBy: { createdAt: 'desc' }
  })
  return items
}

export async function updatePurchaseRequestStatusAction(
  requestId: string,
  newStatus: PurchaseRequestStatus,
  note?: string
) {
  const user = await requireUser()
  if (!user.companyId && user.role !== 'SUPER_ADMIN') {
    throw new Error('Unauthorized')
  }

  const companyFilter = user.role === 'SUPER_ADMIN' ? {} : { companyId: user.companyId! }
  const pr = await prisma.purchaseRequest.findFirst({
    where: { id: requestId, ...companyFilter },
    include: { site: true },
  })
  if (!pr) throw new Error('Purchase request not found')

  const updateData: Record<string, unknown> = {
    status: newStatus,
  }

  if (newStatus === 'PM_APPROVED') {
    updateData.approvedById = user.id
    updateData.approvedAt = new Date()
  } else if (newStatus === 'CANCELLED') {
    if (note) updateData.notes = `${pr.notes ? pr.notes + ' • ' : ''}Rejected: ${note}`
  }

  const updatedPR = await prisma.purchaseRequest.update({
    where: { id: requestId },
    data: updateData,
  })

  // Map to ApprovalStatus
  let approvalStatus: ApprovalStatus = 'PENDING'
  if (newStatus === 'PM_APPROVED') approvalStatus = 'APPROVED'
  else if (newStatus === 'CANCELLED') approvalStatus = 'REJECTED'
  else if (newStatus === 'PO_CREATED' || newStatus === 'DELIVERED') approvalStatus = 'PAID'
  else if (newStatus === 'PENDING') approvalStatus = 'PENDING'

  // Update linked approval if exists
  const approval = await prisma.approval.findFirst({
    where: { entityType: 'MATERIAL_REQUEST', entityId: requestId },
  })

  if (approval) {
    await prisma.approval.update({
      where: { id: approval.id },
      data: {
        currentStatus: approvalStatus,
        ...(approvalStatus === 'APPROVED' ? { approvedById: user.id, approvedAt: new Date() } : {}),
        ...(approvalStatus === 'REJECTED' ? { rejectedById: user.id, rejectedAt: new Date(), rejectionReason: note || 'Rejected' } : {}),
      },
    })

    await prisma.approvalTimeline.create({
      data: {
        companyId: pr.companyId,
        approvalId: approval.id,
        actorUserId: user.id,
        action: newStatus,
        fromStatus: approval.currentStatus,
        toStatus: approvalStatus,
        note: note || `Status updated to ${newStatus} by ${user.name || user.email}`,
      },
    })
  }

  await logActivity({
    userId: user.id,
    companyId: pr.companyId,
    action: 'UPDATE',
    module: 'MATERIAL_REQUEST',
    recordId: pr.id,
    description: `${user.name ?? user.email} updated PR status to ${newStatus} for "${pr.description}"`,
    after: { status: newStatus, note },
  })

  revalidatePath('/materials')
  revalidatePath('/materials/requests')
  revalidatePath('/approvals')
  revalidatePath('/mobile/home')
  revalidatePath('/mobile/approvals')

  return updatedPR
}

