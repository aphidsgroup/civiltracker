'use server'

import { auth } from '@/lib/auth'
import { requireUser } from '@/lib/auth/require-user'
import {
  listChecklistSites,
  requireChecklistCategory,
  requireChecklistPhoto,
  requireChecklistSite,
  requireChecklistTask,
  requireProjectChecklist,
} from '@/lib/auth/checklist-site'
import { requireAssignedSiteMutation } from '@/lib/auth/site-mutation'
import { hasPermission } from '@/lib/permissions'
import prisma from '@/lib/prisma'
import { UPLOAD_POLICIES } from '@/lib/uploads/upload-policy'
import { revalidatePath } from 'next/cache'

// Deep clone a master template to a project
export async function enableChecklistForProject(siteId: string, templateId: string) {
  const { site } = await requireChecklistSite(siteId, 'manage')
  const existing = await prisma.projectChecklist.findFirst({
    where: { siteId: site.id, companyId: site.companyId },
  })
  if (existing) throw new Error('Checklist already enabled for this project')

  const template = await prisma.checklistTemplate.findFirst({
    where: { id: templateId, OR: [{ companyId: site.companyId }, { isGlobal: true }] },
    include: { stages: { include: { categories: { include: { tasks: true } } } } },
  })
  if (!template) throw new Error('FORBIDDEN: Template not found or access denied')

  await prisma.projectChecklist.create({
    data: {
      siteId: site.id, templateId: template.id, companyId: site.companyId,
      stages: { create: template.stages.map((stage) => ({
        name: stage.name, order: stage.order, weight: stage.weight,
        categories: { create: stage.categories.map((category) => ({
          name: category.name, order: category.order,
          tasks: { create: category.tasks.map((task) => ({ name: task.name, order: task.order, isRequired: task.isRequired })) },
        })) },
      })) },
    },
  })

  revalidatePath(`/sites/${site.id}`)
  return { success: true }
}

const TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED'] as const
type TaskStatus = (typeof TASK_STATUSES)[number]

/*
 * Changes a checklist task's status. The site is bound to the caller's checklist scope
 * (field roles: assigned live sites) before anything is read; then the task is re-read on
 * that site's checklist, updated and audited on one transaction client, so an audit
 * failure rolls the status back. Audit history is append-only: a tick appends a
 * CHECKLIST TICK event, an untick a CHECKLIST UNTICK event, any other change a CHECKLIST
 * UPDATE event, and no audit row is ever deleted or rewritten.
 */
export async function toggleTaskStatus(siteId: string, taskId: string, status: TaskStatus, isClientDone = false, isNeglected = false) {
  if (typeof siteId !== 'string' || !siteId || typeof taskId !== 'string' || !taskId) {
    throw new Error('Invalid checklist task')
  }
  if (typeof status !== 'string' || !(TASK_STATUSES as readonly string[]).includes(status)) {
    throw new Error('Invalid checklist task status')
  }
  if (typeof isClientDone !== 'boolean' || typeof isNeglected !== 'boolean') {
    throw new Error('Invalid checklist task flags')
  }

  // Field staff may tick progress; the client-done and neglected flags are manager-only.
  const setsManagerFlags = isClientDone || isNeglected
  const { user, site } = await requireChecklistSite(siteId, setsManagerFlags ? 'manage' : 'progress')
  const canManage = hasPermission(user.role, 'tasks.manage')

  await prisma.$transaction(async (tx) => {
    const task = await tx.projectChecklistTask.findFirst({
      where: { id: taskId, category: { stage: { checklist: { siteId: site.id, companyId: site.companyId } } } },
      select: { id: true, name: true, status: true, isClientDone: true, isNeglected: true },
    })
    if (!task) throw new Error('FORBIDDEN: Checklist task not found or access denied')

    const next = {
      status,
      isClientDone: canManage ? isClientDone : task.isClientDone,
      isNeglected: canManage ? isNeglected : task.isNeglected,
    }
    await tx.projectChecklistTask.update({
      where: { id: task.id },
      data: {
        status,
        ...(canManage ? { isClientDone, isNeglected } : {}),
        completedAt: status === 'COMPLETED' ? new Date() : null,
        completedById: status === 'COMPLETED' ? user.id : null,
      },
      select: { id: true },
    })

    const action = status === 'COMPLETED' ? 'TICK' : task.status === 'COMPLETED' ? 'UNTICK' : 'UPDATE'
    await tx.auditLog.create({
      data: {
        userId: user.id,
        companyId: site.companyId,
        module: 'CHECKLIST',
        action,
        recordId: site.id,
        before: { taskId: task.id, siteId: site.id, status: task.status, isClientDone: task.isClientDone, isNeglected: task.isNeglected },
        after: { taskId: task.id, taskName: task.name, siteId: site.id, ...next },
      },
    })
  })

  revalidatePath(`/sites/${site.id}`)
  revalidatePath(`/activity`)
  return { success: true }
}


