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

/*
 * Permanent deletes are confirmed here, not only in the page: the caller passes the text
 * the operator typed, and it must equal the target's current name, read inside the
 * transaction that deletes. The target is re-read there through its exact parent chain
 * up to this tenant's non-global template, deleted with the same parent guard and
 * audited on the same client, so a delete without its audit trail rolls back. The
 * cascade to child rows only runs after every check passes; no audit row is deleted.
 * Project checklists are snapshots, so no project data is affected.
 */
const TEMPLATE_AUDIT_MODULE = 'CHECKLIST_TEMPLATE'

function readConfirmation(confirmation: unknown): string {
  return typeof confirmation === 'string' ? confirmation.trim() : ''
}

async function requireTemplateDelete(templateId: string, confirmation: unknown, mismatch: string) {
  const scope = await requireTenantTemplate(templateId)
  const typed = readConfirmation(confirmation)
  if (!typed) throw new Error(mismatch)
  return { ...scope, typed }
}

const STAGE_DELETE_MISMATCH = 'Delete confirmation text did not match the stage name.'
const CATEGORY_DELETE_MISMATCH = 'Delete confirmation text did not match the category name.'
const TASK_DELETE_MISMATCH = 'Delete confirmation text did not match the task name.'

export async function deleteStage(stageId: string, templateId: string, confirmation: string) {
  const { user, companyId, template, typed } = await requireTemplateDelete(templateId, confirmation, STAGE_DELETE_MISMATCH)

  await prisma.$transaction(async (tx) => {
    const stage = await tx.checklistStage.findFirst({
      where: { id: stageId, template: { id: template.id, companyId, isGlobal: false } },
      select: { id: true, templateId: true, name: true, order: true, weight: true, template: { select: { name: true } }, _count: { select: { categories: true } } },
    })
    if (!stage) throw new Error('FORBIDDEN: Stage not found or access denied')
    if (typed !== stage.name.trim()) throw new Error(STAGE_DELETE_MISMATCH)

    const taskCount = await tx.checklistTask.count({ where: { category: { stageId: stage.id } } })
    const deleted = await tx.checklistStage.deleteMany({ where: { id: stage.id, templateId: template.id } })
    if (deleted.count !== 1) throw new Error('FORBIDDEN: Stage not found or access denied')

    await tx.auditLog.create({
      data: {
        userId: user.id,
        companyId,
        module: TEMPLATE_AUDIT_MODULE,
        action: 'DELETE',
        recordId: template.id,
        before: {
          kind: 'STAGE',
          stageId: stage.id,
          templateId: template.id,
          templateName: stage.template.name,
          name: stage.name,
          order: stage.order,
          weight: stage.weight,
          categoryCount: stage._count.categories,
          taskCount,
        },
        after: { _description: `${user.name ?? user.email} permanently deleted template stage "${stage.name}"` },
      },
    })
  })

  revalidatePath(`/checklists/${template.id}`)
}

export async function deleteCategory(categoryId: string, templateId: string, confirmation: string) {
  const { user, companyId, template, typed } = await requireTemplateDelete(templateId, confirmation, CATEGORY_DELETE_MISMATCH)

  await prisma.$transaction(async (tx) => {
    const category = await tx.checklistCategory.findFirst({
      where: { id: categoryId, stage: { template: { id: template.id, companyId, isGlobal: false } } },
      select: {
        id: true, stageId: true, name: true, order: true,
        stage: { select: { name: true, template: { select: { name: true } } } },
        _count: { select: { tasks: true } },
      },
    })
    if (!category) throw new Error('FORBIDDEN: Category not found or access denied')
    if (typed !== category.name.trim()) throw new Error(CATEGORY_DELETE_MISMATCH)

    const deleted = await tx.checklistCategory.deleteMany({
      where: { id: category.id, stageId: category.stageId, stage: { templateId: template.id } },
    })
    if (deleted.count !== 1) throw new Error('FORBIDDEN: Category not found or access denied')

    await tx.auditLog.create({
      data: {
        userId: user.id,
        companyId,
        module: TEMPLATE_AUDIT_MODULE,
        action: 'DELETE',
        recordId: template.id,
        before: {
          kind: 'CATEGORY',
          categoryId: category.id,
          stageId: category.stageId,
          templateId: template.id,
          templateName: category.stage.template.name,
          stageName: category.stage.name,
          name: category.name,
          order: category.order,
          taskCount: category._count.tasks,
        },
        after: { _description: `${user.name ?? user.email} permanently deleted template category "${category.name}"` },
      },
    })
  })

  revalidatePath(`/checklists/${template.id}`)
}

export async function deleteTask(taskId: string, templateId: string, confirmation: string) {
  const { user, companyId, template, typed } = await requireTemplateDelete(templateId, confirmation, TASK_DELETE_MISMATCH)

  await prisma.$transaction(async (tx) => {
    const task = await tx.checklistTask.findFirst({
      where: { id: taskId, category: { stage: { template: { id: template.id, companyId, isGlobal: false } } } },
      select: {
        id: true, categoryId: true, name: true, order: true, isRequired: true,
        category: { select: { name: true, stageId: true, stage: { select: { name: true, template: { select: { name: true } } } } } },
      },
    })
    if (!task) throw new Error('FORBIDDEN: Task not found or access denied')
    if (typed !== task.name.trim()) throw new Error(TASK_DELETE_MISMATCH)

    const deleted = await tx.checklistTask.deleteMany({
      where: { id: task.id, categoryId: task.categoryId, category: { stage: { templateId: template.id } } },
    })
    if (deleted.count !== 1) throw new Error('FORBIDDEN: Task not found or access denied')

    await tx.auditLog.create({
      data: {
        userId: user.id,
        companyId,
        module: TEMPLATE_AUDIT_MODULE,
        action: 'DELETE',
        recordId: template.id,
        before: {
          kind: 'TASK',
          taskId: task.id,
          categoryId: task.categoryId,
          stageId: task.category.stageId,
          templateId: template.id,
          templateName: task.category.stage.template.name,
          stageName: task.category.stage.name,
          categoryName: task.category.name,
          name: task.name,
          order: task.order,
          isRequired: task.isRequired,
        },
        after: { _description: `${user.name ?? user.email} permanently deleted template task "${task.name}"` },
      },
    })
  })

  revalidatePath(`/checklists/${template.id}`)
}
