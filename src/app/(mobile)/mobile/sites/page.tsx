import { requireUser } from '@/lib/auth/require-user'
import prisma from '@/lib/prisma'
import Link from 'next/link'
import { Building2, MapPin, Calendar, ArrowRight, Layers, AlertTriangle } from 'lucide-react'

export default async function MobileSitesPage() {
  const user = await requireUser()
  
  if (!user.companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 text-center bg-[#f2f5f8]">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mb-4 shadow-sm">
          <AlertTriangle size={32} />
        </div>
        <h1 className="text-lg font-extrabold text-[#16273a]">No Workspace Found</h1>
        <p className="text-sm text-[#647387] mt-1 max-w-xs">Your account is not currently linked to an active company workspace.</p>
      </div>
    )
  }

  const sites = await prisma.site.findMany({
    where: { companyId: user.companyId },
    orderBy: { createdAt: 'desc' }
  })

  function fmtAmt(n: number) {
    if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2) + 'Cr'
    if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L'
    if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'k'
    return '₹' + n.toLocaleString('en-IN')
  }

  function getStatusStyle(status: string) {
    switch (status) {
      case 'ACTIVE':
        return { bg: 'bg-[#e2f3ea]', text: 'text-[#0f7a45]', dot: 'bg-[#0f7a45]' }
      case 'PLANNING':
        return { bg: 'bg-[#e7f0fb]', text: 'text-[#13558e]', dot: 'bg-[#13558e]' }
      case 'COMPLETED':
        return { bg: 'bg-[#ece8fa]', text: 'text-[#5b47b8]', dot: 'bg-[#5b47b8]' }
      case 'ON_HOLD':
        return { bg: 'bg-[#fbeacb]', text: 'text-[#a96c08]', dot: 'bg-[#a96c08]' }
      case 'CANCELLED':
        return { bg: 'bg-[#fbe6e3]', text: 'text-[#c4392c]', dot: 'bg-[#c4392c]' }
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' }
    }
  }

  return (
    <div className="min-h-screen bg-[#f2f5f8] pb-28">
      {/* HEADER */}
      <div className="bg-gradient-to-br from-[#0d3a63] to-[#1a64a6] text-white px-5 pt-6 pb-8 shadow-lg rounded-b-[28px]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/15 text-xs font-bold uppercase tracking-wider text-white/90">
            <Building2 size={14} className="text-[#38bdf8]" />
            <span>Project Sites</span>
          </div>
          <span className="text-xs font-extrabold bg-white text-[#0d3a63] px-2.5 py-0.5 rounded-full shadow-sm">
            {sites.length} Total
          </span>
        </div>
        <h1 className="text-[26px] font-black tracking-tight mt-3">Active Worksites</h1>
        <p className="text-sm text-white/80 font-medium mt-1">Monitor budget utilization & operational progress</p>
      </div>

      {/* SITES FEED */}
      <div className="px-4 -mt-4 flex flex-col gap-3.5">
        {sites.length === 0 ? (
          <div className="bg-white rounded-[20px] p-8 text-center border border-[#e4eaf0] shadow-sm">
            <div className="w-14 h-14 bg-[#f0f4f8] text-[#647387] rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Layers size={28} />
            </div>
            <h3 className="text-base font-extrabold text-[#16273a]">No Sites Created</h3>
            <p className="text-xs text-[#647387] mt-1 max-w-xs mx-auto">Sites added to your company workspace will appear here.</p>
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
                href={`/sites/${site.id}`}
                className="block bg-white rounded-[20px] p-4 border border-[#e4eaf0] shadow-sm active:scale-[0.98] transition-all hover:border-[#cbd5e1]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold ${statusStyle.bg} ${statusStyle.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                        {site.status.replace(/_/g, ' ')}
                      </span>
                      {site.projectType && (
                        <span className="text-[11px] font-semibold text-[#647387] bg-[#f0f4f8] px-2 py-0.5 rounded-md">
                          {site.projectType}
                        </span>
                      )}
                    </div>
                    <h2 className="text-[17px] font-black text-[#16273a] truncate">{site.name}</h2>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-[#647387] mt-1 truncate">
                      <MapPin size={13} className="text-[#94a3b8] flex-shrink-0" />
                      <span className="truncate">{site.location || 'No location specified'}</span>
                    </div>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-[#f0f4f8] text-[#13558e] flex items-center justify-center flex-shrink-0 group-hover:bg-[#13558e] group-hover:text-white transition-colors mt-1">
                    <ArrowRight size={18} />
                  </div>
                </div>

                {/* BUDGET SECTION */}
                <div className="mt-4 pt-3 border-t border-[#f0f4f8]">
                  <div className="flex justify-between items-baseline mb-1.5">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#647387]">BUDGET SPENT</div>
                    <div className="text-xs font-black text-[#16273a]">
                      <span className="text-[#0d3a63] text-sm">{fmtAmt(spent)}</span>
                      <span className="text-[#94a3b8] font-semibold"> / {budget > 0 ? fmtAmt(budget) : 'Unset'}</span>
                    </div>
                  </div>
                  
                  <div className="h-2 bg-[#f0f4f8] rounded-full overflow-hidden p-0.5">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        pct > 90 ? 'bg-gradient-to-r from-amber-500 to-rose-500' : 'bg-gradient-to-r from-[#38bdf8] to-[#0d3a63]'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between mt-2 text-[11px] font-bold text-[#647387]">
                    <span>{pct}% Utilized</span>
                    {site.startDate && (
                      <span className="flex items-center gap-1 text-[#94a3b8] font-normal">
                        <Calendar size={11} />
                        Started {new Date(site.startDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
