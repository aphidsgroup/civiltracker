import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Building2, MapPin, Calendar, CheckCircle2, Clock, Layers, Sparkles } from 'lucide-react'
import Link from 'next/link'

export default async function ClientPortalProjectsPage() {
  const session = await auth()
  if (session?.user?.role !== 'CLIENT') redirect('/dashboard')

  const sites = await prisma.site.findMany({
    where: { clientId: session?.user?.id, deletedAt: null },
    include: {
      tasks: {
        orderBy: { dueDate: 'asc' }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-blue-200 text-xs font-bold border border-white/10 mb-3">
            <Sparkles size={14} className="text-amber-300" />
            <span>EXECUTIVE OVERSIGHT</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight">Your Construction Projects</h1>
          <p className="text-sm text-blue-100/80 mt-2 leading-relaxed">
            Monitor structural milestones, site telemetry, and live execution progress across your contracted developments.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {sites.map(site => {
          const pct = site.progress || 0
          return (
            <div key={site.id} className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 font-black shadow-inner">
                    <Building2 size={28} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{site.name}</h2>
                    {site.location && (
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mt-1">
                        <MapPin size={14} className="text-rose-500" />
                        <span>{site.location}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide ${
                    site.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {site.status}
                  </span>
                  <Link
                    href={`/client-portal?siteId=${site.id}`}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all"
                  >
                    View Live Feed
                  </Link>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-slate-600">Overall Completion Progress</span>
                  <span className="text-blue-600">{pct}%</span>
                </div>
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                </div>
              </div>

              {site.tasks.length > 0 && (
                <div className="pt-4">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-3">Upcoming Key Milestones</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {site.tasks.slice(0, 4).map(t => (
                      <div key={t.id} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {t.status === 'COMPLETED' ? (
                            <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
                          ) : (
                            <Clock size={18} className="text-amber-500 flex-shrink-0" />
                          )}
                          <span className="text-xs font-bold text-slate-800 truncate">{t.name}</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 ml-2 flex-shrink-0">
                          {t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {sites.length === 0 && (
          <div className="bg-white rounded-3xl p-16 text-center border border-slate-200">
            <Building2 className="w-14 h-14 text-slate-300 mx-auto mb-4" />
            <div className="font-bold text-slate-800 text-lg">No Contracted Developments</div>
            <div className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">Your builder has not yet linked active site projects to your client account.</div>
          </div>
        )}
      </div>
    </div>
  )
}