export async function toggleCategoryNeglect(siteId: string, categoryId: string, isNeglected: boolean) {
  const { site, category } = await requireChecklistCategory(siteId, categoryId, 'manage')
  await prisma.projectChecklistCategory.update({ where: { id: category.id }, data: { isNeglected } })
  revalidatePath(`/sites/${site.id}`)
  return { success: true }
}

export async function addCustomTask(siteId: string, categoryId: string, name: string) {
  const { site, category } = await requireChecklistCategory(siteId, categoryId, 'manage')
  await prisma.projectChecklistTask.create({ data: { categoryId: category.id, name, order: 999 } })
  revalidatePath(`/sites/${site.id}`)
  return { success: true }
}

export async function editChecklistTask(siteId: string, taskId: string, newName: string) {
  const { site, task } = await requireChecklistTask(siteId, taskId, 'manage')
  await prisma.projectChecklistTask.update({ where: { id: task.id }, data: { name: newName } })
  revalidatePath(`/sites/${site.id}`)
  return { success: true }
}

export async function deleteChecklistTask(siteId: string, taskId: string) {
  const { site, task } = await requireChecklistTask(siteId, taskId, 'manage')
  await prisma.projectChecklistTask.delete({ where: { id: task.id } })
  revalidatePath(`/sites/${site.id}`)
  return { success: true }
}

export async function deleteProjectChecklist(siteId: string) {
  const { site, checklist } = await requireProjectChecklist(siteId, 'manage')
  await prisma.projectChecklist.delete({ where: { id: checklist.id } })
  revalidatePath(`/sites/${site.id}`)
  return { success: true }
}

export async function getPendingTasks(siteId: string) {
  const { site } = await requireChecklistSite(siteId)

  const checklist = await prisma.projectChecklist.findFirst({
    where: { siteId: site.id, companyId: site.companyId },
    include: {
      stages: {
        orderBy: { order: 'asc' },
        include: {
          categories: {
            where: { isNeglected: false },
            orderBy: { order: 'asc' },
            include: {
              tasks: {
                where: { isNeglected: false, status: { in: ['PENDING', 'IN_PROGRESS'] } },
                orderBy: { order: 'asc' }
              }
            }
          }
        }
      }
    }
  })

  if (!checklist) return []

  const tasks: { id: string, name: string, categoryName: string, stageName: string }[] = []

  for (const stage of checklist.stages) {
    for (const cat of stage.categories) {
      for (const task of cat.tasks) {
        tasks.push({
          id: task.id,
          name: task.name,
          categoryName: cat.name,
          stageName: stage.name
        })
      }
    }
  }

  return tasks
}

// Without a site, lists only the sites the caller may read (field roles: assigned sites).
export async function getPendingChecklistPhotos(siteId?: string) {
  let companyId: string
  let siteIds: string[]

  if (siteId) {
    const { site } = await requireChecklistSite(siteId)
    companyId = site.companyId
    siteIds = [site.id]
  } else {
    const readable = await listChecklistSites()
    if (!readable) return []
    companyId = readable.companyId
    siteIds = readable.siteIds
  }
  if (siteIds.length === 0) return []

  const pendingTasks = await prisma.projectChecklistTask.findMany({
    where: {
      category: { stage: { checklist: { companyId, siteId: { in: siteIds } } } },
      OR: [ { status: 'COMPLETED' }, { isClientDone: true } ],
      sitePhotos: { none: {} }
    },
    include: { 
      category: { 
        include: { 
          stage: { 
            include: { checklist: true } 
          } 
        } 
      } 
    },
    orderBy: { updatedAt: 'desc' }
  })

  // Fetch site names since ProjectChecklist doesn't have a direct site relation in prisma include
  const pendingSiteIds = [...new Set(pendingTasks.map(t => t.category.stage.checklist.siteId))]
  const sites = await prisma.site.findMany({
    where: { id: { in: pendingSiteIds }, companyId, deletedAt: null },
    select: { id: true, name: true }
  })
  const siteMap = new Map(sites.map(s => [s.id, s.name]))

  return pendingTasks.map(t => ({
    taskId: t.id,
    taskName: t.name,
    categoryName: t.category.name,
    stageName: t.category.stage.name,
    siteId: t.category.stage.checklist.siteId,
    siteName: siteMap.get(t.category.stage.checklist.siteId) || 'Unknown Site'
  }))
}

const MEDIA_NOT_FOUND = 'FORBIDDEN: Uploaded photo not found or access denied'

