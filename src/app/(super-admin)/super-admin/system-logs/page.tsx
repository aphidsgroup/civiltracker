import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Activity, ScrollText, ShieldAlert, Users, Building2, Wallet, IndianRupee, FileText, UserCheck, Key } from 'lucide-react'

const MODULE_META: Record<string, { label: string; icon: string; color: string }> = {
  EXPENSE:          { label: 'Expense',         icon: '💸', color: 'bg-emerald-100 text-emerald-800' },
  BILL_UPLOAD:      { label: 'Bill Upload',      icon: '🧾', color: 'bg-blue-100 text-blue-800' },
  SITE:             { label: 'Site / Project',   icon: '🏗️', color: 'bg-orange-100 text-orange-800' },
  USER:             { label: 'User Mgmt',        icon: '👤', color: 'bg-purple-100 text-purple-800' },
  PASSWORD_RESET:   { label: 'Password Reset',   icon: '🔑', color: 'bg-rose-100 text-rose-800' },
  CLIENT_ADVANCE:   { label: 'Client Advance',   icon: '💰', color: 'bg-amber-100 text-amber-800' },
  ATTENDANCE:       { label: 'Attendance',       icon: '✅', color: 'bg-teal-100 text-teal-800' },
  LABOUR:           { label: 'Labour',           icon: '👷', color: 'bg-indigo-100 text-indigo-800' },
  APPROVAL:         { label: 'Approval',         icon: '📋', color: 'bg-sky-100 text-sky-800' },
  REPORT:           { label: 'Report',           icon: '📊', color: 'bg-slate-100 text-slate-800' },
}

function actionBadge(action: string) {
  if (action === 'CREATE') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (action === 'UPDATE') return 'bg-amber-100 text-amber-800 border-amber-200'
  if (action === 'DELETE') return 'bg-rose-100 text-rose-800 border-rose-200'
  if (action === 'LOGIN')  return 'bg-blue-100 text-blue-800 border-blue-200'
  if (action === 'APPROVE' || action === 'REJECT') return 'bg-purple-100 text-purple-800 border-purple-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

function getDescription(log: { module: string; action: string; after: unknown; before: unknown; user: { name: string | null; email: string } | null }) {
  // Try to extract _description from the after JSON blob first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const after = log.after as any
  if (after && typeof after === 'object' && after._description) {
    return after._description as string
  }

  // Fallback: human-readable default
  const who = log.user?.name ?? log.user?.email ?? 'Unknown User'
  const mod = MODULE_META[log.module]?.label ?? log.module
  return `${who} performed ${log.action} on ${mod}`
}

export default async function SystemLogsPage() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const logs = await prisma.auditLog.findMany({
    include: {
      user: { select: { name: true, email: true } },
      company: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const totalLogs = await prisma.auditLog.count()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayLogs = await prisma.auditLog.count({ where: { createdAt: { gte: todayStart } } })

  // Module activity breakdown
  const moduleGroups = logs.reduce<Record<string, number>>((acc, l) => {
    acc[l.module] = (acc[l.module] ?? 0) + 1
    return acc
  }, {})

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#fff7ed] flex items-center justify-center">
            <Activity className="text-[#fc6e20]" size={20} />
          </div>
          <div>
            <div className="text-lg font-extrabold text-slate-800">Activity &amp; Audit Logs</div>
            <div className="text-xs text-slate-500 font-medium mt-0.5">
              Every user action across all companies — real-time feed
            </div>
          </div>
        </div>
      </div>

      <div className="p-8 max-w-7xl mx-auto space-y-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Total Events', value: totalLogs.toLocaleString(), Icon: ScrollText, bg: 'bg-[#fff7ed]', color: 'text-[#e85b0d]' },
            { label: 'Today\'s Activity', value: todayLogs.toString(), sub: 'last 24 hours', Icon: Activity, bg: 'bg-emerald-50', color: 'text-emerald-700' },
            { label: 'Showing', value: logs.length.toString(), sub: 'most recent entries', Icon: ShieldAlert, bg: 'bg-amber-50', color: 'text-amber-700' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${k.bg} ${k.color} flex items-center justify-center flex-shrink-0`}>
                <k.Icon size={22} strokeWidth={1.8} />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">{k.label}</div>
                <div className="text-2xl font-black text-slate-800 mt-0.5 tabular-nums">{k.value}</div>
                {k.sub && <div className="text-xs font-semibold text-slate-400 mt-0.5">{k.sub}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* Module Activity Breakdown */}
        {Object.keys(moduleGroups).length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Activity by Module</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(moduleGroups).sort((a, b) => b[1] - a[1]).map(([mod, cnt]) => {
                const meta = MODULE_META[mod]
                return (
                  <div key={mod} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${meta?.color ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                    <span>{meta?.icon ?? '📌'}</span>
                    <span>{meta?.label ?? mod}</span>
                    <span className="ml-1 px-1.5 py-0.5 bg-white/60 rounded-full tabular-nums">{cnt}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Logs Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="text-sm font-extrabold text-slate-700">Live Activity Feed</div>
            <div className="text-xs text-slate-400 font-medium">Latest {logs.length} events</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/75 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-6">When</th>
                  <th className="py-3.5 px-6">Who</th>
                  <th className="py-3.5 px-6">Company</th>
                  <th className="py-3.5 px-6">Action</th>
                  <th className="py-3.5 px-6">Module</th>
                  <th className="py-3.5 px-6 min-w-[260px]">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {logs.map(l => {
                  const meta = MODULE_META[l.module]
                  const description = getDescription({
                    module: l.module,
                    action: l.action,
                    after: l.after,
                    before: l.before,
                    user: l.user,
                  })
                  return (
                    <tr key={l.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-6 text-xs text-slate-500 whitespace-nowrap font-mono">
                        {new Date(l.createdAt).toLocaleString('en-IN', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                        })}
                      </td>
                      <td className="py-3.5 px-6">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#fc6e20] to-[#e85b0d] text-white flex items-center justify-center text-[10px] font-extrabold flex-shrink-0">
                            {(l.user?.name ?? l.user?.email ?? '?').substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-800 text-sm leading-none">{l.user?.name ?? '—'}</div>
                            <div className="text-slate-400 text-[11px] mt-0.5">{l.user?.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-6 text-sm text-slate-600 font-medium">{l.company?.name ?? '—'}</td>
                      <td className="py-3.5 px-6">
                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${actionBadge(l.action)}`}>
                          {l.action}
                        </span>
                      </td>
                      <td className="py-3.5 px-6">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${meta?.color ?? 'bg-slate-100 text-slate-700'}`}>
                          <span className="text-[12px]">{meta?.icon ?? '📌'}</span>
                          <span>{meta?.label ?? l.module}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-6 text-xs text-slate-700 leading-snug max-w-[300px]">
                        {description}
                      </td>
                    </tr>
                  )
                })}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-14 text-center text-slate-400 text-sm">
                      No activity logged yet. Actions will appear here as users interact with the platform.
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
