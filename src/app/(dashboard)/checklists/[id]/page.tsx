import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { exitDeniedPage, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'
import { TemplateBuilderClient } from './TemplateBuilderClient'

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await resolveTenantPageAccess({ grants: [{ permission: 'tasks.manage', module: 'TASKS' }] })
  if (gate.status === 'denied') exitDeniedPage(gate, `/checklists/${id}`)

  // Only the live company's own editable templates; global masters are cloned, never edited.
  const template = await prisma.checklistTemplate.findFirst({
    where: { id, companyId: gate.access.companyId, isGlobal: false },
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

  if (!template) redirect('/checklists')

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/checklists" className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors shadow-sm">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Edit Template: {template.name}</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Customize stages, categories, and tasks for this checklist.</p>
        </div>
      </div>

      <TemplateBuilderClient template={template} />
    </div>
  )
}