/*
 * Attaches a checklist completion photo uploaded through `/api/upload`. The live principal
 * must hold a SITE_PHOTO upload grant with TASKS enabled, the site must be a live company
 * site the principal is assigned to, the task must be on that site's checklist, and the
 * photo must be a MediaAsset the same user uploaded as a SITE_PHOTO for exactly that site
 * and company that no photo row uses yet. The URL and public id come from the asset;
 * nothing the browser sends is stored as a URL.
 */
export async function uploadChecklistPhotoAction(taskId: string, siteId: string, mediaAssetId: string) {
  const policy = UPLOAD_POLICIES.SITE_PHOTO
  const { user, site } = await requireAssignedSiteMutation(String(siteId ?? ''), policy.permissions, policy.module)
  const assetId = typeof mediaAssetId === 'string' ? mediaAssetId.trim() : ''
  if (!assetId || assetId.length > 64) throw new Error(MEDIA_NOT_FOUND)

  await prisma.$transaction(async (tx) => {
    const task = await tx.projectChecklistTask.findFirst({
      where: { id: String(taskId ?? ''), category: { stage: { checklist: { siteId: site.id, companyId: site.companyId } } } },
      select: { id: true, name: true },
    })
    if (!task) throw new Error('FORBIDDEN: Checklist task not found or access denied')

    const asset = await tx.mediaAsset.findFirst({
      where: { id: assetId, companyId: user.companyId, siteId: site.id, module: 'SITE_PHOTO', uploadedById: user.id },
      select: { secureUrl: true, cloudinaryPublicId: true },
    })
    if (!asset) throw new Error(MEDIA_NOT_FOUND)

    // One upload backs one photo row, so deleting a photo never strands another's image.
    const bound = await tx.sitePhoto.findFirst({
      where: { cloudinaryPublicId: asset.cloudinaryPublicId },
      select: { id: true },
    })
    if (bound) throw new Error('FORBIDDEN: Uploaded photo is already attached')

    await tx.sitePhoto.create({
      data: {
        companyId: site.companyId,
        siteId: site.id,
        taskId: task.id,
        secureUrl: asset.secureUrl,
        cloudinaryPublicId: asset.cloudinaryPublicId,
        caption: 'Checklist Task Completed',
        uploadedById: user.id,
      },
      select: { id: true },
    })
  })

  revalidatePath(`/sites/${site.id}/photos`)
  revalidatePath(`/mobile/checklist`)
  return { success: true }
}


// Admin approves a site photo → makes it visible to client
export async function approvePhotoAction(photoId: string) {
  const { user, photo } = await requireChecklistPhoto(photoId)
  const updated = await prisma.sitePhoto.update({
    where: { id: photo.id },
    data: { approvedForClient: true, approvedById: user.id, approvedAt: new Date() },
    include: { task: true },
  })

  if (updated.siteId) {
    revalidatePath(`/sites/${updated.siteId}/photos`)
    revalidatePath(`/client-portal`)
    revalidatePath(`/client-portal/photos`)
  }
  return { success: true }
}

export async function rejectPhotoAction(photoId: string) {
  const { photo } = await requireChecklistPhoto(photoId)
  const updated = await prisma.sitePhoto.update({
    where: { id: photo.id },
    data: { approvedForClient: false, approvedById: null, approvedAt: null },
  })

  if (updated.siteId) revalidatePath(`/sites/${updated.siteId}/photos`)
  return { success: true }
}

// Client confirms they have seen / accepted a task photo → marks task completed
export async function clientApproveTaskPhoto(photoId: string) {
  const user = await requireUser()
  if (user.role !== 'CLIENT') throw new Error('FORBIDDEN: Client portal access required')

  const photo = await prisma.sitePhoto.findFirst({
    where: {
      id: photoId,
      approvedForClient: true,
      site: { clientUserId: user.id, deletedAt: null },
    },
    include: {
      site: { select: { companyId: true } },
      task: {
        include: {
          category: {
            include: {
              stage: { include: { checklist: { select: { siteId: true, companyId: true } } } },
            },
          },
        },
      },
    },
  })

  if (!photo) throw new Error('Photo not found or access denied')
  if (photo.companyId !== photo.site.companyId) {
    throw new Error('Photo company does not match its authorized site')
  }
  const checklist = photo.task?.category.stage.checklist
  if (photo.taskId && (!checklist || checklist.siteId !== photo.siteId || checklist.companyId !== photo.companyId)) {
    throw new Error('Photo task is not linked to the authorized site')
  }

  // Mark the linked task as client-confirmed
  if (photo.taskId) {
    await prisma.projectChecklistTask.update({
      where: { id: photo.taskId },
      data: {
        isClientDone: true,
        status: 'COMPLETED',
        completedAt: new Date()
      }
    })
  }

  if (photo.siteId) {
    revalidatePath(`/client-portal`)
    revalidatePath(`/client-portal/photos`)
  }
  return { success: true }
}

