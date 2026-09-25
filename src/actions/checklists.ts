'use server'

import { auth } from '@/lib/auth'
import { requireUser } from '@/lib/auth/require-user'
import {
  requireChecklistCategory,
  requireChecklistPhoto,
  requireChecklistSite,
  requireChecklistTask,
  requireProjectChecklist,
} from '@/lib/auth/checklist-site'
import { hasPermission } from '@/lib/permissions'
import prisma from '@/lib/prisma'
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

export async function toggleTaskStatus(siteId: string, taskId: string, status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED', isClientDone = false, isNeglected = false) {
  // Field staff may tick progress; the client-done and neglected flags are manager-only.
  const setsManagerFlags = isClientDone || isNeglected
  const { user, site, task } = await requireChecklistTask(siteId, taskId, setsManagerFlags ? 'manage' : 'progress')
  const canManage = hasPermission(user.role, 'tasks.manage')

  await prisma.projectChecklistTask.update({
    where: { id: task.id },
    data: {
      status,
      ...(canManage ? { isClientDone, isNeglected } : {}),
      completedAt: status === 'COMPLETED' ? new Date() : null,
      completedById: status === 'COMPLETED' ? user.id : null,
    },
  })

  if (status === 'COMPLETED') {
    // Task ticked — create TICK entry, storing taskId so we can delete it on untick
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        companyId: site.companyId,
        module: 'CHECKLIST',
        action: 'TICK',
        recordId: siteId,
        after: { taskId, taskName: task.name, status: 'COMPLETED' }
      }
    })
  } else {
    // Task unticked — fetch all checklist entries for this site, delete matching ones
    const allEntries = await prisma.auditLog.findMany({
      where: { module: 'CHECKLIST', recordId: site.id, companyId: site.companyId },
      select: { id: true, action: true, after: true }
    })

    const toDelete = allEntries
      .filter(e => {
        // Delete if it's any UNTICK entry (legacy cleanup)
        if (e.action === 'UNTICK') return true
        // Delete TICK entries that belong to this specific task
        if (e.action === 'TICK') {
          const data = e.after as { taskId?: string } | null
          return data?.taskId === taskId
        }
        return false
      })
      .map(e => e.id)

    if (toDelete.length > 0) {
      await prisma.auditLog.deleteMany({ where: { id: { in: toDelete } } })
    }
  }


  revalidatePath(`/sites/${siteId}`)
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

export async function getPendingChecklistPhotos(siteId?: string) {
  const user = await requireUser()
  let companyId = user.companyId
  let authorizedSiteId: string | undefined

  if (siteId) {
    const { site } = await requireChecklistSite(siteId)
    companyId = site.companyId
    authorizedSiteId = site.id
  }
  if (!companyId) return []

  const pendingTasks = await prisma.projectChecklistTask.findMany({
    where: {
      category: { stage: { checklist: { companyId, siteId: authorizedSiteId } } },
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
  const siteIds = [...new Set(pendingTasks.map(t => t.category.stage.checklist.siteId))]
  const sites = await prisma.site.findMany({
    where: { id: { in: siteIds }, companyId, deletedAt: null },
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

export async function uploadChecklistPhotoAction(taskId: string, siteId: string, imageUrl: string) {
  const { user, site, task } = await requireChecklistTask(siteId, taskId, 'photo')

  await prisma.sitePhoto.create({
    data: {
      companyId: site.companyId,
      siteId: site.id,
      taskId: task.id,
      secureUrl: imageUrl,
      cloudinaryPublicId: `checklist_${task.id}_${Date.now()}`,
      caption: 'Checklist Task Completed',
      uploadedById: user.id,
    },
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

