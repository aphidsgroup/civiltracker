import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { NewSiteClient } from './NewSiteClient'

export const dynamic = 'force-dynamic'

async function createSiteAction(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.companyId) return

  const name = formData.get('name') as string
  const location = formData.get('location') as string
  const address = formData.get('address') as string
  const projectType = formData.get('projectType') as string
  const budget = parseFloat(formData.get('budget') as string) || 0
  const startDateStr = formData.get('startDate') as string
  const targetEndDateStr = formData.get('targetEndDate') as string
  const selectedTaskIdsRaw = formData.get('selectedTaskIds') as string
  const templateId = formData.get('templateId') as string

  if (!name || !location) return

  const selectedTaskIds: string[] = selectedTaskIdsRaw ? JSON.parse(selectedTaskIdsRaw) : []

  const site = await prisma.site.create({
    data: {
      name,
      location,
      address: address || null,
      projectType: projectType || null,
      budget,
      startDate: startDateStr ? new Date(startDateStr) : null,
      targetEndDate: targetEndDateStr ? new Date(targetEndDateStr) : null,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 6),
      companyId: session.user.companyId,
    },
  })

  // If a template was selected, snapshot only the chosen tasks into ProjectChecklist
  if (templateId && selectedTaskIds.length > 0) {
    const template = await prisma.checklistTemplate.findUnique({
      where: { id: templateId },
      include: {
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
      }
    })

    if (template) {
      const selectedSet = new Set(selectedTaskIds)

      // Build filtered stages/categories/tasks (skip categories with 0 selected tasks)
      const filteredStages = template.stages.map(stage => {
        const filteredCats = stage.categories.map(cat => {
          const filteredTasks = cat.tasks.filter(t => selectedSet.has(t.id))
          return { ...cat, tasks: filteredTasks }
        }).filter(cat => cat.tasks.length > 0)
        return { ...stage, categories: filteredCats }
      }).filter(stage => stage.categories.length > 0)

      if (filteredStages.length > 0) {
        await prisma.projectChecklist.create({
          data: {
            siteId: site.id,
            templateId: template.id,
            companyId: session.user.companyId,
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
    }
  }

  revalidatePath('/sites')
  redirect('/sites')
}

export default async function NewSitePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = session.user.companyId

  // Load the best available template: company-cloned first, then global master
  const template = companyId
    ? await prisma.checklistTemplate.findFirst({
        where: {
          OR: [
            { companyId, isGlobal: false },
            { isGlobal: true },
          ]
        },
        include: {
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
        },
        orderBy: [
          { isGlobal: 'asc' }, // company templates first (isGlobal=false → 'asc' sorts false before true)
          { createdAt: 'desc' }
        ]
      })
    : null

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
