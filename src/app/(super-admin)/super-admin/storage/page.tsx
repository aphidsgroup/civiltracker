import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { HardDrive, Cloud, FileCode, Building2 } from 'lucide-react'

export default async function StoragePage() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const companies = await prisma.company.findMany({
    select: {
      id: true, name: true, plan: true, storageLimitMb: true, storageUsed: true, status: true,
      _count: { select: { sites: true } },
    },
    orderBy: { storageUsed: 'desc' },
  })

  const totalAgg = await prisma.company.aggregate({ _sum: { storageUsed: true, storageLimitMb: true } })
  const totalUsedMb = Number(totalAgg._sum.storageUsed || 0) / (1024 * 1024)
  const totalLimitMb = Number(totalAgg._sum.storageLimitMb || 0)
  const mediaCount = await prisma.mediaAsset.count()

  function statusStyle(status: string) {
    if (status === 'ACTIVE') return 'bg-emerald-100 text-emerald-800'
    if (status === 'TRIAL') return 'bg-amber-100 text-amber-800'
    return 'bg-rose-100 text-rose-800'
  }

  return (
    <>
      <div className="flex items-center justify-between px-8 py-5 border-b border-slate-200 bg-white">
        <div className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <HardDrive className="text-[#fc6e20]" size={20} />
          Platform Storage Meter
        </div>
      </div>

      <div className="p-8 max-w-7xl mx-auto space-y-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Used</div>
            <div className="text-2xl font-black text-slate-800 mt-1">{totalUsedMb.toFixed(1)} MB</div>
            <div className="text-xs font-semibold text-[#fc6e20] mt-0.5">Cloudinary storage</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Allocated</div>
            <div className="text-2xl font-black text-slate-800 mt-1">{(totalLimitMb / 1024).toFixed(1)} GB</div>
            <div className="text-xs font-semibold text-slate-500 mt-0.5">Combined company quotas</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Media Assets</div>
            <div className="text-2xl font-black text-slate-800 mt-1">{mediaCount}</div>
            <div className="text-xs font-semibold text-slate-500 mt-0.5">Indexed files</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Companies</div>
            <div className="text-2xl font-black text-slate-800 mt-1">{companies.length}</div>
            <div className="text-xs font-semibold text-slate-500 mt-0.5">Active workspaces</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-6">Company</th>
                  <th className="py-3.5 px-6">Plan</th>
                  <th className="py-3.5 px-6">Sites</th>
                  <th className="py-3.5 px-6">Used</th>
                  <th className="py-3.5 px-6">Limit</th>
                  <th className="py-3.5 px-6 w-48">Usage Meter</th>
                  <th className="py-3.5 px-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {companies.map(c => {
                  const usedMb = Number(c.storageUsed) / (1024 * 1024)
                  const limitMb = c.storageLimitMb
                  const pct = Math.min((usedMb / limitMb) * 100, 100)
                  const isHigh = pct > 90
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-6 font-bold text-slate-900 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#fc6e20] text-white flex items-center justify-center font-extrabold text-xs flex-shrink-0">
                          {c.name.substring(0, 2).toUpperCase()}
                        </div>
                        <span>{c.name}</span>
                      </td>
                      <td className="py-4 px-6">
                        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-700 border border-slate-200">
                          {c.plan}
                        </span>
                      </td>
                      <td className="py-4 px-6 font-semibold text-slate-600">{c._count.sites}</td>
                      <td className="py-4 px-6 font-bold text-slate-800">{usedMb.toFixed(2)} MB</td>
                      <td className="py-4 px-6 text-slate-400">{limitMb} MB</td>
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-semibold text-slate-500">{pct.toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${isHigh ? 'bg-rose-500' : 'bg-[#fc6e20]'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-bold rounded-full ${statusStyle(c.status)}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
