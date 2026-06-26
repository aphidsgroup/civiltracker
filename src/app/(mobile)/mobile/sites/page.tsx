import { requireUser } from '@/lib/auth/require-user'
import prisma from '@/lib/prisma'
import Link from 'next/link'
import { Building2, MapPin, Calendar, ArrowRight, Layers, AlertTriangle, HardHat } from 'lucide-react'

export default async function MobileSitesPage() {
  const user = await requireUser()

  if (!user.companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 text-center bg-[#f8fafc]">
        <div className="w-16 h-16 rounded-2xl bg-[#fff7ed] text-[#fc6e20] flex items-center justify-center mb-4 shadow-sm">
          <AlertTriangle size={32} />
        </div>
        <h1 className="text-lg font-extrabold text-[#0f172a]">No Workspace Found</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-xs">Your account is not currently linked to an active company workspace.</p>
      </div>
    )
  }

  const isSiteEngineer = user.role === 'SITE_ENGINEER' || user.role === 'SUPERVISOR'

  let sites = await prisma.site.findMany({
    where: { companyId: user.companyId },
    orderBy: { createdAt: 'desc' }
  })

  if (isSiteEngineer) {
    const member = await prisma.companyMember.findFirst({
      where: { userId: user.id, companyId: user.companyId }
    })
    const assignedIds = new Set(member?.siteIds || [])
    sites = sites.filter(s => s.assignedEngineerId === user.id || s.engineerId === user.id || assignedIds.has(s.id))
  }

  function fmtAmt(n: number) {
    if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2) + 'Cr'
    if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L'
    if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'k'
    return '₹' + n.toLocaleString('en-IN')
  }

  function getStatusStyle(status: string) {
    switch (status) {
      case 'ACTIVE':     return { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' }
      case 'PLANNING':   return { bg: 'bg-[#fff7ed]',   text: 'text-[#fc6e20]',   dot: 'bg-[#fc6e20]' }
      case 'COMPLETED':  return { bg: 'bg-slate-100',   text: 'text-slate-600',   dot: 'bg-slate-400' }
      case 'ON_HOLD':    return { bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500' }
      case 'CANCELLED':  return { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500' }
      default:           return { bg: 'bg-slate-100',   text: 'text-slate-600',   dot: 'bg-slate-400' }
    }
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-28 select-none">
      {/* HEADER */}
      <div className="bg-gradient-to-br from-[#1a0a00] via-[#7a3310] to-[#fc6e20] text-white px-5 pt-6 pb-16 rounded-b-[32px] shadow-lg shadow-[#fc6e20]/20 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.08)_0%,_transparent_60%)] pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 bg-white/15 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 text-xs font-bold uppercase tracking-wider">
              <Building2 size={13} className="text-orange-200" />
              <span>{isSiteEngineer ? 'Assigned Projects' : 'Project Sites'}</span>
            </div>
            <span className="text-xs font-extrabold bg-white text-[#fc6e20] px-3 py-1 rounded-full shadow-sm">
              {sites.length} Site{sites.length !== 1 ? 's' : ''}
            </span>
          </div>
          <h1 className="text-[28px] font-black tracking-tight mt-2 leading-tight">
            {isSiteEngineer ? 'My Worksites' : 'Active Worksites'}
          </h1>
          <p className="text-sm text-white/75 font-medium mt-1">
            {isSiteEngineer ? 'Field operations & daily inputs' : 'Monitor budget & operational progress'}
          </p>
        </div>
      </div>

      {/* SITES FEED */}
      <div className="px-4 -mt-5 flex flex-col gap-3.5">
        {sites.length === 0 ? (
          <div className="bg-white rounded-[20px] p-8 text-center border border-slate-100 shadow-sm mt-2">
            <div className="w-14 h-14 bg-[#fff7ed] text-[#fc6e20] rounded-2xl flex items-center justify-center mx-auto mb-3">
              {isSiteEngineer ? <HardHat size={28} /> : <Layers size={28} />}
            </div>
            <h3 className="text-base font-extrabold text-[#0f172a]">
              {isSiteEngineer ? 'No Assigned Projects' : 'No Sites Created'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
              {isSiteEngineer
                ? 'You do not have any active projects assigned yet. Please contact Company Administration.'
                : 'Sites added to your company workspace will appear here.'}
            </p>
          </div>
        ) : (
          sites.map((site) => {
            const budget = Number(site.budget ?? 0)
            const spent = Number(site.spent ?? 0)
            const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0
            const statusStyle = getStatusStyle(site.status)

            return (
              <Link
                key={site.id}
                href={`/mobile/sites/${site.id}`}
                className="block bg-white rounded-[20px] p-4 border border-slate-100 shadow-sm active:scale-[0.98] transition-all hover:border-[#fc6e20]/30 hover:shadow-md no-underline text-inherit"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold ${statusStyle.bg} ${statusStyle.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                        {site.status.replace(/_/g, ' ')}
                      </span>
                      {site.projectType && (
                        <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          {site.projectType}
                        </span>
                      )}
                    </div>
                    <h2 className="text-[17px] font-black text-[#0f172a] truncate m-0">{site.name}</h2>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mt-1 truncate">
                      <MapPin size={13} className="text-[#fc6e20] flex-shrink-0" />
                      <span className="truncate">{site.location || 'No location specified'}</span>
                    </div>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-[#fff7ed] text-[#fc6e20] flex items-center justify-center flex-shrink-0 mt-1">
                    <ArrowRight size={18} />
                  </div>
                </div>

                {!isSiteEngineer ? (
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <div className="flex justify-between items-baseline mb-1.5">
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Budget Spent</div>
                      <div className="text-xs font-black text-[#0f172a]">
                        <span className="text-[#fc6e20] text-sm">{fmtAmt(spent)}</span>
                        <span className="text-slate-400 font-semibold"> / {budget > 0 ? fmtAmt(budget) : 'Unset'}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          pct > 90 ? 'bg-gradient-to-r from-amber-500 to-rose-500' : 'bg-gradient-to-r from-[#fc6e20] to-[#e85b0d]'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-2 text-[11px] font-bold text-slate-400">
                      <span>{pct}% Utilized</span>
                      {site.startDate && (
                        <span className="flex items-center gap-1 font-normal">
                          <Calendar size={11} />
                          Started {new Date(site.startDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-extrabold text-[#fc6e20]">
                    <span className="flex items-center gap-1.5">
                      <HardHat size={14} />
                      <span>Site Engineer View</span>
                    </span>
                    <span>Tap to give inputs →</span>
                  </div>
                )}
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
