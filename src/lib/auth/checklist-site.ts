import { Role } from '@prisma/client'
import { requireUser } from '@/lib/auth/require-user'
import prisma from '@/lib/prisma'

export async function requireChecklistSite(siteId: string) {
  const user = await requireUser()
  const site = await prisma.site.findFirst({
    where: {
      id: siteId,
      deletedAt: null,
      ...(user.role === Role.SUPER_ADMIN ? {} : { companyId: user.companyId! }),
    },
    select: { id: true, companyId: true },
  })
  if (!site) throw new Error('FORBIDDEN: Site not found or access denied')
  return { user, site }
}

export async function requireChecklistTask(siteId: string, taskId: string) {
  const { user, site } = await requireChecklistSite(siteId)
  const task = await prisma.projectChecklistTask.findFirst({
    where: { id: taskId, category: { stage: { checklist: { siteId: site.id, companyId: site.companyId } } } },
    select: { id: true, name: true },
  })
  if (!task) throw new Error('FORBIDDEN: Checklist task not found or access denied')
  return { user, site, task }
}

export async function requireChecklistCategory(siteId: string, categoryId: string) {
  const { user, site } = await requireChecklistSite(siteId)
  const category = await prisma.projectChecklistCategory.findFirst({
    where: { id: categoryId, stage: { checklist: { siteId: site.id, companyId: site.companyId } } },
    select: { id: true },
  })
  if (!category) throw new Error('FORBIDDEN: Checklist category not found or access denied')
  return { user, site, category }
}

export async function requireProjectChecklist(siteId: string) {
  const { user, site } = await requireChecklistSite(siteId)
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
