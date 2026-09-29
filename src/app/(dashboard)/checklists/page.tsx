import prisma from '@/lib/prisma'
import { exitDeniedPage, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'
import Link from 'next/link'
import { CheckCircle2, ChevronRight, Copy, Eye } from 'lucide-react'
import { CloneTemplateBtn } from './CloneTemplateBtn'

export const dynamic = 'force-dynamic'

export default async function ChecklistsIndexPage() {
  const gate = await resolveTenantPageAccess({ grants: [{ permission: 'tasks.manage', module: 'TASKS' }] })
  if (gate.status === 'denied') exitDeniedPage(gate, '/checklists')

  const { companyId } = gate.access
  // "Sites" counts only this company's project checklists, never other tenants' usage.
  const counts = { select: { stages: true, projects: { where: { companyId } } } } as const

  const [globalTemplates, companyTemplates] = await Promise.all([
    // A master is global *and* owned by no company; a tenant row flagged global is neither.
    prisma.checklistTemplate.findMany({
      where: { isGlobal: true, companyId: null },
      include: {
        stages: {
          include: { categories: { include: { tasks: true } } }
        },
        _count: counts
      },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.checklistTemplate.findMany({
      where: { companyId, isGlobal: false },
      include: {
        stages: {
          include: { categories: { include: { tasks: true } } }
        },
        _count: counts
      },
      orderBy: { createdAt: 'desc' }
    })
  ])

  const totalTasks = (t: typeof globalTemplates[0]) =>
    t.stages.reduce((s, st) => s + st.categories.reduce((s2, c) => s2 + c.tasks.length, 0), 0)

  const totalCats = (t: typeof globalTemplates[0]) =>
    t.stages.reduce((s, st) => s + st.categories.length, 0)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Checklist Templates</h1>
        <p className="text-sm text-slate-500 font-medium mt-1">
          Templates are applied automatically when you create a new site. Clone a master to customise it for your company.
        </p>
      </div>

      {/* Global Master Templates (read-only) */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Global Master Templates</h2>
          <span className="text-xs text-slate-400 ml-1">(read-only — clone to customise)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {globalTemplates.length === 0 && (
            <div className="col-span-2 bg-amber-50 border border-amber-200 rounded-2xl p-6 text-amber-700 text-sm font-medium">
              No global template found. Contact your system administrator.
            </div>
          )}
          {globalTemplates.map(t => (
            <div key={t.id} className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6 relative overflow-hidden">
              <div className="absolute top-4 right-4 bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full">
                Master
              </div>
              <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center mb-4">
                <CheckCircle2 size={20} />
              </div>
              <h3 className="font-bold text-slate-800 pr-16 text-base leading-snug">{t.name}</h3>
              <p className="text-xs text-slate-500 mt-1 mb-4">{t.description || 'Standard construction checklist template.'}</p>

              {/* Stage breakdown */}
              <div className="space-y-1.5 mb-4">
                {t.stages.slice(0, 5).map(stage => (
                  <div key={stage.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <ChevronRight size={12} className="text-amber-400" />
                      <span className="text-slate-600 font-medium truncate max-w-[180px]">{stage.name}</span>
                    </div>
                    <span className="text-slate-400 flex-shrink-0">
                      {stage.categories.length} cats · {stage.categories.reduce((s, c) => s + c.tasks.length, 0)} tasks
                    </span>
                  </div>
                ))}
                {t.stages.length > 5 && (
                  <div className="text-xs text-amber-600 font-semibold pl-4">+{t.stages.length - 5} more stages…</div>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-5 pt-2 border-t border-amber-100">
                <span>{t._count.stages} Stages</span>
                <span>·</span>
                <span>{totalCats(t)} Categories</span>
                <span>·</span>
                <span>{totalTasks(t)} Tasks</span>
                <span>·</span>
                <span>{t._count.projects} Sites</span>
              </div>

              <CloneTemplateBtn templateId={t.id} />
            </div>
          ))}
        </div>
      </section>

      {/* Company Templates (editable) */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-sky-400" />
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Your Company Templates</h2>
        </div>

        {companyTemplates.length === 0 ? (
          <div className="bg-sky-50 border border-dashed border-sky-200 rounded-2xl p-8 text-center">
            <Copy size={32} className="mx-auto text-sky-300 mb-3" />
            <p className="text-sm font-semibold text-slate-600">No custom templates yet.</p>
            <p className="text-xs text-slate-400 mt-1">Clone a master template above to create your own editable version. It will be applied when you add new sites.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {companyTemplates.map(t => (
              <div key={t.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="w-10 h-10 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center mb-4">
                  <CheckCircle2 size={20} />
                </div>
                <h3 className="font-bold text-slate-800 text-base leading-snug">{t.name}</h3>
                <p className="text-xs text-slate-500 mt-1 mb-4">{t.description || 'Custom company checklist.'}</p>

                <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-5 pt-2 border-t border-slate-100">
                  <span>{t._count.stages} Stages</span>
                  <span>·</span>
                  <span>{totalCats(t)} Categories</span>
                  <span>·</span>
                  <span>{totalTasks(t)} Tasks</span>
                  <span>·</span>
                  <span>{t._count.projects} Sites using</span>
                </div>

                <Link
                  href={`/checklists/${t.id}`}
                  className="block w-full text-center py-2.5 bg-[#fc6e20] hover:bg-[#e85b0d] text-white rounded-lg text-sm font-bold transition-colors"
                >
                  ✏️ Edit Template
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-slate-400 text-center pb-4">
        When you create a new site, the template is applied automatically. You can tick/untick stages and tasks per-site during site creation.
      </p>
    </div>
  )
}
