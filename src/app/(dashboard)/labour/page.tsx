import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ResponsiveTable from '@/components/responsive/ResponsiveTable'
import MobileCardList from '@/components/responsive/MobileCardList'
import { formatCurrency } from '@/lib/utils'
import { Users, UserCheck, UserMinus, HardHat } from 'lucide-react'

export const metadata = { title: 'Labour | Civil Tracker' }

export default async function LabourPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const labour = await prisma.labour.findMany({
    where: { companyId },
    include: {
      site: { select: { name: true } },
      _count: { select: { attendance: true } },
    },
    orderBy: { name: 'asc' },
  })

  const active = labour.filter(l => l.isActive).length

  const tradeColors: Record<string, string> = {
    MASON: 'bg-[#fff7ed] text-[#e85b0d] dark:bg-blue-900/30 dark:text-blue-400',
    HELPER: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
    CARPENTER: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    BAR_BENDER: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    ELECTRICIAN: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    PLUMBER: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
    PAINTER: 'bg-[#fff7ed] text-[#e85b0d] dark:bg-indigo-900/30 dark:text-[#fc6e20]',
    SUPERVISOR: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Labour</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{active} active workers</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Workers', value: labour.length, icon: Users, color: 'text-[#fc6e20] dark:text-blue-400', bg: 'bg-[#fff7ed] dark:bg-blue-950/50' },
          { label: 'Active', value: active, icon: UserCheck, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/50' },
          { label: 'Inactive', value: labour.length - active, icon: UserMinus, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800' },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{s.label}</div>
                <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{s.value}</div>
              </div>
              <div className={`p-3 rounded-lg ${s.bg} ${s.color}`}>
                <Icon className="w-6 h-6" />
              </div>
            </div>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <HardHat className="w-5 h-5 text-slate-500" />
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">All Workers</h2>
        </div>
        <div className="overflow-x-auto">
          <ResponsiveTable
            desktopView={
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Trade</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Site</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Daily Wage</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Phone</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {labour.map(l => (
                    <tr key={l.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3.5 text-sm">
                        <div className="font-bold text-slate-900 dark:text-slate-100">{l.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">{l._count.attendance} days logged</div>
                      </td>
                      <td className="px-4 py-3.5 text-sm">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-block ${tradeColors[l.trade] ?? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'}`}>
                          {l.trade.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-600 dark:text-slate-300 font-medium">{l.site?.name || 'Unassigned'}</td>
                      <td className="px-4 py-3.5 text-sm font-bold text-slate-900 dark:text-slate-100">{formatCurrency(Number(l.dailyWage))}</td>
                      <td className="px-4 py-3.5 text-sm text-slate-500 dark:text-slate-400">{l.phone || '-'}</td>
                      <td className="px-4 py-3.5 text-sm">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-block ${
                          l.isActive 
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' 
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          {l.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
            mobileView={
              <MobileCardList
                items={labour.map(l => ({
                  id: l.id,
                  title: l.name,
                  subtitle: `${l.site?.name || 'Unassigned'} • ${l._count.attendance} days logged`,
                  meta: <div className="text-sm font-bold mt-1 text-slate-900 dark:text-slate-100">Wage: {formatCurrency(Number(l.dailyWage))}</div>,
                  statusNode: (
                    <div className="flex flex-col items-end gap-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        l.isActive 
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' 
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {l.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${tradeColors[l.trade] ?? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'}`}>
                        {l.trade.replace('_', ' ')}
                      </span>
                    </div>
                  )
                }))}
              />
            }
          />
        </div>
      </div>
    </div>
  )
}
