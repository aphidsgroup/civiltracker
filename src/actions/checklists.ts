'use server'

import { auth } from '@/lib/auth'
import { requireUser } from '@/lib/auth/require-user'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

// Deep clone a master template to a project
export async function enableChecklistForProject(siteId: string, templateId: string) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')
  const { companyId } = session.user

  // Check if a checklist already exists
  const existing = await prisma.projectChecklist.findUnique({
    where: { siteId }
  })
  if (existing) throw new Error('Checklist already enabled for this project')

  // Fetch full template
  const template = await prisma.checklistTemplate.findUnique({
    where: { id: templateId },
    include: {
      stages: {
        include: {
          categories: {
            include: { tasks: true }
          }
        }
      }
    }
  })

  if (!template) throw new Error('Template not found')

  // Create Project Checklist
  await prisma.projectChecklist.create({
    data: {
      siteId,
      templateId,
      companyId,
      stages: {
        create: template.stages.map(stage => ({
          name: stage.name,
          order: stage.order,
          weight: stage.weight,
          categories: {
            create: stage.categories.map(cat => ({
              name: cat.name,
              order: cat.order,
              tasks: {
                create: cat.tasks.map(task => ({
                  name: task.name,
                  order: task.order,
                  isRequired: task.isRequired
                }))
              }
            }))
          }
        }))
      }
    }
  })

  revalidatePath(`/sites/${siteId}`)
  return { success: true }
}

export async function toggleTaskStatus(siteId: string, taskId: string, status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED', isClientDone = false, isNeglected = false) {
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')

  // Resolve companyId — site engineers may not have it in their JWT
  let companyId = session.user.companyId ?? null
  if (!companyId) {
    const site = await prisma.site.findUnique({ where: { id: siteId }, select: { companyId: true } })
    companyId = site?.companyId ?? null
  }

  const task = await prisma.projectChecklistTask.update({
    where: { id: taskId },
    data: {
      status,
      isClientDone,
      isNeglected,
      completedAt: status === 'COMPLETED' ? new Date() : null,
      completedById: status === 'COMPLETED' ? session.user.id : null,
    }
  })

  if (status === 'COMPLETED') {
    // Task ticked — create TICK entry, storing taskId so we can delete it on untick
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        companyId,
        module: 'CHECKLIST',
        action: 'TICK',
        recordId: siteId,
        after: { taskId, taskName: task.name, status: 'COMPLETED' }
      }
    })
  } else {
    // Task unticked — fetch all checklist entries for this site, delete matching ones
    const allEntries = await prisma.auditLog.findMany({
      where: { module: 'CHECKLIST', recordId: siteId },
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
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  await prisma.projectChecklistCategory.update({
    where: { id: categoryId },
    data: { isNeglected }
  })

  revalidatePath(`/sites/${siteId}`)
  return { success: true }
}

export async function addCustomTask(siteId: string, categoryId: string, name: string) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  await prisma.projectChecklistTask.create({
    data: {
      categoryId,
      name,
      order: 999, // append to end
    }
  })

  revalidatePath(`/sites/${siteId}`)
  return { success: true }
}

export async function editChecklistTask(siteId: string, taskId: string, newName: string) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  await prisma.projectChecklistTask.update({
    where: { id: taskId },
    data: { name: newName }
  })

  revalidatePath(`/sites/${siteId}`)
  return { success: true }
}

export async function deleteChecklistTask(siteId: string, taskId: string) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  await prisma.projectChecklistTask.delete({
    where: { id: taskId }
  })

  revalidatePath(`/sites/${siteId}`)
  return { success: true }
}

export async function deleteProjectChecklist(siteId: string) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  await prisma.projectChecklist.delete({
    where: { siteId }
  })
  
  revalidatePath(`/sites/${siteId}`)
  return { success: true }
}

export async function getPendingTasks(siteId: string) {
  const session = await auth()
  if (!session?.user?.companyId) return []

  const checklist = await prisma.projectChecklist.findUnique({
    where: { siteId },
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
  const session = await auth()
  if (!session?.user?.id) return []

  let companyId = session.user.companyId
  if (!companyId) {
    const member = await prisma.companyMember.findFirst({ where: { userId: session.user.id } })
    if (member) companyId = member.companyId
  }

  if (!companyId) return []

  const pendingTasks = await prisma.projectChecklistTask.findMany({
    where: {
      category: { stage: { checklist: { companyId, siteId: siteId || undefined } } },
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
    where: { id: { in: siteIds } },
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
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')

  // Resolve companyId — site engineers may not have it in their session token
  let companyId = session.user.companyId ?? null
  if (!companyId) {
    const site = await prisma.site.findUnique({ where: { id: siteId }, select: { companyId: true } })
    if (!site) throw new Error('Site not found')
    companyId = site.companyId
  }

  await prisma.sitePhoto.create({
    data: {
      companyId,
      siteId,
      taskId,
      secureUrl: imageUrl,
      cloudinaryPublicId: `checklist_${taskId}_${Date.now()}`,
      caption: 'Checklist Task Completed',
      uploadedById: session.user.id
    }
  })

  revalidatePath(`/sites/${siteId}/photos`)
  revalidatePath(`/mobile/checklist`)
  return { success: true }
}


// Admin approves a site photo → makes it visible to client
export async function approvePhotoAction(photoId: string) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  const photo = await prisma.sitePhoto.update({
    where: { id: photoId },
    data: {
      approvedForClient: true,
      approvedById: session.user.id,
      approvedAt: new Date()
    },
    include: { task: true }
  })

  if (photo.siteId) {
    revalidatePath(`/sites/${photo.siteId}/photos`)
    revalidatePath(`/client-portal`)
    revalidatePath(`/client-portal/photos`)
  }
  return { success: true }
}

// Admin rejects / un-approves a photo
export async function rejectPhotoAction(photoId: string) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  const photo = await prisma.sitePhoto.update({
    where: { id: photoId },
    data: { approvedForClient: false, approvedById: null, approvedAt: null }
  })

  if (photo.siteId) revalidatePath(`/sites/${photo.siteId}/photos`)
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
    include: { task: true },
  })

  if (!photo) throw new Error('Photo not found or access denied')

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

