'use server'

import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createTemplate(formData: FormData) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')
  
  const name = formData.get('name') as string
  const description = formData.get('description') as string

  const template = await prisma.checklistTemplate.create({
    data: {
      name,
      description,
      companyId: session.user.companyId,
      isGlobal: false,
    }
  })

  revalidatePath('/checklists')
  redirect(`/checklists/${template.id}`)
}

export async function cloneTemplate(templateId: string) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  const original = await prisma.checklistTemplate.findUnique({
    where: { id: templateId },
    include: {
      stages: {
        include: { categories: { include: { tasks: true } } }
      }
    }
  })

  if (!original) throw new Error('Template not found')

  const clone = await prisma.checklistTemplate.create({
    data: {
      name: `${original.name} (Copy)`,
      description: original.description,
      companyId: session.user.companyId,
      isGlobal: false,
      stages: {
        create: original.stages.map(stage => ({
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

  revalidatePath('/checklists')
  return { success: true, id: clone.id }
}

export async function updateTemplateInfo(id: string, name: string, description: string) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')

  await prisma.checklistTemplate.updateMany({
    where: { id, companyId: session.user.companyId },
    data: { name, description }
  })
  revalidatePath(`/checklists/${id}`)
}

export async function addStage(templateId: string, name: string) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')
  
  await prisma.checklistStage.create({
    data: { templateId, name, order: 999 }
  })
  revalidatePath(`/checklists/${templateId}`)
}

export async function addCategory(stageId: string, name: string, templateId: string) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')
  
  await prisma.checklistCategory.create({
    data: { stageId, name, order: 999 }
  })
  revalidatePath(`/checklists/${templateId}`)
}

export async function addTask(categoryId: string, name: string, templateId: string) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')
  
  await prisma.checklistTask.create({
    data: { categoryId, name, order: 999 }
  })
  revalidatePath(`/checklists/${templateId}`)
}

export async function deleteStage(stageId: string, templateId: string) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')
  await prisma.checklistStage.delete({ where: { id: stageId } })
  revalidatePath(`/checklists/${templateId}`)
}

export async function deleteCategory(categoryId: string, templateId: string) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')
  await prisma.checklistCategory.delete({ where: { id: categoryId } })
  revalidatePath(`/checklists/${templateId}`)
}

export async function deleteTask(taskId: string, templateId: string) {
  const session = await auth()
  if (!session?.user?.companyId) throw new Error('Unauthorized')
  await prisma.checklistTask.delete({ where: { id: taskId } })
  revalidatePath(`/checklists/${templateId}`)
}
