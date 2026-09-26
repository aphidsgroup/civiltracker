import { Prisma, SiteStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { auditLogData } from '@/lib/audit-data'
import type { TenantMutationUser } from '@/lib/auth/site-mutation'
import { slugify } from '@/lib/utils'
import type { CreateSiteInput } from '@/lib/validation/sites'

/*
 * The one create-site write path, shared by the `createSite` server action and the
 * `/sites/new` form action. Deliberately not a `'use server'` module: it trusts its
 * caller to have run `requireTenantMutation('sites.create', 'SITES')` and validated the
 * payload with `@/lib/validation/sites`, so it must never be exposed as an endpoint.
 */

/** The template tree the `/sites/new` page shows and the checklist snapshot copies. */
export const checklistTemplateTree = {
  stages: {
    orderBy: { order: 'asc' },
    include: {
      categories: {
        orderBy: { order: 'asc' },
        include: {
          tasks: { orderBy: { order: 'asc' } }
        }
      }
    }
  }
} as const

const INVALID_SELECTION = 'Invalid task selection'

export type ChecklistSelection = { templateId: string | null; selectedTaskIds: string[] }

type AssigneeReader = Pick<Prisma.TransactionClient, 'companyMember'>

/**
 * Every non-null id must be an active member of `companyId` whose account is active and
 * not deleted; throws `Invalid site: assignee ...` otherwise. No id, no read.
 */
export async function assertActiveCompanyAssignees(db: AssigneeReader, companyId: string, ids: ReadonlyArray<string | null | undefined>) {
  const assigneeIds = [...new Set(ids.filter((id): id is string => typeof id === 'string'))]
  if (assigneeIds.length === 0) return
  const members = await db.companyMember.findMany({
    where: { companyId, isActive: true, userId: { in: assigneeIds }, user: { isActive: true, deletedAt: null } },
    select: { userId: true },
  })
  const memberIds = new Set(members.map((member) => member.userId))
  if (!assigneeIds.every((id) => memberIds.has(id))) {
    throw new Error('Invalid site: assignee is not an active member of this company')
  }
}

/**
 * Only a template of this company or a global one may be copied, and every selected task
 * must belong to it. Returns the stages to snapshot, or `null` when nothing is selected.
 */
async function resolveChecklistSnapshot(companyId: string, { templateId, selectedTaskIds }: ChecklistSelection) {
  if (!templateId && selectedTaskIds.length > 0) throw new Error(INVALID_SELECTION)
  if (!templateId || selectedTaskIds.length === 0) return null

  const template = await prisma.checklistTemplate.findFirst({
    where: { id: templateId, OR: [{ companyId }, { isGlobal: true }] },
    include: checklistTemplateTree,
  })
  if (!template) throw new Error('FORBIDDEN: Template not found or access denied')

  const selectedSet = new Set(selectedTaskIds)
  const stages = template.stages.map(stage => {
    const categories = stage.categories.map(cat => {
      const tasks = cat.tasks.filter(t => selectedSet.has(t.id))
      return { ...cat, tasks }
    }).filter(cat => cat.tasks.length > 0)
    return { ...stage, categories }
  }).filter(stage => stage.categories.length > 0)

  const matchedTaskCount = stages.reduce((sum, stage) => sum + stage.categories.reduce((catSum, cat) => catSum + cat.tasks.length, 0), 0)
  if (matchedTaskCount !== selectedSet.size) throw new Error(INVALID_SELECTION)

  return { templateId: template.id, stages }
}

/**
 * Creates a validated site for `user`'s live company. The company status, the plan site
 * limit, the assignee memberships and the duplicate-name rule are all re-read on the
 * transaction client; the site, its checklist snapshot and the required audit record are
 * written on it too, so an audit failure rolls the site back.
 */
export async function createSiteForTenant(user: TenantMutationUser, data: CreateSiteInput, selection: ChecklistSelection = { templateId: null, selectedTaskIds: [] }) {
  const companyId = user.companyId
  const snapshot = await resolveChecklistSnapshot(companyId, selection)
  const slug = slugify(data.name)

  try {
    return await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: companyId }, select: { status: true, siteLimit: true } })
      if (!company) throw new Error('Company not found')
      if (company.status === 'SUSPENDED' || company.status === 'CANCELLED') {
        throw new Error('Company is suspended or cancelled')
      }
      const siteCount = await tx.site.count({ where: { companyId } })
      if (siteCount >= company.siteLimit) {
        throw new Error(`Site limit reached (${company.siteLimit}). Please upgrade your plan.`)
      }

      await assertActiveCompanyAssignees(tx, companyId, [data.assignedPmId, data.assignedEngineerId])

      const existing = await tx.site.findFirst({ where: { companyId, slug, deletedAt: null }, select: { id: true } })
      if (existing) throw new Error('A site with a similar name already exists.')

      const site = await tx.site.create({
        data: {
          companyId,
          name: data.name,
          slug,
          location: data.location,
          address: data.address,
          clientName: data.clientName,
          clientPhone: data.clientPhone,
          clientEmail: data.clientEmail,
          mapLink: data.mapLink,
          projectType: data.projectType,
          contractType: data.contractType,
          areaSqft: data.areaSqft,
          floors: data.floors,
          budget: data.budget,
          contractValue: data.contractValue,
          startDate: data.startDate,
          targetEndDate: data.targetEndDate,
          assignedPmId: data.assignedPmId,
          assignedEngineerId: data.assignedEngineerId,
          status: SiteStatus.PLANNING,
          createdById: user.id,
        }
      })

      if (snapshot) {
        await tx.projectChecklist.create({
          data: {
            siteId: site.id,
            templateId: snapshot.templateId,
            companyId,
            stages: {
              create: snapshot.stages.map(stage => ({
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
                        isRequired: task.isRequired,
                      }))
                    }
                  }))
                }
              }))
            }
          }
        })
      }

      await tx.auditLog.create({
        data: auditLogData({
          userId: user.id,
          companyId,
          action: 'CREATE',
          module: 'SITE',
          recordId: site.id,
          description: `${user.name ?? user.email} created new project site "${data.name}" at ${data.location}`,
          after: { name: data.name, location: data.location, budget: data.budget, checklistTemplateId: snapshot?.templateId ?? null },
        }),
      })

      return site.id
    })
  } catch (error) {
    // `@@unique([companyId, slug])` also covers soft-deleted sites and a concurrent create.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new Error('A site with a similar name already exists.')
    }
    throw error
  }
}
