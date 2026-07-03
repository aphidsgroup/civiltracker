'use server'

import { auth } from '@/lib/auth'
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

  await prisma.projectChecklistTask.update({
    where: { id: taskId },
    data: {
      status,
      isClientDone,
      isNeglected,
      completedAt: status === 'COMPLETED' ? new Date() : null,
      completedById: status === 'COMPLETED' ? session.user.id : null,
    }
  })
  
  revalidatePath(`/sites/${siteId}`)
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
