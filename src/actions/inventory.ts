'use server'

import { requireUser } from '@/lib/auth/require-user'
import { assertCanAccessSite } from '@/lib/auth/permissions'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/audit'
import { Prisma, type AssetStatus } from '@prisma/client'

export interface CreateCompanyAssetInput {
  name: string
  category: string
  assetCode?: string
  brand?: string
  modelNumber?: string
  serialNumber?: string
  quantity?: number
  unit?: string
  siteId?: string | null
  locationName?: string
  status?: AssetStatus
  conditionNotes?: string
  purchaseDate?: string
  purchaseCost?: number
  currentValue?: number
  assignedTo?: string
  notes?: string
}

export interface UpdateCompanyAssetInput {
  name?: string
  category?: string
  assetCode?: string | null
  brand?: string | null
  modelNumber?: string | null
  serialNumber?: string | null
  quantity?: number
  unit?: string
  siteId?: string | null
  locationName?: string | null
  status?: AssetStatus
  conditionNotes?: string | null
  purchaseDate?: string | null
  purchaseCost?: number | null
  currentValue?: number | null
  assignedTo?: string | null
  notes?: string | null
}

export interface TransferAssetInput {
  assetId: string
  toSiteId: string | null // null = Central Yard / Warehouse
  locationName?: string
  assignedTo?: string
  notes?: string
}

export async function createCompanyAssetAction(data: CreateCompanyAssetInput) {
  const user = await requireUser()
  if (!user.companyId && user.role !== 'SUPER_ADMIN') {
    throw new Error('Unauthorized: No active company context')
  }

  const name = data.name?.trim()
  if (!name) {
    throw new Error('Equipment or tool name is required')
  }

  const category = data.category?.trim() || 'General Tools'

  // If siteId is specified, verify access
  let siteName: string | null = null
  let companyId = user.companyId

  if (data.siteId && data.siteId !== 'YARD' && data.siteId !== 'yard') {
    await assertCanAccessSite(data.siteId)
    const site = await prisma.site.findUnique({
      where: { id: data.siteId },
      select: { id: true, companyId: true, name: true },
    })
    if (!site) throw new Error('Selected site not found')
    siteName = site.name
    companyId = site.companyId || companyId
  }

  if (!companyId) {
    throw new Error('Company context is required')
  }

  const resolvedSiteId = data.siteId && data.siteId !== 'YARD' && data.siteId !== 'yard' ? data.siteId : null

  // Determine initial status
  let resolvedStatus: AssetStatus = data.status || 'OPERATIONAL'
  if (resolvedSiteId && !data.status) {
    resolvedStatus = 'IN_USE'
  } else if (!resolvedSiteId && !data.status) {
    resolvedStatus = 'OPERATIONAL'
  }

  const asset = await prisma.companyAsset.create({
    data: {
      companyId,
      siteId: resolvedSiteId,
      name,
      category,
      assetCode: data.assetCode?.trim() || null,
      brand: data.brand?.trim() || null,
      modelNumber: data.modelNumber?.trim() || null,
      serialNumber: data.serialNumber?.trim() || null,
      quantity: Math.max(1, data.quantity ?? 1),
      unit: data.unit?.trim() || 'Nos',
      status: resolvedStatus,
      conditionNotes: data.conditionNotes?.trim() || null,
      purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
      purchaseCost: data.purchaseCost != null ? new Prisma.Decimal(data.purchaseCost) : null,
      currentValue: data.currentValue != null ? new Prisma.Decimal(data.currentValue) : null,
      assignedTo: data.assignedTo?.trim() || null,
      locationName: data.locationName?.trim() || (resolvedSiteId ? siteName : 'Central Yard / Store'),
      notes: data.notes?.trim() || null,
    },
    include: {
      site: { select: { id: true, name: true } },
    },
  })

  // Audit log
  await logActivity({
    userId: user.id,
    companyId,
    action: 'CREATE_EQUIPMENT_ASSET',
    module: 'INVENTORY',
    recordId: asset.id,
    description: `Added ${asset.name} (${asset.quantity} ${asset.unit}) to ${asset.site ? asset.site.name : 'Central Yard'}`,
    after: {
      name: asset.name,
      category: asset.category,
      siteId: asset.siteId,
      status: asset.status,
      quantity: asset.quantity,
    },
  })

  revalidatePath('/inventory')
  revalidatePath('/mobile/inventory')
  revalidatePath('/mobile/home')
  revalidatePath('/dashboard')

  return {
    success: true,
    asset: {
      ...asset,
      purchaseCost: asset.purchaseCost ? Number(asset.purchaseCost) : null,
      currentValue: asset.currentValue ? Number(asset.currentValue) : null,
    },
  }
}

