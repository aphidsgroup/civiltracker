import { Role } from '@prisma/client'
import type { Prisma } from '@prisma/client'
import { requireUser } from '@/lib/auth/require-user'
import { requireModuleEnabled } from '@/lib/auth/require-module'
import { assignedSiteScope } from '@/lib/auth/site-mutation'
import { hasPermission } from '@/lib/permissions'
import type { Permission } from '@/lib/permissions'
import prisma from '@/lib/prisma'
import type { SessionUser } from '@/types'

/**
 * What a checklist mutation needs, from the existing permission vocabulary. Any one of
 * the listed permissions admits the live role; every mutation also needs TASKS.
 * - `manage`: structure and manager-only flags (enable/delete checklist, add/edit/delete
 *   tasks, neglect categories, client-done/neglected task flags).
 * - `progress`: ticking a task's status — managers, and field staff who file DPRs.
 * - `photo`: attaching a checklist completion photo.
 */
export type ChecklistMutation = 'manage' | 'progress' | 'photo'

const CHECKLIST_MUTATION_GRANTS: Record<ChecklistMutation, Permission[]> = {
  manage: ['tasks.manage'],
  progress: ['tasks.manage', 'dpr.create'],
  photo: ['tasks.manage', 'sitePhotos.upload'],
}

async function requireChecklistPrincipal(mutation?: ChecklistMutation) {
  const user = await requireUser()
  if (mutation) {
    const grants = CHECKLIST_MUTATION_GRANTS[mutation]
    if (!grants.some((permission) => hasPermission(user.role, permission))) {
      throw new Error(`FORBIDDEN: Checklist ${mutation} requires ${grants.join(' or ')}`)
    }
    await requireModuleEnabled('TASKS')
  }
  return user
}

/**
 * The live sites whose checklists `user` may read or write: any live site for
 * SUPER_ADMIN; a CLIENT only the live company sites they are the client of; every other
 * role its `assignedSiteScope` (SITE_ENGINEER / SUPERVISOR only their assigned sites).
 */
async function checklistSiteScope(user: SessionUser): Promise<Prisma.SiteWhereInput> {
  if (user.role === Role.SUPER_ADMIN) return { deletedAt: null }
  if (!user.companyId) throw new Error('FORBIDDEN: Tenant context required')
  if (user.role === Role.CLIENT) return { companyId: user.companyId, deletedAt: null, clientUserId: user.id }
  return assignedSiteScope(user, user.companyId)
}

/**
 * Resolves a site within the caller's `checklistSiteScope`. Reads pass no `mutation`;
 * every checklist write passes the grant it needs, which is checked on the live role and
 * the TASKS module before the site is read.
 */
export async function requireChecklistSite(siteId: string, mutation?: ChecklistMutation) {
  const user = await requireChecklistPrincipal(mutation)
  const scope = await checklistSiteScope(user)
  const site = await prisma.site.findFirst({
    where: { id: siteId, ...scope },
    select: { id: true, companyId: true },
  })
  if (!site) throw new Error('FORBIDDEN: Site not found or access denied')
  return { user, site }
}

/**
 * The sites whose checklists a tenant caller may read, all of the caller's company, for
 * reads that span sites. `null` when the caller has no single company to list (a
 * SUPER_ADMIN, or a principal without a company): such a read must name a site.
 */
export async function listChecklistSites() {
  const user = await requireUser()
  if (user.role === Role.SUPER_ADMIN || !user.companyId) return null
  const sites = await prisma.site.findMany({ where: await checklistSiteScope(user), select: { id: true } })
  return { companyId: user.companyId, siteIds: sites.map((site) => site.id) }
}

export async function requireChecklistTask(siteId: string, taskId: string, mutation?: ChecklistMutation) {
  const { user, site } = await requireChecklistSite(siteId, mutation)
  const task = await prisma.projectChecklistTask.findFirst({
    where: { id: taskId, category: { stage: { checklist: { siteId: site.id, companyId: site.companyId } } } },
    select: { id: true, name: true },
  })
  if (!task) throw new Error('FORBIDDEN: Checklist task not found or access denied')
  return { user, site, task }
}

export async function requireChecklistCategory(siteId: string, categoryId: string, mutation?: ChecklistMutation) {
  const { user, site } = await requireChecklistSite(siteId, mutation)
  const category = await prisma.projectChecklistCategory.findFirst({
    where: { id: categoryId, stage: { checklist: { siteId: site.id, companyId: site.companyId } } },
    select: { id: true },
  })
  if (!category) throw new Error('FORBIDDEN: Checklist category not found or access denied')
  return { user, site, category }
}

export async function requireProjectChecklist(siteId: string, mutation?: ChecklistMutation) {
  const { user, site } = await requireChecklistSite(siteId, mutation)
  const checklist = await prisma.projectChecklist.findFirst({
    where: { siteId: site.id, companyId: site.companyId },
    select: { id: true },
  })
  if (!checklist) throw new Error('FORBIDDEN: Project checklist not found or access denied')
  return { user, site, checklist }
}

export async function requireChecklistPhoto(photoId: string) {
  const user = await requireUser()
  const photo = await prisma.sitePhoto.findFirst({
    where: {
      id: photoId,
      ...(user.role === Role.SUPER_ADMIN ? {} : { companyId: user.companyId! }),
      site: { deletedAt: null, ...(user.role === Role.SUPER_ADMIN ? {} : { companyId: user.companyId! }) },
    },
    include: {
      site: { select: { companyId: true } },
      task: {
        select: {
          category: { select: { stage: { select: { checklist: { select: { siteId: true, companyId: true } } } } } },
        },
      },
    },
  })
  if (!photo) throw new Error('FORBIDDEN: Site photo not found or access denied')
  if (photo.companyId !== photo.site.companyId) {
    throw new Error('FORBIDDEN: Site photo company does not match its site')
  }
  const checklist = photo.task?.category.stage.checklist
  if (checklist && (checklist.siteId !== photo.siteId || checklist.companyId !== photo.companyId)) {
    throw new Error('FORBIDDEN: Checklist photo task is not linked to its site')
  }
  if (!['SUPER_ADMIN', 'COMPANY_ADMIN', 'PROJECT_MANAGER'].includes(user.role)) {
    throw new Error('FORBIDDEN: Photo moderation requires an authorized manager')
  }
  return { user, photo }
}
