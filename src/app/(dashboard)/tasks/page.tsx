import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { ListTodo, CircleDashed, Clock, CheckCircle2, AlertCircle } from 'lucide-react'

const STATUS_COLOR: Record<string, string> = {
  NOT_STARTED: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  IN_PROGRESS: 'bg-[#fff7ed] text-[#e85b0d] dark:bg-blue-900/30 dark:text-blue-400',
  DELAYED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  COMPLETED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
}

const STATUS_DOT: Record<string, string> = {
  NOT_STARTED: 'bg-slate-400 dark:bg-slate-500',
  IN_PROGRESS: 'bg-[#fc6e20] dark:bg-blue-400',
  DELAYED: 'bg-red-500 dark:bg-red-400',
  COMPLETED: 'bg-emerald-500 dark:bg-emerald-400',
}

export default async function TasksPage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect('/login')
  const { companyId } = session.user

  const tasks = await prisma.task.findMany({
    where: { companyId },
    include: { site: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const notStarted = tasks.filter(t => t.status === 'NOT_STARTED').length
  const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS').length
  const completed  = tasks.filter(t => t.status === 'COMPLETED').length
  const delayed    = tasks.filter(t => t.status === 'DELAYED').length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Tasks</h1>
        <a href="/tasks/new" className="bg-[#fc6e20] text-white rounded-lg px-4 py-2 text-xs font-bold no-underline hover:bg-[#e85b0d] transition-colors">
          + Create Task
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Not Started', value: notStarted, icon: CircleDashed, color: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800' },
          { label: 'In Progress', value: inProgress, icon: Clock, color: 'text-[#fc6e20] dark:text-blue-400', bg: 'bg-[#fff7ed] dark:bg-blue-950/50' },
          { label: 'Completed',   value: completed, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/50' },
          { label: 'Delayed',     value: delayed, icon: AlertCircle, color: delayed > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400', bg: delayed > 0 ? 'bg-red-50 dark:bg-red-950/50' : 'bg-slate-100 dark:bg-slate-800' },
        ].map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{k.label}</div>
                <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{k.value}</div>
              </div>
              <div className={`p-3 rounded-lg ${k.bg} ${k.color}`}>
                <Icon className="w-6 h-6" />
              </div>
            </div>
          )
        })}
      </div>

      {tasks.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center shadow-sm flex flex-col items-center justify-center">
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-full mb-4">
            <ListTodo className="w-10 h-10" />
          </div>
          <h2 className="font-bold text-lg text-slate-900 dark:text-slate-100 mb-2">No tasks yet</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
            Tasks are created per site to track work items and milestones.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Task</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Site</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Stage</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Progress</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Due Date</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {tasks.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3.5 text-sm">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{t.name}</div>
                      {t.description && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-xs truncate">{t.description.substring(0, 60)}{t.description.length > 60 ? '…' : ''}</div>}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400 font-medium">{t.site.name}</td>
                    <td className="px-4 py-3.5 text-xs font-semibold text-slate-700 dark:text-slate-300">{String(t.stage).replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3.5 text-sm">
                      <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">{t.progress}%</div>
                      <div className="w-20 bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div className="bg-[#fc6e20] dark:bg-[#fc6e20] h-full rounded-full transition-all" style={{ width: `${t.progress}%` }}></div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                      {t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-sm">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 ${STATUS_COLOR[t.status] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[t.status] ?? 'bg-slate-400'}`}></span>
                        {String(t.status).replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