export async function updateCompanyAssetAction(id: string, data: UpdateCompanyAssetInput) {
  const user = await requireUser()
  if (!user.companyId && user.role !== 'SUPER_ADMIN') {
    throw new Error('Unauthorized')
  }

  const existing = await prisma.companyAsset.findUnique({
    where: { id },
  })
  if (!existing || existing.deletedAt) {
    throw new Error('Tool or equipment not found')
  }

  if (user.role !== 'SUPER_ADMIN' && existing.companyId !== user.companyId) {
    throw new Error('Unauthorized: Forbidden asset modification')
  }

  const resolvedSiteId = data.siteId !== undefined
    ? (data.siteId && data.siteId !== 'YARD' && data.siteId !== 'yard' ? data.siteId : null)
    : existing.siteId

  let siteName = existing.locationName
  if (resolvedSiteId && resolvedSiteId !== existing.siteId) {
    const s = await prisma.site.findUnique({ where: { id: resolvedSiteId }, select: { name: true } })
    if (s) siteName = s.name
  } else if (!resolvedSiteId && existing.siteId) {
    siteName = 'Central Yard / Store'
  }

  const updated = await prisma.companyAsset.update({
    where: { id },
    data: {
      ...(data.name ? { name: data.name.trim() } : {}),
      ...(data.category ? { category: data.category.trim() } : {}),
      ...(data.assetCode !== undefined ? { assetCode: data.assetCode?.trim() || null } : {}),
      ...(data.brand !== undefined ? { brand: data.brand?.trim() || null } : {}),
      ...(data.modelNumber !== undefined ? { modelNumber: data.modelNumber?.trim() || null } : {}),
      ...(data.serialNumber !== undefined ? { serialNumber: data.serialNumber?.trim() || null } : {}),
      ...(data.quantity !== undefined ? { quantity: Math.max(1, data.quantity) } : {}),
      ...(data.unit !== undefined ? { unit: data.unit.trim() } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.conditionNotes !== undefined ? { conditionNotes: data.conditionNotes?.trim() || null } : {}),
      ...(data.purchaseDate !== undefined ? { purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null } : {}),
      ...(data.purchaseCost !== undefined ? { purchaseCost: data.purchaseCost != null ? new Prisma.Decimal(data.purchaseCost) : null } : {}),
      ...(data.currentValue !== undefined ? { currentValue: data.currentValue != null ? new Prisma.Decimal(data.currentValue) : null } : {}),
      ...(data.assignedTo !== undefined ? { assignedTo: data.assignedTo?.trim() || null } : {}),
      ...(data.locationName !== undefined ? { locationName: data.locationName?.trim() || siteName } : { locationName: siteName }),
      ...(data.siteId !== undefined ? { siteId: resolvedSiteId } : {}),
      ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
    },
    include: {
      site: { select: { id: true, name: true } },
    },
  })

  await logActivity({
    userId: user.id,
    companyId: existing.companyId,
    action: 'UPDATE_EQUIPMENT_ASSET',
    module: 'INVENTORY',
    recordId: id,
    description: `Updated equipment ${updated.name}`,
    before: { name: existing.name, status: existing.status, siteId: existing.siteId },
    after: { name: updated.name, status: updated.status, siteId: updated.siteId },
  })

  revalidatePath('/inventory')
  revalidatePath('/mobile/inventory')
  revalidatePath('/mobile/home')

  return {
    success: true,
    asset: {
      ...updated,
      purchaseCost: updated.purchaseCost ? Number(updated.purchaseCost) : null,
      currentValue: updated.currentValue ? Number(updated.currentValue) : null,
    },
  }
}

