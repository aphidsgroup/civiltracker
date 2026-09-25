import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { exitDeniedPage, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'
import { parseNonNegativeAmount, requiredText, requireTenantMutation } from '@/lib/auth/site-mutation'
import { NewSiteClient } from './NewSiteClient'

export const dynamic = 'force-dynamic'

const templateTree = {
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

function parseSelectedTaskIds(raw: FormDataEntryValue | null): string[] {
  if (raw === null || raw === '') return []
  if (typeof raw !== 'string') throw new Error(INVALID_SELECTION)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(INVALID_SELECTION)
  }
  if (!Array.isArray(parsed) || !parsed.every((id): id is string => typeof id === 'string')) {
    throw new Error(INVALID_SELECTION)
  }
  return parsed
}

async function createSiteAction(formData: FormData) {
  'use server'
  const user = await requireTenantMutation('sites.create', 'SITES')
  const companyId = user.companyId

  const name = requiredText(formData.get('name'), 'Name')
  const location = requiredText(formData.get('location'), 'Location')
  const address = formData.get('address') as string
  const projectType = formData.get('projectType') as string
  const budget = parseNonNegativeAmount(formData.get('budget'), 'budget', 0)
  const startDateStr = formData.get('startDate') as string
  const targetEndDateStr = formData.get('targetEndDate') as string
  const templateId = ((formData.get('templateId') as string | null) ?? '').trim()
  const selectedTaskIds = parseSelectedTaskIds(formData.get('selectedTaskIds'))

  if (!templateId && selectedTaskIds.length > 0) throw new Error(INVALID_SELECTION)

  // Only a template of this company or a global one may be copied, and every selected
  // task must belong to it.
  const template = templateId && selectedTaskIds.length > 0
    ? await prisma.checklistTemplate.findFirst({
        where: { id: templateId, OR: [{ companyId }, { isGlobal: true }] },
        include: templateTree,
      })
    : null
  if (templateId && selectedTaskIds.length > 0 && !template) {
    throw new Error('FORBIDDEN: Template not found or access denied')
  }

  const selectedSet = new Set(selectedTaskIds)
  const filteredStages = (template?.stages ?? []).map(stage => {
    const filteredCats = stage.categories.map(cat => {
      const filteredTasks = cat.tasks.filter(t => selectedSet.has(t.id))
      return { ...cat, tasks: filteredTasks }
    }).filter(cat => cat.tasks.length > 0)
    return { ...stage, categories: filteredCats }
  }).filter(stage => stage.categories.length > 0)

  const matchedTaskCount = filteredStages.reduce((sum, stage) => sum + stage.categories.reduce((catSum, cat) => catSum + cat.tasks.length, 0), 0)
  if (matchedTaskCount !== selectedSet.size) throw new Error(INVALID_SELECTION)

  // The site and its checklist snapshot are written together, under the plan's site limit.
  await prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id: companyId }, select: { siteLimit: true } })
    if (!company) throw new Error('Company not found')
    const siteCount = await tx.site.count({ where: { companyId } })
    if (siteCount >= company.siteLimit) {
      throw new Error(`Site limit reached (${company.siteLimit}). Please upgrade your plan.`)
    }

    const site = await tx.site.create({
      data: {
        name,
        location,
        address: address || null,
        projectType: projectType || null,
        budget,
        startDate: startDateStr ? new Date(startDateStr) : null,
        targetEndDate: targetEndDateStr ? new Date(targetEndDateStr) : null,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 6),
        companyId,
        createdById: user.id,
      },
    })

    if (template && filteredStages.length > 0) {
      await tx.projectChecklist.create({
        data: {
          siteId: site.id,
          templateId: template.id,
          companyId,
          stages: {
            create: filteredStages.map(stage => ({
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
  })

  revalidatePath('/sites')
  redirect('/sites')
}

export default async function NewSitePage() {
  const gate = await resolveTenantPageAccess({ grants: [{ permission: 'sites.create', module: 'SITES' }] })
  if (gate.status === 'denied') exitDeniedPage(gate, '/sites/new')
  const { companyId } = gate.access

  // Load the best available template: company-cloned first, then global master
  const template = await prisma.checklistTemplate.findFirst({
    where: {
      OR: [
        { companyId, isGlobal: false },
        { isGlobal: true },
      ]
    },
    include: templateTree,
    orderBy: [
      { isGlobal: 'asc' }, // company templates first (isGlobal=false → 'asc' sorts false before true)
      { createdAt: 'desc' }
    ]
  })

  return (
    <>
      <div className="flex items-center justify-between pb-6 border-b border-slate-200 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Site</h1>
          <p className="text-sm text-slate-500 mt-1">Add a new construction site to your company</p>
        </div>
      </div>
      <NewSiteClient template={template} createSiteAction={createSiteAction} />
    </>
  )
}
