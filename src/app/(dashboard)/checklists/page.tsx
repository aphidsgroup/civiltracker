import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { CheckCircle2, Plus } from 'lucide-react'
import { CloneTemplateBtn } from './CloneTemplateBtn'
import { createTemplate } from '@/actions/template-checklists'

export const dynamic = 'force-dynamic'

export default async function ChecklistsIndexPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')

  const companyId = session.user.companyId

  // Fetch global templates (companyId IS NULL) and company-specific templates
  const [globalTemplates, companyTemplates] = await Promise.all([
    prisma.checklistTemplate.findMany({
      where: { isGlobal: true },
      include: { _count: { select: { stages: true, projects: true } } },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.checklistTemplate.findMany({
      where: { companyId, isGlobal: false },
      include: { _count: { select: { stages: true, projects: true } } },
      orderBy: { createdAt: 'desc' }
    })
  ])

  const templates = [...globalTemplates, ...companyTemplates]

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Checklist Templates</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Manage and customise checklists to assign to your site engineers.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Create New Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-dashed border-slate-300 p-6 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center mb-4">
            <Plus size={24} strokeWidth={2.5} />
          </div>
          <h3 className="font-bold text-slate-800">Create Custom Template</h3>
          <p className="text-xs text-slate-500 mt-1 mb-4">Build a site checklist from scratch for your company.</p>
          <form action={createTemplate} className="w-full space-y-3">
            <input
              name="name"
              required
              placeholder="Template Name..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/30"
            />
            <input
              name="description"
              placeholder="Description (optional)..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#fc6e20]/30"
            />
            <button type="submit" className="w-full py-2 bg-[#fc6e20] text-white rounded-lg text-sm font-bold shadow-sm hover:bg-[#e85b0d] transition-colors">
              Create Blank
            </button>
          </form>
        </div>

        {templates.length === 0 ? (
          <div className="md:col-span-2 bg-amber-50 border border-amber-200 rounded-2xl p-8 flex items-center justify-center">
            <p className="text-sm text-amber-700 font-medium text-center">
              No master templates found. Create a blank one to get started!
            </p>
          </div>
        ) : (
          templates.map(t => (
            <div key={t.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col relative overflow-hidden">
              {t.isGlobal && (
                <div className="absolute top-4 right-4 bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full">
                  Master Template
                </div>
              )}

              <div className="mb-4">
                <CheckCircle2 size={24} className={t.isGlobal ? 'text-amber-500' : 'text-sky-500'} />
              </div>
              <h3 className="font-bold text-slate-800 pr-20 leading-snug">{t.name}</h3>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 min-h-[32px]">{(t as any).description || 'Standard construction site checklist.'}</p>

              <div className="mt-4 flex items-center gap-4 text-xs font-semibold text-slate-400">
                <span>{t._count.stages} Stages</span>
                <span>{t._count.projects} Sites using</span>
              </div>

              <div className="mt-auto pt-5 flex flex-col gap-2">
                {t.companyId === companyId ? (
                  <Link href={`/checklists/${t.id}`} className="block w-full text-center py-2 bg-[#fc6e20] hover:bg-[#e85b0d] text-white rounded-lg text-sm font-bold transition-colors">
                    ✏️ Edit Template
                  </Link>
                ) : (
                  <>
                    <CloneTemplateBtn templateId={t.id} />
                    <Link href={`/checklists/${t.id}/preview`} className="block w-full text-center py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold transition-colors">
                      👁 Preview
                    </Link>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {companyTemplates.length > 0 && (
        <p className="text-xs text-slate-400 text-center">
          Your custom templates above can be assigned to any site via the site's Checklist tab.
        </p>
      )}
    </div>
  )
}
