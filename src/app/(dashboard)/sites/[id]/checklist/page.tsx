import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { enableChecklistForProject, toggleTaskStatus, toggleCategoryNeglect, addCustomTask } from '@/actions/checklists'
import { ChecklistClient } from './ChecklistClient'

export const dynamic = 'force-dynamic'

export default async function ProjectChecklistPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  const site = await prisma.site.findUnique({
    where: { id: params.id, companyId: session.user.companyId },
  })

  if (!site) redirect('/sites')

  // Check if checklist is enabled
  const checklist = await prisma.projectChecklist.findUnique({
    where: { siteId: site.id },
    include: {
      stages: {
        orderBy: { order: 'asc' },
        include: {
          categories: {
            orderBy: { order: 'asc' },
            include: {
              tasks: {
                orderBy: { order: 'asc' }
              }
            }
          }
        }
      }
    }
  })

  // If not enabled, fetch available templates
  if (!checklist) {
    const templates = await prisma.checklistTemplate.findMany({
      where: {
        OR: [
          { isGlobal: true },
          { companyId: session.user.companyId }
        ]
      }
    })

    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">Site Checklist</h1>
            <p className="text-sm text-slate-500 mt-1">{site.name}</p>
          </div>
          <Link href={`/sites/${site.id}`} className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
            ← Back to Site
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Enable Checklist Module</h2>
          <p className="text-slate-500 mb-8 max-w-md mx-auto">Track milestones, stages, and tasks for this construction site. Choose a template to get started.</p>
          
          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {templates.map(t => (
              <form key={t.id} action={async () => {
                'use server'
                await enableChecklistForProject(site.id, t.id)
              }}>
                <button type="submit" className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-[#fc6e20] hover:ring-1 hover:ring-[#fc6e20] transition-all bg-white group">
                  <h3 className="font-bold text-slate-800 group-hover:text-[#fc6e20]">{t.name}</h3>
                  {t.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.description}</p>}
                </button>
              </form>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Calculate overall progress
  let totalApplicableTasks = 0
  let completedTasks = 0
  
  checklist.stages.forEach(stage => {
    stage.categories.forEach(cat => {
      if (!cat.isNeglected) {
        cat.tasks.forEach(task => {
          if (!task.isNeglected && !task.isClientDone) {
            totalApplicableTasks++
            if (task.status === 'COMPLETED') completedTasks++
          }
        })
      }
    })
  })

  const progress = totalApplicableTasks > 0 ? Math.round((completedTasks / totalApplicableTasks) * 100) : 0

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="px-6 py-5 bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 max-w-6xl mx-auto">
          <div>
            <h1 className="text-xl font-extrabold text-slate-800">Checklist & Milestones</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-medium text-[#fc6e20]">{site.name}</span>
              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500">{progress}% Completed</span>
            </div>
          </div>
          <Link href={`/sites/${site.id}`} className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors bg-slate-100 px-4 py-2 rounded-lg">
            ← Back to Site
          </Link>
        </div>
      </div>

      <div className="p-6 max-w-6xl mx-auto">
        {/* Pass initial data to a Client Component for interactive editing */}
        <ChecklistClient siteId={site.id} checklist={checklist} />
      </div>
    </div>
  )
}
