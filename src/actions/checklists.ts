'use server'

import { auth } from '@/lib/auth'
import { requireUser } from '@/lib/auth/require-user'
import {
  listChecklistSites,
  requireChecklistCategory,
  requireChecklistPhoto,
  requireChecklistSite,
  requireChecklistTask,
} from '@/lib/auth/checklist-site'
import { activeClientSiteWhere } from '@/lib/auth/client-portal'
import { requireAssignedSiteMutation } from '@/lib/auth/site-mutation'
import { hasPermission } from '@/lib/permissions'
import prisma from '@/lib/prisma'
import { UPLOAD_POLICIES } from '@/lib/uploads/upload-policy'
import { bindMediaClaim, claimMediaAsset } from '@/lib/uploads/media-claim'
import { parseChecklistTaskName } from '@/lib/validation/checklists'
import { revalidatePath } from 'next/cache'

/*
 * Structure changes (enable a checklist, neglect a category, add or rename a task) bind
 * the site to the caller's checklist scope with `tasks.manage` and TASKS first, then
 * re-read their target on exactly that site's checklist, write, and append a CHECKLIST
 * audit event on the same transaction client, so a change without its audit rolls back.
 */

// Deep clone a master template to a project
export async function enableChecklistForProject(siteId: string, templateId: string) {
  const { user, site } = await requireChecklistSite(siteId, 'manage')

  await prisma.$transaction(async (tx) => {
    const existing = await tx.projectChecklist.findFirst({
      where: { siteId: site.id, companyId: site.companyId },
    })
    if (existing) throw new Error('Checklist already enabled for this project')

    const template = await tx.checklistTemplate.findFirst({
      where: { id: templateId, OR: [{ companyId: site.companyId }, { isGlobal: true }] },
      include: { stages: { include: { categories: { include: { tasks: true } } } } },
    })
    if (!template) throw new Error('FORBIDDEN: Template not found or access denied')

    const checklist = await tx.projectChecklist.create({
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
      select: { id: true },
    })

    const categories = template.stages.flatMap((stage) => stage.categories)
    await tx.auditLog.create({
      data: {
        userId: user.id,
        companyId: site.companyId,
        module: 'CHECKLIST',
        action: 'CREATE',
        recordId: site.id,
        after: {
          change: 'CHECKLIST_ENABLED',
          checklistId: checklist.id,
          templateId: template.id,
          siteId: site.id,
          stageCount: template.stages.length,
          categoryCount: categories.length,
          taskCount: categories.reduce((sum, category) => sum + category.tasks.length, 0),
        },
      },
    })
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


const CATEGORY_NOT_FOUND = 'FORBIDDEN: Checklist category not found or access denied'
const TASK_NOT_FOUND = 'FORBIDDEN: Checklist task not found or access denied'

export async function toggleCategoryNeglect(siteId: string, categoryId: string, isNeglected: boolean) {
  const { user, site, category } = await requireChecklistCategory(siteId, categoryId, 'manage')

  await prisma.$transaction(async (tx) => {
    const current = await tx.projectChecklistCategory.findFirst({
      where: { id: category.id, stage: { checklist: { siteId: site.id, companyId: site.companyId } } },
      select: { id: true, name: true, isNeglected: true },
    })
    if (!current) throw new Error(CATEGORY_NOT_FOUND)

    await tx.projectChecklistCategory.update({ where: { id: current.id }, data: { isNeglected }, select: { id: true } })

    await tx.auditLog.create({
      data: {
        userId: user.id,
        companyId: site.companyId,
        module: 'CHECKLIST',
        action: 'UPDATE',
        recordId: site.id,
        before: { categoryId: current.id, siteId: site.id, isNeglected: current.isNeglected },
        after: { change: 'CATEGORY_NEGLECT', categoryId: current.id, categoryName: current.name, siteId: site.id, isNeglected },
      },
    })
  })

  revalidatePath(`/sites/${site.id}`)
  return { success: true }
}

// Task names are validated and normalized before the gate, so an invalid name reads nothing.
export async function addCustomTask(siteId: string, categoryId: string, rawName: string) {
  const name = parseChecklistTaskName(rawName)
  const { user, site, category } = await requireChecklistCategory(siteId, categoryId, 'manage')

  await prisma.$transaction(async (tx) => {
    const parent = await tx.projectChecklistCategory.findFirst({
      where: { id: category.id, stage: { checklist: { siteId: site.id, companyId: site.companyId } } },
      select: { id: true },
    })
    if (!parent) throw new Error(CATEGORY_NOT_FOUND)

    const task = await tx.projectChecklistTask.create({
      data: { categoryId: parent.id, name, order: 999 },
      select: { id: true, name: true },
    })

    await tx.auditLog.create({
      data: {
        userId: user.id,
        companyId: site.companyId,
        module: 'CHECKLIST',
        action: 'CREATE',
        recordId: site.id,
        after: { change: 'TASK_CREATED', taskId: task.id, taskName: task.name, categoryId: parent.id, siteId: site.id },
      },
    })
  })

  revalidatePath(`/sites/${site.id}`)
  return { success: true }
}

export async function editChecklistTask(siteId: string, taskId: string, rawName: string) {
  const newName = parseChecklistTaskName(rawName)
  const { user, site, task } = await requireChecklistTask(siteId, taskId, 'manage')

  await prisma.$transaction(async (tx) => {
    const current = await tx.projectChecklistTask.findFirst({
      where: { id: task.id, category: { stage: { checklist: { siteId: site.id, companyId: site.companyId } } } },
      select: { id: true, name: true },
    })
    if (!current) throw new Error(TASK_NOT_FOUND)

    await tx.projectChecklistTask.update({ where: { id: current.id }, data: { name: newName }, select: { id: true } })

    await tx.auditLog.create({
      data: {
        userId: user.id,
        companyId: site.companyId,
        module: 'CHECKLIST',
        action: 'UPDATE',
        recordId: site.id,
        before: { taskId: current.id, siteId: site.id, taskName: current.name },
        after: { change: 'TASK_RENAMED', taskId: current.id, siteId: site.id, taskName: newName },
      },
    })
  })

  revalidatePath(`/sites/${site.id}`)
  return { success: true }
}

/*
 * Permanent deletes are confirmed here, not only in the page: the caller passes the text
 * the operator typed, and it must equal the target's current canonical value (the task
 * name, or the site name for a whole checklist) read inside the transaction that deletes.
 * The site is bound to the caller's checklist scope with `tasks.manage` and TASKS first;
 * the target is then re-read on exactly that site's checklist, deleted with the same
 * guard, and audited on the same client, so a delete without its audit trail rolls back.
 * The cascade (tasks, attachments, checklist photos) only runs after every check passes;
 * no audit row is deleted, and the audit snapshot records what the cascade removed.
 */
const TASK_DELETE_MISMATCH = 'Delete confirmation text did not match the task name.'
const CHECKLIST_DELETE_MISMATCH = 'Delete confirmation text did not match the site name.'

function readConfirmation(confirmation: unknown): string {
  return typeof confirmation === 'string' ? confirmation.trim() : ''
}

export async function deleteChecklistTask(siteId: string, taskId: string, confirmation: string) {
  const { user, site } = await requireChecklistSite(siteId, 'manage')
  const typed = readConfirmation(confirmation)
  if (!typed) throw new Error(TASK_DELETE_MISMATCH)

  await prisma.$transaction(async (tx) => {
    const task = await tx.projectChecklistTask.findFirst({
      where: { id: taskId, category: { stage: { checklist: { siteId: site.id, companyId: site.companyId } } } },
      select: {
        id: true, name: true, categoryId: true, status: true, isClientDone: true, isNeglected: true, completedAt: true,
        category: { select: { name: true, stage: { select: { name: true, checklistId: true } } } },
        _count: { select: { sitePhotos: true, attachments: true } },
      },
    })
    if (!task) throw new Error('FORBIDDEN: Checklist task not found or access denied')
    if (typed !== task.name.trim()) throw new Error(TASK_DELETE_MISMATCH)

    const deleted = await tx.projectChecklistTask.deleteMany({ where: { id: task.id, categoryId: task.categoryId } })
    if (deleted.count !== 1) throw new Error('FORBIDDEN: Checklist task not found or access denied')

    await tx.auditLog.create({
      data: {
        userId: user.id,
        companyId: site.companyId,
        module: 'CHECKLIST',
        action: 'DELETE',
        recordId: site.id,
        before: {
          taskId: task.id,
          taskName: task.name,
          siteId: site.id,
          checklistId: task.category.stage.checklistId,
          stageName: task.category.stage.name,
          categoryName: task.category.name,
          status: task.status,
          isClientDone: task.isClientDone,
          isNeglected: task.isNeglected,
          completedAt: task.completedAt?.toISOString() ?? null,
          photoCount: task._count.sitePhotos,
          attachmentCount: task._count.attachments,
        },
        after: { _description: `${user.name ?? user.email} permanently deleted checklist task "${task.name}"` },
      },
    })
  })

  revalidatePath(`/sites/${site.id}`)
  return { success: true }
}

export async function deleteProjectChecklist(siteId: string, confirmation: string) {
  const { user, site } = await requireChecklistSite(siteId, 'manage')
  const typed = readConfirmation(confirmation)
  if (!typed) throw new Error(CHECKLIST_DELETE_MISMATCH)

  await prisma.$transaction(async (tx) => {
    const live = await tx.site.findFirst({
      where: { id: site.id, companyId: site.companyId, deletedAt: null },
      select: { name: true },
    })
    if (!live) throw new Error('FORBIDDEN: Site not found or access denied')

    const checklist = await tx.projectChecklist.findFirst({
      where: { siteId: site.id, companyId: site.companyId },
      select: { id: true, templateId: true, createdAt: true, _count: { select: { stages: true } } },
    })
    if (!checklist) throw new Error('FORBIDDEN: Project checklist not found or access denied')
    if (typed !== live.name.trim()) throw new Error(CHECKLIST_DELETE_MISMATCH)

    const inChecklist = { category: { stage: { checklistId: checklist.id } } }
    const taskCount = await tx.projectChecklistTask.count({ where: inChecklist })
    const completedCount = await tx.projectChecklistTask.count({ where: { ...inChecklist, status: 'COMPLETED' } })
    const photoCount = await tx.sitePhoto.count({ where: { task: inChecklist } })

    const deleted = await tx.projectChecklist.deleteMany({
      where: { id: checklist.id, siteId: site.id, companyId: site.companyId },
    })
    if (deleted.count !== 1) throw new Error('FORBIDDEN: Project checklist not found or access denied')

    await tx.auditLog.create({
      data: {
        userId: user.id,
        companyId: site.companyId,
        module: 'CHECKLIST',
        action: 'DELETE',
        recordId: site.id,
        before: {
          checklistId: checklist.id,
          templateId: checklist.templateId,
          siteId: site.id,
          siteName: live.name,
          createdAt: checklist.createdAt.toISOString(),
          stageCount: checklist._count.stages,
          taskCount,
          completedCount,
          photoCount,
        },
        after: { _description: `${user.name ?? user.email} permanently deleted the checklist of site "${live.name}"` },
      },
    })
  })

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
const MEDIA_ALREADY_USED = 'FORBIDDEN: Uploaded photo is already attached'

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

    const assetPolicy = { id: assetId, companyId: user.companyId, siteId: site.id, module: 'SITE_PHOTO', uploadedById: user.id }
    const asset = await tx.mediaAsset.findFirst({
      where: assetPolicy,
      select: { secureUrl: true, cloudinaryPublicId: true },
    })
    if (!asset) throw new Error(MEDIA_NOT_FOUND)

    // One upload backs one photo row, so deleting a photo never strands another's image.
    // The claim is a guarded write on the asset row: a concurrent attach of the same upload
    // (checklist or site photo) waits and is then refused, and a failure below rolls the
    // claim back. The photo check covers photos attached before claims existed.
    await claimMediaAsset(tx, assetPolicy, 'CHECKLIST_PHOTO', MEDIA_ALREADY_USED)
    const bound = await tx.sitePhoto.findFirst({
      where: { cloudinaryPublicId: asset.cloudinaryPublicId },
      select: { id: true },
    })
    if (bound) throw new Error(MEDIA_ALREADY_USED)

    const photo = await tx.sitePhoto.create({
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
    await bindMediaClaim(tx, assetId, 'CHECKLIST_PHOTO', photo.id, MEDIA_ALREADY_USED)

    // Identifiers only: the event never carries the stored URL or provider public id.
    await tx.auditLog.create({
      data: {
        userId: user.id,
        companyId: site.companyId,
        module: 'SITE_PHOTO',
        action: 'CREATE',
        recordId: photo.id,
        after: { change: 'CHECKLIST_PHOTO_ATTACHED', photoId: photo.id, mediaAssetId: assetId, taskId: task.id, siteId: site.id },
      },
    })
  })

  revalidatePath(`/sites/${site.id}/photos`)
  revalidatePath(`/mobile/checklist`)
  return { success: true }
}


const PHOTO_NOT_FOUND = 'FORBIDDEN: Site photo not found or access denied'

/*
 * Sets whether a site photo is visible to the client. `requireChecklistPhoto` checks the
 * live `tasks.manage` grant and TASKS module and resolves the caller's checklist site
 * scope before reading the photo, then binds it to a live site in that scope and company;
 * the photo is re-read on the transaction client with that same binding, written with a
 * guarded `updateMany` that must match exactly one row, and audited as SITE_PHOTO APPROVE
 * or REJECT on the same client, so a visibility change without its audit rolls back.
 */
async function setClientVisibility(photoId: string, approve: boolean) {
  const { user, photo, scope } = await requireChecklistPhoto(photoId)
  const bound = {
    id: photo.id,
    companyId: photo.companyId,
    siteId: photo.siteId,
    site: { ...scope, companyId: photo.companyId, deletedAt: null },
  }

  await prisma.$transaction(async (tx) => {
    const current = await tx.sitePhoto.findFirst({
      where: bound,
      select: { id: true, siteId: true, taskId: true, approvedForClient: true, approvedById: true },
    })
    if (!current) throw new Error(PHOTO_NOT_FOUND)

    const next = approve
      ? { approvedForClient: true, approvedById: user.id, approvedAt: new Date() }
      : { approvedForClient: false, approvedById: null, approvedAt: null }
    const result = await tx.sitePhoto.updateMany({ where: bound, data: next })
    if (result.count !== 1) throw new Error(PHOTO_NOT_FOUND)

    const ids = { photoId: current.id, siteId: current.siteId, taskId: current.taskId }
    await tx.auditLog.create({
      data: {
        userId: user.id,
        companyId: photo.companyId,
        module: 'SITE_PHOTO',
        action: approve ? 'APPROVE' : 'REJECT',
        recordId: current.id,
        before: { ...ids, approvedForClient: current.approvedForClient, approvedById: current.approvedById },
        after: { ...ids, ...next, approvedAt: next.approvedAt?.toISOString() ?? null },
      },
    })
  })

  return photo.siteId
}

// Admin approves a site photo → makes it visible to client
export async function approvePhotoAction(photoId: string) {
  const siteId = await setClientVisibility(photoId, true)
  if (siteId) {
    revalidatePath(`/sites/${siteId}/photos`)
    revalidatePath(`/client-portal`)
    revalidatePath(`/client-portal/photos`)
  }
  return { success: true }
}

export async function rejectPhotoAction(photoId: string) {
  const siteId = await setClientVisibility(photoId, false)
  if (siteId) revalidatePath(`/sites/${siteId}/photos`)
  return { success: true }
}

const CLIENT_PHOTO_NOT_FOUND = 'Photo not found or access denied'

/*
 * Client confirms a task photo they were shown, marking its task completed and
 * client-done. The photo is re-read on the transaction client: approved for the client,
 * on an active site of the client's live company that is explicitly assigned to them.
 * Its task must be on that site's checklist and not yet client-confirmed. The guarded
 * write repeats that binding and the observed state and must match exactly one row, and
 * the required CHECKLIST CLIENT_APPROVE audit record shares the transaction, so an audit
 * failure rolls the confirmation back.
 */
export async function clientApproveTaskPhoto(photoId: string) {
  const user = await requireUser()
  if (user.role !== 'CLIENT') throw new Error('FORBIDDEN: Client portal access required')
  if (!user.companyId) throw new Error('FORBIDDEN: Tenant context required')
  if (typeof photoId !== 'string' || !photoId || photoId.length > 64) throw new Error(CLIENT_PHOTO_NOT_FOUND)
  const companyId = user.companyId

  await prisma.$transaction(async (tx) => {
    const photo = await tx.sitePhoto.findFirst({
      where: {
        id: photoId,
        approvedForClient: true,
        site: { ...activeClientSiteWhere(user.id), companyId },
      },
      select: { id: true, siteId: true, companyId: true, taskId: true, site: { select: { id: true, companyId: true } } },
    })
    if (!photo) throw new Error(CLIENT_PHOTO_NOT_FOUND)
    if (photo.companyId !== photo.site.companyId) {
      throw new Error('Photo company does not match its authorized site')
    }
    if (!photo.taskId) throw new Error('Photo is not linked to a checklist task')

    const taskOnSite = {
      id: photo.taskId,
      category: { stage: { checklist: { siteId: photo.site.id, companyId: photo.site.companyId } } },
    }
    const task = await tx.projectChecklistTask.findFirst({
      where: taskOnSite,
      select: { id: true, name: true, status: true, isClientDone: true, completedAt: true },
    })
    if (!task) throw new Error('Photo task is not linked to the authorized site')
    if (task.isClientDone) throw new Error('Task is already confirmed by the client')

    // A task staff already completed keeps its completion time.
    const completedAt = task.status === 'COMPLETED' && task.completedAt ? task.completedAt : new Date()
    const result = await tx.projectChecklistTask.updateMany({
      where: { ...taskOnSite, isClientDone: false, status: task.status },
      data: { isClientDone: true, status: 'COMPLETED', completedAt },
    })
    if (result.count !== 1) throw new Error('Task changed while it was being confirmed; reload and try again')

    await tx.auditLog.create({
      data: {
        userId: user.id,
        companyId: photo.site.companyId,
        module: 'CHECKLIST',
        action: 'CLIENT_APPROVE',
        recordId: photo.site.id,
        before: { taskId: task.id, siteId: photo.site.id, photoId: photo.id, status: task.status, isClientDone: false },
        after: { taskId: task.id, taskName: task.name, siteId: photo.site.id, photoId: photo.id, status: 'COMPLETED', isClientDone: true },
      },
    })
  })

  revalidatePath(`/client-portal`)
  revalidatePath(`/client-portal/photos`)
  return { success: true }
}

