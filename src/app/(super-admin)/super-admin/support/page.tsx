import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { LifeBuoy, Clock, CheckCircle, Building } from 'lucide-react'

export default async function SupportPage() {
  const session = await auth()
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard')

  const pendingApprovals = await prisma.approval.findMany({
    where: { deletedAt: null, currentStatus: 'PENDING' },
    include: {
      company: { select: { name: true } },
      requestedBy: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const totalPending = await prisma.approval.count({ where: { deletedAt: null, currentStatus: 'PENDING' } })
  const totalApproved = await prisma.approval.count({ where: { deletedAt: null, currentStatus: 'APPROVED' } })
  const totalCompanies = await prisma.company.count()

  function priorityStyle(priority: string) {
    if (priority === 'URGENT') return 'bg-rose-100 text-rose-700 font-bold'
    if (priority === 'HIGH') return 'bg-amber-100 text-amber-700 font-bold'
    return 'bg-slate-100 text-slate-600 font-medium'
  }

  function statusStyle(status: string) {
    if (status === 'APPROVED') return 'bg-emerald-100 text-emerald-800'
    if (status === 'REJECTED') return 'bg-rose-100 text-rose-800'
    return 'bg-amber-100 text-amber-800'
  }

  return (
    <>
      <div className="flex items-center justify-between px-8 py-5 border-b border-slate-200 bg-white">
        <div className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <LifeBuoy className="text-[#fc6e20]" size={20} />
          Support & Approvals
        </div>
      </div>

      <div className="p-8 max-w-7xl mx-auto space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
              <Clock size={24} />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Pending</div>
              <div className="text-2xl font-black text-slate-800 mt-1">{totalPending}</div>
              <div className="text-xs font-semibold text-amber-600 mt-0.5">Awaiting action</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
              <CheckCircle size={24} />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Approved</div>
              <div className="text-2xl font-black text-slate-800 mt-1">{totalApproved}</div>
              <div className="text-xs font-semibold text-emerald-600 mt-0.5">Resolved</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#fff7ed] text-[#e85b0d] flex items-center justify-center flex-shrink-0">
              <Building size={24} />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Companies</div>
              <div className="text-2xl font-black text-slate-800 mt-1">{totalCompanies}</div>
              <div className="text-xs font-semibold text-slate-500 mt-0.5">On platform</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-6">Title</th>
                  <th className="py-3.5 px-6">Company</th>
                  <th className="py-3.5 px-6">Requested By</th>
                  <th className="py-3.5 px-6">Type</th>
                  <th className="py-3.5 px-6">Priority</th>
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {pendingApprovals.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-6 font-semibold text-slate-800 max-w-[240px] truncate">
                      {a.title}
                    </td>
                    <td className="py-4 px-6 text-slate-600">{a.company.name}</td>
                    <td className="py-4 px-6">
                      <div className="font-semibold text-slate-800 text-xs">{a.requestedBy.name}</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">{a.requestedBy.email}</div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-slate-100 text-slate-600">
                        {a.entityType}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded ${priorityStyle(a.priority)}`}>
                        {a.priority}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-bold rounded-full ${statusStyle(a.currentStatus)}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {a.currentStatus}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-xs text-slate-400">
                      {new Date(a.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </td>
                  </tr>
                ))}
                {pendingApprovals.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      No pending items.
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
