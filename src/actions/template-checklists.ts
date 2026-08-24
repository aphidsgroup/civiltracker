'use server'

import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

async function requireTemplateAccess(templateId: string) {
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')
  const user = session.user

  const template = await prisma.checklistTemplate.findUnique({ where: { id: templateId } })
  if (!template) throw new Error('Template not found')

  if (user.role === 'SUPER_ADMIN') {
    if (!template.isGlobal) {
      throw new Error('Forbidden: super admins may only edit global master templates')
    }
  } else if (user.role === 'COMPANY_ADMIN') {
    if (!user.companyId || template.isGlobal || template.companyId !== user.companyId) {
      throw new Error('Forbidden: template does not belong to your company')
    }
  } else {
    throw new Error('Forbidden: only company admins can edit checklist templates')
  }

  return { user, template }
}

async function requireStageInTemplate(stageId: string, templateId: string) {
  const stage = await prisma.checklistStage.findUnique({ where: { id: stageId }, select: { templateId: true } })
  if (!stage || stage.templateId !== templateId) {
    throw new Error('Forbidden: stage does not belong to this template')
  }
}

async function requireCategoryInTemplate(categoryId: string, templateId: string) {
  const category = await prisma.checklistCategory.findUnique({
    where: { id: categoryId },
    select: { stage: { select: { templateId: true } } },
  })
  if (!category || category.stage.templateId !== templateId) {
    throw new Error('Forbidden: category does not belong to this template')
  }
}

async function requireTaskInTemplate(taskId: string, templateId: string) {
  const task = await prisma.checklistTask.findUnique({
    where: { id: taskId },
    select: { category: { select: { stage: { select: { templateId: true } } } } },
  })
  if (!task || task.category.stage.templateId !== templateId) {
    throw new Error('Forbidden: task does not belong to this template')
  }
}

export async function createTemplate(formData: FormData) {
  const session = await auth()
  if (!session?.user?.companyId || session.user.role !== 'COMPANY_ADMIN') throw new Error('Unauthorized')

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
  if (!session?.user?.companyId || session.user.role !== 'COMPANY_ADMIN') throw new Error('Unauthorized')

  const original = await prisma.checklistTemplate.findUnique({
    where: { id: templateId },
    include: {
      stages: {
        include: { categories: { include: { tasks: true } } }
      }
    }
  })

  if (!original) throw new Error('Template not found')
  if (!original.isGlobal) throw new Error('Forbidden: only global master templates can be cloned')

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
  await requireTemplateAccess(id)

  await prisma.checklistTemplate.update({
    where: { id },
    data: { name, description }
  })
  revalidatePath(`/checklists/${id}`)
}

export async function addStage(templateId: string, name: string) {
  await requireTemplateAccess(templateId)

  await prisma.checklistStage.create({
    data: { templateId, name, order: 999 }
  })
  revalidatePath(`/checklists/${templateId}`)
}

export async function addCategory(stageId: string, name: string, templateId: string) {
  await requireTemplateAccess(templateId)
  await requireStageInTemplate(stageId, templateId)

  await prisma.checklistCategory.create({
    data: { stageId, name, order: 999 }
  })
  revalidatePath(`/checklists/${templateId}`)
}

export async function addTask(categoryId: string, name: string, templateId: string) {
  await requireTemplateAccess(templateId)
  await requireCategoryInTemplate(categoryId, templateId)

  await prisma.checklistTask.create({
    data: { categoryId, name, order: 999 }
  })
  revalidatePath(`/checklists/${templateId}`)
}

export async function deleteStage(stageId: string, templateId: string) {
  await requireTemplateAccess(templateId)
  await requireStageInTemplate(stageId, templateId)

  await prisma.checklistStage.delete({ where: { id: stageId } })
  revalidatePath(`/checklists/${templateId}`)
}

export async function deleteCategory(categoryId: string, templateId: string) {
  await requireTemplateAccess(templateId)
  await requireCategoryInTemplate(categoryId, templateId)

  await prisma.checklistCategory.delete({ where: { id: categoryId } })
  revalidatePath(`/checklists/${templateId}`)
}

export async function deleteTask(taskId: string, templateId: string) {
  await requireTemplateAccess(templateId)
  await requireTaskInTemplate(taskId, templateId)

  await prisma.checklistTask.delete({ where: { id: taskId } })
  revalidatePath(`/checklists/${templateId}`)
}
