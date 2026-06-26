import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getInitials } from '@/lib/utils'
import ResponsiveTable from '@/components/responsive/ResponsiveTable'
import MobileCardList from '@/components/responsive/MobileCardList'
import { CompanyStatus } from '@prisma/client'
import { Plus } from 'lucide-react'

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>
}) {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const resolvedSearchParams = await searchParams
  const tab = resolvedSearchParams.tab || 'all'

  const companies = await prisma.company.findMany({
    where: tab === 'all' ? {} : { status: tab.toUpperCase() as CompanyStatus },
    include: {
      members: { where: { role: 'COMPANY_ADMIN' }, include: { user: true } },
      sites: true,
      _count: { select: { members: true, sites: true } }
    },
    orderBy: { createdAt: 'desc' }
  })

  // Calculate totals for tabs
  const allCount = await prisma.company.count()
  const activeCount = await prisma.company.count({ where: { status: 'ACTIVE' } })
  const trialCount = await prisma.company.count({ where: { status: 'TRIAL' } })
  const suspendedCount = await prisma.company.count({ where: { status: 'SUSPENDED' } })

  const tabs = [
    { id: 'all', label: 'All Companies', count: allCount },
    { id: 'active', label: 'Active', count: activeCount },
    { id: 'trial', label: 'Trial', count: trialCount },
    { id: 'suspended', label: 'Suspended', count: suspendedCount },
  ]

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Company Directory</h1>
        <Link href="/super-admin/companies/new" className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#fc6e20] hover:bg-[#e85b0d] text-white text-sm font-medium rounded-lg shadow-sm transition-colors">
          <Plus className="w-4 h-4" /> Add Company
        </Link>
      </div>
      
      <div className="p-6">
        <div className="flex flex-wrap gap-2 mb-6 bg-white p-1.5 rounded-xl border border-gray-200 w-fit">
          {tabs.map(t => {
            const isActiveTab = tab === t.id
            return (
              <Link 
                key={t.id} 
                href={`?tab=${t.id}`}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActiveTab ? 'bg-[#fff7ed] text-[#e85b0d]' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
              >
                {t.label}
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${isActiveTab ? 'bg-[#fc6e20] text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {t.count}
                </span>
              </Link>
            )
          })}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
          <ResponsiveTable
            desktopView={
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/75">
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Company</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Owner</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Plan</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sites</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Users</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Storage</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {companies.map(c => {
                    const owner = c.members[0]?.user
                    const maxUsers = 50 // Mock max users based on plan
                    const maxSites = 10 // Mock max sites
                    
                    const sitePct = Math.min((c._count.sites / maxSites) * 100, 100)
                    const userPct = Math.min((c._count.members / maxUsers) * 100, 100)
                    
                    let stCls = 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    let dotCls = 'bg-emerald-500'
                    if (c.status === 'TRIAL') {
                      stCls = 'bg-amber-50 text-amber-700 border-amber-200'
                      dotCls = 'bg-amber-500'
                    }
                    if (c.status === 'SUSPENDED') {
                      stCls = 'bg-rose-50 text-rose-700 border-rose-200'
                      dotCls = 'bg-rose-500'
                    }

                    return (
                      <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-900 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                              {getInitials(c.name)}
                            </div>
                            <div>
                              <div className="font-bold text-sm text-gray-900">{c.name}</div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {c.city} • since {new Date(c.createdAt).getFullYear()}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-sm text-gray-900">{owner?.name || 'No Owner'}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{owner?.phone || owner?.email || '-'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#fff7ed] text-[#e85b0d] border border-blue-200">
                            {c.plan || 'PRO'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs font-semibold text-gray-700 mb-1.5">{c._count.sites} of {maxSites} used</div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div className={`h-full rounded-full ${sitePct > 90 ? 'bg-rose-500' : sitePct > 75 ? 'bg-amber-500' : 'bg-[#fc6e20]'}`} style={{ width: `${sitePct}%` }} />
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs font-semibold text-gray-700 mb-1.5">{c._count.members} of {maxUsers} active</div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div className={`h-full rounded-full ${userPct > 90 ? 'bg-rose-500' : userPct > 75 ? 'bg-amber-500' : 'bg-[#fc6e20]'}`} style={{ width: `${userPct}%` }} />
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-sm text-gray-900">{(Number(c.storageUsed) / (1024 * 1024)).toFixed(1)} MB</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${stCls}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
                            {c.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <Link href={`/super-admin/companies/${c.id}`} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors inline-block">
                            Manage
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                  
                  {companies.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-sm text-gray-500">
                        No companies found for this status.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            }
            mobileView={
              <MobileCardList
                items={companies.map(c => {
                  const owner = c.members[0]?.user
                  let stCls = 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  let dotCls = 'bg-emerald-500'
                  if (c.status === 'TRIAL') {
                    stCls = 'bg-amber-50 text-amber-700 border-amber-200'
                    dotCls = 'bg-amber-500'
                  }
                  if (c.status === 'SUSPENDED') {
                    stCls = 'bg-rose-50 text-rose-700 border-rose-200'
                    dotCls = 'bg-rose-500'
                  }

                  return {
                    id: c.id,
                    title: c.name,
                    subtitle: owner ? owner.email : 'No owner',
                    meta: (
                      <div className="flex gap-2 mt-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-[#fff7ed] text-[#e85b0d] border border-blue-200">{c.plan || 'PRO'}</span>
                        <span className="text-xs text-gray-500 font-semibold">{c._count.sites} sites</span>
                      </div>
                    ),
                    statusNode: (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${stCls}`}>
                        <span className={`w-1 h-1 rounded-full ${dotCls}`} />
                        {c.status}
                      </span>
                    ),
                    avatar: (
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-900 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {getInitials(c.name)}
                      </div>
                    )
                  }
                })}
              />
            }
          />
        </div>
      </div>
    </div>
  )
}
