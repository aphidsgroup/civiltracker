'use server'

import { requireUser } from '@/lib/auth/require-user'
import { requireModuleEnabled } from '@/lib/auth/require-module'
import { hasPermission } from '@/lib/permissions'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

/**
 * Every template action needs a live company member with `tasks.manage` and the TASKS
 * module, checked before any template row is read. Templates are tenant-owned; global
 * templates are read-only here and can only be cloned into the caller's company.
 */
async function requireTemplateManager() {
  const user = await requireUser()
  if (!user.companyId) throw new Error('FORBIDDEN: Company context required')
  if (!hasPermission(user.role, 'tasks.manage')) {
    throw new Error('FORBIDDEN: Checklist templates require tasks.manage')
  }
  await requireModuleEnabled('TASKS')
  return { user, companyId: user.companyId }
}

async function requireTenantTemplate(templateId: string) {
  const { user, companyId } = await requireTemplateManager()

  const template = await prisma.checklistTemplate.findFirst({
    where: { id: templateId, companyId, isGlobal: false },
    select: { id: true },
  })
  if (!template) throw new Error('FORBIDDEN: Template not found or access denied')

  return { user, companyId, template }
}

export async function createTemplate(formData: FormData) {
  const { companyId } = await requireTemplateManager()

  const name = formData.get('name') as string
  const description = formData.get('description') as string
  const template = await prisma.checklistTemplate.create({
    data: { name, description, companyId, isGlobal: false },
  })

  revalidatePath('/checklists')
  redirect(`/checklists/${template.id}`)
}

export async function cloneTemplate(templateId: string) {
  const { companyId } = await requireTemplateManager()

  const original = await prisma.checklistTemplate.findFirst({
    where: { id: templateId, OR: [{ companyId, isGlobal: false }, { isGlobal: true }] },
    include: { stages: { include: { categories: { include: { tasks: true } } } } },
  })
  if (!original) throw new Error('FORBIDDEN: Template not found or access denied')

  const clone = await prisma.checklistTemplate.create({
    data: {
      name: `${original.name} (Copy)`, description: original.description, companyId, isGlobal: false,
      stages: { create: original.stages.map((stage) => ({
        name: stage.name, order: stage.order, weight: stage.weight,
        categories: { create: stage.categories.map((category) => ({
          name: category.name, order: category.order,
          tasks: { create: category.tasks.map((task) => ({ name: task.name, order: task.order, isRequired: task.isRequired })) },
        })) },
      })) },
    },
  })

  revalidatePath('/checklists')
  return { success: true, id: clone.id }
}

export async function updateTemplateInfo(id: string, name: string, description: string) {
  const { companyId, template } = await requireTenantTemplate(id)
  const updated = await prisma.checklistTemplate.updateMany({
    where: { id: template.id, companyId, isGlobal: false },
    data: { name, description },
  })
  if (updated.count !== 1) throw new Error('FORBIDDEN: Template no longer available')
  revalidatePath(`/checklists/${id}`)
}

export async function addStage(templateId: string, name: string) {
  const { template } = await requireTenantTemplate(templateId)
  await prisma.checklistStage.create({ data: { templateId: template.id, name, order: 999 } })
  revalidatePath(`/checklists/${templateId}`)
}

export async function addCategory(stageId: string, name: string, templateId: string) {
  const { companyId, template } = await requireTenantTemplate(templateId)
  const stage = await prisma.checklistStage.findFirst({
    where: { id: stageId, template: { id: template.id, companyId, isGlobal: false } },
    select: { id: true },
  })
  if (!stage) throw new Error('FORBIDDEN: Stage not found or access denied')
  await prisma.checklistCategory.create({ data: { stageId: stage.id, name, order: 999 } })
  revalidatePath(`/checklists/${templateId}`)
}

export async function addTask(categoryId: string, name: string, templateId: string) {
  const { companyId, template } = await requireTenantTemplate(templateId)
  const category = await prisma.checklistCategory.findFirst({
    where: { id: categoryId, stage: { template: { id: template.id, companyId, isGlobal: false } } },
    select: { id: true },
  })
  if (!category) throw new Error('FORBIDDEN: Category not found or access denied')
  await prisma.checklistTask.create({ data: { categoryId: category.id, name, order: 999 } })
  revalidatePath(`/checklists/${templateId}`)
}

export async function deleteStage(stageId: string, templateId: string) {
  const { companyId, template } = await requireTenantTemplate(templateId)
  const stage = await prisma.checklistStage.findFirst({
    where: { id: stageId, template: { id: template.id, companyId, isGlobal: false } }, select: { id: true },
  })
  if (!stage) throw new Error('FORBIDDEN: Stage not found or access denied')
  await prisma.checklistStage.delete({ where: { id: stage.id } })
  revalidatePath(`/checklists/${templateId}`)
}

export async function deleteCategory(categoryId: string, templateId: string) {
  const { companyId, template } = await requireTenantTemplate(templateId)
  const category = await prisma.checklistCategory.findFirst({
    where: { id: categoryId, stage: { template: { id: template.id, companyId, isGlobal: false } } }, select: { id: true },
  })
  if (!category) throw new Error('FORBIDDEN: Category not found or access denied')
  await prisma.checklistCategory.delete({ where: { id: category.id } })
  revalidatePath(`/checklists/${templateId}`)
}

export async function deleteTask(taskId: string, templateId: string) {
  const { companyId, template } = await requireTenantTemplate(templateId)
  const task = await prisma.checklistTask.findFirst({
    where: { id: taskId, category: { stage: { template: { id: template.id, companyId, isGlobal: false } } } }, select: { id: true },
  })
  if (!task) throw new Error('FORBIDDEN: Task not found or access denied')
  await prisma.checklistTask.delete({ where: { id: task.id } })
  revalidatePath(`/checklists/${templateId}`)
}
