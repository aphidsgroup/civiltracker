import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Building2, Users, HardDrive, MessageCircle, TrendingUp, AlertCircle } from 'lucide-react'

import { unstable_cache } from 'next/cache'

async function getCachedSuperAdminData() {
  return Promise.all([
    prisma.company.count({ where: { deletedAt: null } }),
    prisma.company.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
    prisma.company.count({ where: { deletedAt: null, status: 'TRIAL' } }),
    prisma.company.count({ where: { deletedAt: null, status: 'SUSPENDED' } }),
    prisma.site.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.company.aggregate({ where: { deletedAt: null }, _sum: { storageUsed: true } }),
    prisma.company.groupBy({ by: ['plan'], where: { deletedAt: null }, _count: true }),
    prisma.company.findMany({
      where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 5,
      include: { _count: { select: { sites: true, members: true } } }
    })
  ])
}

export default async function SuperAdminDashboard() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const cachedDataFetcher = unstable_cache(
    async () => getCachedSuperAdminData(),
    ['super_admin_dashboard_data'],
    { revalidate: 60 }
  )

  const [
    totalCompanies, activeCompanies, trialCompanies, suspendedCompanies,
    totalSites, totalUsers, storageAgg, planCounts, topCompanies
  ] = await cachedDataFetcher()

  const totalStorageGb = ((storageAgg._sum.storageUsed || 0) / (1024 * 1024 * 1024)).toFixed(1)

  const kpis = [
    { label: 'Total Companies', value: totalCompanies, sub: 'Platform total', trend: 'up', featured: true },
    { label: 'Active', value: activeCompanies, sub: `${Math.round((activeCompanies/(totalCompanies||1))*100)}% of base`, trend: 'up' },
    { label: 'On Trial', value: trialCompanies, sub: 'Free trials', trend: 'warn' },
    { label: 'Suspended', value: suspendedCompanies, sub: 'Billing failed', trend: 'down' },
    { label: 'Monthly Revenue', value: '₹6.4 L', sub: '+12% MoM', trend: 'up' },
  ]

  const miniStats = [
    { Icon: Building2, bg: 'bg-[#e7f0fb]', color: 'text-[#13558e]', value: totalSites, label: 'Total sites' },
    { Icon: Users, bg: 'bg-[#ece8fa]', color: 'text-[#5b47b8]', value: totalUsers, label: 'Total users' },
    { Icon: HardDrive, bg: 'bg-[#e2f3ea]', color: 'text-[#0f7a45]', value: `${totalStorageGb} GB`, label: 'Cloudinary storage' },
    { Icon: MessageCircle, bg: 'bg-[#fbe6e3]', color: 'text-[#cf3f31]', value: 7, label: 'Open tickets' },
  ]

  const planColors: Record<string, string> = { FREE: '#10b981', ENTERPRISE: '#7c3aed', GROWTH: '#059669', STARTER: '#0284c7', TRIAL: '#d97706' }
  const statusChip = (s: string) => {
    if (s === 'ACTIVE') return 'bg-[#e2f3ea] text-[#0f7a45]'
    if (s === 'TRIAL') return 'bg-[#fbeacb] text-[#a96c08]'
    return 'bg-[#fbe6e3] text-[#c4392c]'
  }

  return (
    <>
      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5 mb-4">
        {kpis.map(k => (
          <div key={k.label} className={`rounded-[16px] p-4 border ${
            k.featured
              ? 'bg-gradient-to-br from-[#0d3a63] to-[#1a64a6] border-transparent text-white shadow-[0_8px_24px_-8px_rgba(13,58,99,0.5)]'
              : 'bg-white border-[#e4eaf0] shadow-[0_2px_5px_rgba(16,40,70,0.04)]'
          }`}>
            <div className={`text-[11px] font-bold uppercase tracking-[0.03em] ${k.featured ? 'text-white/70' : 'text-[#647387]'}`}>{k.label}</div>
            <div className={`text-[25px] font-black tracking-[-0.03em] mt-2.5 leading-none tabular ${k.featured ? '' : 'text-[#16273a]'}`}>{k.value}</div>
            <div className={`text-[11.5px] font-bold mt-2 flex items-center gap-1.5 ${
              k.trend === 'up' ? (k.featured ? 'text-white/85' : 'text-[#138a4e]') : k.trend === 'warn' ? 'text-[#e08a0b]' : k.trend === 'down' ? 'text-[#d9483b]' : k.featured ? 'text-white/70' : 'text-[#647387]'
            }`}>
              {k.trend === 'up' ? <TrendingUp size={12}/> : k.trend === 'warn' || k.trend === 'down' ? <AlertCircle size={12}/> : null}
              {k.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Mini stat row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5 mb-4">
        {miniStats.map(m => (
          <div key={m.label} className="bg-white border border-[#e4eaf0] rounded-[14px] p-4 flex items-center gap-3 shadow-[0_2px_5px_rgba(16,40,70,0.04)]">
            <div className={`w-10 h-10 rounded-[11px] flex items-center justify-center flex-shrink-0 ${m.bg} ${m.color}`}>
              <m.Icon size={20} strokeWidth={1.8}/>
            </div>
            <div>
              <div className="text-[20px] font-extrabold text-[#16273a] leading-none tabular">{m.value}</div>
              <div className="text-[11px] text-[#647387] font-bold mt-1">{m.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4 items-start">
        {/* Companies list */}
        <div className="bg-white border border-[#e4eaf0] rounded-[18px] shadow-[0_2px_6px_rgba(16,40,70,0.04)]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e4eaf0]">
            <div>
              <div className="text-[15px] font-extrabold text-[#16273a] tracking-[-0.02em]">Companies</div>
              <div className="text-[11.5px] text-[#647387] font-semibold mt-0.5">{totalCompanies} total · sorted by recent</div>
            </div>
            <Link href="/super-admin/companies" className="text-[12.5px] font-bold text-[#13558e] no-underline">Manage all</Link>
          </div>
          <div>
            {topCompanies.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-[#e4eaf0] last:border-0 hover:bg-[#fafbfc] transition-colors">
                <div className="w-[38px] h-[38px] rounded-[11px] bg-[#13558e] text-white font-extrabold text-[13px] flex items-center justify-center flex-shrink-0">
                  {c.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-[#16273a] truncate">{c.name}</div>
                  <div className="text-[11px] text-[#647387] font-semibold mt-0.5 truncate">{c.city || 'Unknown'} · {c._count.sites} sites · {c._count.members} users</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="schip mut">{c.plan}</span>
                  <span className={`inline-flex items-center gap-1 text-[10.5px] font-extrabold px-2 py-1 rounded-[8px] ${statusChip(c.status)}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />{c.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex flex-col gap-4">
          {/* Plan distribution */}
          <div className="bg-white border border-[#e4eaf0] rounded-[18px] shadow-[0_2px_6px_rgba(16,40,70,0.04)]">
            <div className="px-5 py-4 border-b border-[#e4eaf0]">
              <div className="text-[15px] font-extrabold text-[#16273a] tracking-[-0.02em]">Plan distribution</div>
            </div>
            <div className="px-5 py-4">
              {(['FREE','ENTERPRISE','GROWTH','STARTER','TRIAL'] as const).map(plan => {
                const count = planCounts.find(p => p.plan === plan)?._count ?? 0
                const pct = totalCompanies > 0 ? Math.round((count / totalCompanies) * 100) : 0
                return (
                  <div key={plan} className="flex items-center gap-2.5 mb-3 last:mb-0">
                    <div className="text-[12.5px] font-bold text-[#647387] w-[72px] flex-shrink-0">{plan.charAt(0)+plan.slice(1).toLowerCase()}</div>
                    <div className="flex-1 h-[9px] bg-[#eef2f6] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: planColors[plan] }} />
                    </div>
                    <div className="text-[12px] font-extrabold text-[#16273a] tabular w-5 text-right">{count}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Storage */}
          <div className="bg-white border border-[#e4eaf0] rounded-[18px] shadow-[0_2px_6px_rgba(16,40,70,0.04)]">
            <div className="px-5 py-4 border-b border-[#e4eaf0]">
              <div className="text-[15px] font-extrabold text-[#16273a] tracking-[-0.02em]">Storage usage</div>
            </div>
            <div className="px-5 py-4">
              <div className="text-[28px] font-extrabold text-[#16273a] tracking-[-0.02em] tabular">
                {totalStorageGb} <span className="text-[14px] text-[#647387] font-semibold">GB / 500 GB</span>
              </div>
              <div className="h-2.5 bg-[#eef2f6] rounded-full overflow-hidden my-3.5">
                <div className="h-full bg-gradient-to-r from-[#13558e] to-[#1d6fb5] rounded-full" style={{ width: `${Math.min((Number(totalStorageGb)/500)*100,100)}%` }} />
              </div>
              <div className="text-[11.5px] text-[#647387] font-semibold">Cloudinary · {((Number(totalStorageGb)/500)*100).toFixed(1)}% of plan capacity used</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
