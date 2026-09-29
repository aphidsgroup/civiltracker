import { Role } from '@prisma/client'
import type { Prisma } from '@prisma/client'
import { requireUser } from '@/lib/auth/require-user'
import { requireModuleEnabled } from '@/lib/auth/require-module'
import { activeClientSiteWhere } from '@/lib/auth/client-portal'
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

/**
 * Reading a checklist is an explicit grant too: managers (`tasks.manage`), field staff
 * who view DPRs (`dpr.view`), and portal clients (`clientPortal.view`). Every other role
 * (VENDOR, SUBCONTRACTOR, ACCOUNTANT, PURCHASE_MANAGER) reads nothing.
 */
const CHECKLIST_READ_GRANTS: Permission[] = ['tasks.manage', 'dpr.view', 'clientPortal.view']

/**
 * The live principal, checked before any checklist data is read: the mutation's grant
 * (the read grant when none is passed), a tenant company for every role but SUPER_ADMIN,
 * and the TASKS module on the live company. Reads and writes share this gate.
 */
async function requireChecklistPrincipal(mutation?: ChecklistMutation) {
  const user = await requireUser()
  const grants = mutation ? CHECKLIST_MUTATION_GRANTS[mutation] : CHECKLIST_READ_GRANTS
  if (!grants.some((permission) => hasPermission(user.role, permission))) {
    throw new Error(`FORBIDDEN: Checklist ${mutation ?? 'read'} requires ${grants.join(' or ')}`)
  }
  if (user.role !== Role.SUPER_ADMIN && !user.companyId) throw new Error('FORBIDDEN: Tenant context required')
  await requireModuleEnabled('TASKS')
  return user
}

/**
 * The live sites whose checklists `user` may read or write: any live site for
 * SUPER_ADMIN; a CLIENT only the live sites of their company explicitly assigned to them
 * while that company is active; every other role its `assignedSiteScope`
 * (SITE_ENGINEER / SUPERVISOR only their assigned sites via an active membership).
 */
async function checklistSiteScope(user: SessionUser): Promise<Prisma.SiteWhereInput> {
  if (user.role === Role.SUPER_ADMIN) return { deletedAt: null }
  if (!user.companyId) throw new Error('FORBIDDEN: Tenant context required')
  if (user.role === Role.CLIENT) return { ...activeClientSiteWhere(user.id), companyId: user.companyId }
  return assignedSiteScope(user, user.companyId)
}

/**
 * Resolves a site within the caller's `checklistSiteScope`. Reads pass no `mutation` and
 * need the checklist read grant; every write passes the grant it needs. Either way the
 * live role and the TASKS module are checked before the site is read.
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
 * reads that span sites; gated like any checklist read. `null` for a SUPER_ADMIN, who
 * has no single company to list: such a read must name a site.
 */
export async function listChecklistSites() {
  const user = await requireChecklistPrincipal()
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

/**
 * Resolves a site photo for client-visibility moderation. The live role must hold
 * `tasks.manage` with TASKS enabled, and the caller's `checklistSiteScope` is resolved,
 * before the photo is read; the photo is then read only on a site inside that scope
 * (field roles: assigned live sites), of the caller's company. `scope` is returned so the
 * write can repeat the same binding.
 */
export async function requireChecklistPhoto(photoId: string) {
  const user = await requireChecklistPrincipal('manage')
  if (typeof photoId !== 'string' || !photoId || photoId.length > 64) {
    throw new Error('FORBIDDEN: Site photo not found or access denied')
  }
  const scope = await checklistSiteScope(user)
  const photo = await prisma.sitePhoto.findFirst({
    where: {
      id: photoId,
      ...(user.role === Role.SUPER_ADMIN ? {} : { companyId: user.companyId! }),
      site: scope,
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
  return { user, photo, scope }
}
