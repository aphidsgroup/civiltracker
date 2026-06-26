import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { ScrollText, Activity, ShieldAlert } from 'lucide-react'

export default async function SystemLogsPage() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const logs = await prisma.auditLog.findMany({
    include: {
      user: { select: { name: true, email: true } },
      company: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const totalLogs = await prisma.auditLog.count()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayLogs = await prisma.auditLog.count({ where: { createdAt: { gte: todayStart } } })

  function actionBadge(action: string) {
    if (action === 'CREATE') return 'bg-emerald-100 text-emerald-800'
    if (action === 'UPDATE') return 'bg-blue-100 text-blue-800'
    if (action === 'DELETE') return 'bg-rose-100 text-rose-800'
    if (action === 'LOGIN') return 'bg-amber-100 text-amber-800'
    return 'bg-slate-100 text-slate-700'
  }

  return (
    <>
      <div className="flex items-center justify-between px-8 py-5 border-b border-slate-200 bg-white">
        <div className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <ScrollText className="text-blue-600" size={20} />
          System Audit Logs
        </div>
      </div>

      <div className="p-8 max-w-7xl mx-auto space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
              <ScrollText size={24} />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Events</div>
              <div className="text-2xl font-black text-slate-800 mt-1">{totalLogs.toLocaleString()}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
              <Activity size={24} />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Today</div>
              <div className="text-2xl font-black text-slate-800 mt-1">{todayLogs}</div>
              <div className="text-xs font-semibold text-emerald-600 mt-0.5">Last 24 hours</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
              <ShieldAlert size={24} />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Showing</div>
              <div className="text-2xl font-black text-slate-800 mt-1">{logs.length}</div>
              <div className="text-xs font-semibold text-slate-500 mt-0.5">Most recent feed</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-6">Timestamp</th>
                  <th className="py-3.5 px-6">User</th>
                  <th className="py-3.5 px-6">Company</th>
                  <th className="py-3.5 px-6">Action</th>
                  <th className="py-3.5 px-6">Module</th>
                  <th className="py-3.5 px-6">Record ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {logs.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50/50 transition-colors font-mono text-xs">
                    <td className="py-3.5 px-6 text-slate-500 whitespace-nowrap">
                      {new Date(l.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3.5 px-6 font-sans">
                      <div className="font-semibold text-slate-800 text-sm">{l.user?.name ?? '—'}</div>
                      <div className="text-slate-400 text-xs mt-0.5">{l.user?.email}</div>
                    </td>
                    <td className="py-3.5 px-6 font-sans text-slate-600">{l.company?.name ?? '—'}</td>
                    <td className="py-3.5 px-6 font-sans">
                      <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ${actionBadge(l.action)}`}>
                        {l.action}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 font-sans font-semibold text-slate-700 capitalize">{l.module ?? '—'}</td>
                    <td className="py-3.5 px-6 text-slate-400 truncate max-w-[150px]">
                      {l.recordId ?? '—'}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 font-sans text-sm">
                      No logs recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