export async function transferAssetAction(data: TransferAssetInput) {
  const user = await requireUser()
  const existing = await prisma.companyAsset.findUnique({
    where: { id: data.assetId },
    include: { site: { select: { name: true } } },
  })
  if (!existing || existing.deletedAt) {
    throw new Error('Asset not found')
  }

  if (user.role !== 'SUPER_ADMIN' && existing.companyId !== user.companyId) {
    throw new Error('Unauthorized')
  }

  let newSiteName = 'Central Yard / Store'
  const targetSiteId = data.toSiteId && data.toSiteId !== 'YARD' && data.toSiteId !== 'yard' ? data.toSiteId : null

  if (targetSiteId) {
    await assertCanAccessSite(targetSiteId)
    const s = await prisma.site.findUnique({ where: { id: targetSiteId }, select: { name: true } })
    if (!s) throw new Error('Target site not found')
    newSiteName = s.name
  }

  const newStatus: AssetStatus = targetSiteId ? 'IN_USE' : 'STANDBY'

  const updated = await prisma.companyAsset.update({
    where: { id: data.assetId },
    data: {
      siteId: targetSiteId,
      status: newStatus,
      locationName: data.locationName?.trim() || newSiteName,
      assignedTo: data.assignedTo !== undefined ? data.assignedTo?.trim() || null : existing.assignedTo,
      notes: data.notes
        ? (existing.notes ? `${existing.notes}\n[Transfer ${new Date().toLocaleDateString('en-IN')}]: ${data.notes}` : data.notes)
        : existing.notes,
    },
    include: {
      site: { select: { id: true, name: true } },
    },
  })

  const fromLocation = existing.site ? existing.site.name : 'Central Yard'
  const toLocation = targetSiteId ? newSiteName : 'Central Yard'

  await logActivity({
    userId: user.id,
    companyId: existing.companyId,
    action: 'TRANSFER_EQUIPMENT_ASSET',
    module: 'INVENTORY',
    recordId: data.assetId,
    description: `Transferred ${existing.name} from "${fromLocation}" to "${toLocation}"`,
    before: { siteId: existing.siteId, location: fromLocation },
    after: { siteId: updated.siteId, location: toLocation, assignedTo: updated.assignedTo },
  })

  revalidatePath('/inventory')
  revalidatePath('/mobile/inventory')
  revalidatePath('/mobile/home')

  return { success: true }
}

export async function updateAssetStatusAction(id: string, status: AssetStatus, conditionNotes?: string) {
  const user = await requireUser()
  const existing = await prisma.companyAsset.findUnique({ where: { id } })
  if (!existing || existing.deletedAt) throw new Error('Asset not found')
  if (user.role !== 'SUPER_ADMIN' && existing.companyId !== user.companyId) {
    throw new Error('Unauthorized')
  }

  await prisma.companyAsset.update({
    where: { id },
    data: {
      status,
      conditionNotes: conditionNotes !== undefined ? conditionNotes?.trim() || null : existing.conditionNotes,
    },
  })

  await logActivity({
    userId: user.id,
    companyId: existing.companyId,
    action: 'UPDATE_ASSET_STATUS',
    module: 'INVENTORY',
    recordId: id,
    description: `Changed status of ${existing.name} to ${status}`,
    before: { status: existing.status },
    after: { status },
  })

  revalidatePath('/inventory')
  revalidatePath('/mobile/inventory')
  revalidatePath('/mobile/home')

  return { success: true }
}

export async function deleteCompanyAssetAction(id: string) {
  const user = await requireUser()
  const existing = await prisma.companyAsset.findUnique({ where: { id } })
  if (!existing || existing.deletedAt) throw new Error('Asset not found')
  if (user.role !== 'SUPER_ADMIN' && existing.companyId !== user.companyId) {
    throw new Error('Unauthorized')
  }

  await prisma.companyAsset.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
  })

  await logActivity({
    userId: user.id,
    companyId: existing.companyId,
    action: 'DELETE_EQUIPMENT_ASSET',
    module: 'INVENTORY',
    recordId: id,
    description: `Removed ${existing.name} from company inventory`,
  })

  revalidatePath('/inventory')
  revalidatePath('/mobile/inventory')
  revalidatePath('/mobile/home')

  return { success: true }
}
