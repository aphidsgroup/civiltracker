import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import ResponsiveTable from '@/components/responsive/ResponsiveTable'
import MobileCardList from '@/components/responsive/MobileCardList'
import { getApprovalsAction, getApprovalStatsAction } from '@/actions/approvals'
import { MessageSquare, ArrowRight } from 'lucide-react'

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>
}) {
  const session = await auth()
  if (!session?.user?.companyId && session?.user?.role !== 'SUPER_ADMIN') redirect('/login')

  const params = searchParams ? await searchParams : {}
  const activeStatus = params.status || 'ALL'

  const [approvals, stats] = await Promise.all([
    getApprovalsAction({ status: activeStatus }),
    getApprovalStatsAction(),
  ])

  const statusColors: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-800',
    SUBMITTED: 'bg-amber-100 text-amber-800',
    PENDING_REVIEW: 'bg-amber-100 text-amber-800',
    APPROVED: 'bg-emerald-100 text-emerald-800',
    PAID: 'bg-blue-100 text-blue-800',
    REJECTED: 'bg-red-100 text-red-800',
    DRAFT: 'bg-slate-100 text-slate-700',
  }

  const tabs = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'PAID']

  return (
    <div className="flex flex-col gap-5.5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold m-0 mb-1 tracking-tight text-slate-900">Approval Center</h1>
          <p className="text-slate-500 text-xs m-0">Review, verify, and disburse operational & financial requests</p>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {[
          { label: 'Pending Approvals', value: String(stats.pending), sub: 'Awaiting decision', color: 'text-amber-600' },
          { label: 'Urgent Priority', value: String(stats.urgent), sub: 'High attention required', color: 'text-red-600' },
          { label: 'Approved (7d)', value: String(stats.approvedWeek), sub: 'Recently cleared', color: 'text-emerald-600' },
          { label: 'Pending Value', value: formatCurrency(stats.pendingAmount), sub: 'Total pipeline cash', color: 'text-blue-600' },
        ].map((c) => (
          <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-[10.5px] text-slate-500 font-bold mb-1.5 uppercase tracking-wider">{c.label}</div>
            <div className={`text-2xl font-extrabold ${c.color} mb-0.5`}>{c.value}</div>
            <div className="text-[11.5px] text-slate-500 font-medium">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs / Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => {
          const isActive = activeStatus === tab
          return (
            <Link
              key={tab}
              href={`/approvals${tab === 'ALL' ? '' : `?status=${tab}`}`}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold no-underline whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 shadow-sm'
              }`}
            >
              {tab}
            </Link>
          )
        })}
      </div>

      {/* Table & Mobile Card List */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 sm:px-5 sm:py-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-sm font-extrabold m-0 text-slate-800">Workflow Requests</h2>
          <span className="text-xs text-slate-500 font-semibold">{approvals.length} records</span>
        </div>
        <div className="overflow-x-auto">
          <ResponsiveTable
            desktopView={
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Title / Request</th>
                    <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Entity</th>
                    <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Site</th>
                    <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Amount</th>
                    <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Submitted By</th>
                    <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Date</th>
                    <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Priority</th>
                    <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Status</th>
                    <th className="px-4 py-3 font-bold text-slate-700 text-xs whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {approvals.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center p-8 text-slate-500">No workflow approvals found matching this criteria.</td>
                    </tr>
                  ) : (
                    approvals.map((app) => (
                      <tr key={app.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/approvals/${app.id}`} className="font-bold text-slate-900 no-underline block max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap">
                            {app.title}
                          </Link>
                          {app._count.comments > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 font-semibold mt-0.5">
                              <MessageSquare className="w-3 h-3" /> {app._count.comments} notes
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {app.entityType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 font-semibold">
                          {app.site?.name || 'Company Wide'}
                        </td>
                        <td className="px-4 py-3 font-extrabold text-slate-900">
                          {formatCurrency(app.amount ? Number(app.amount) : 0)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 font-semibold">
                          {app.requestedBy.name}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 font-semibold">
                          {formatDate(app.submittedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                            app.priority === 'URGENT' ? 'bg-red-100 text-red-800' : app.priority === 'HIGH' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {app.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColors[app.currentStatus] ?? 'bg-slate-100 text-slate-700'}`}>
                            {app.currentStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/approvals/${app.id}`} className="inline-flex items-center justify-center px-2.5 py-1 text-[11.5px] font-bold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-sm no-underline">
                            Review
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            }
            mobileView={
              <MobileCardList
                items={approvals.map((app) => ({
                  id: app.id,
                  title: (
                    <Link href={`/approvals/${app.id}`} className="no-underline text-inherit block">
                      {app.title}
                    </Link>
                  ),
                  subtitle: `${app.entityType} • ${app.site?.name || 'Office'} • ${app.requestedBy.name}`,
                  meta: (
                    <div className="flex justify-between items-center mt-1.5">
                      <div className="text-sm font-extrabold text-slate-900">
                        {formatCurrency(app.amount ? Number(app.amount) : 0)}
                      </div>
                      <Link href={`/approvals/${app.id}`} className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 no-underline">
                        Review <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  ),
                  statusNode: (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColors[app.currentStatus] ?? 'bg-slate-100 text-slate-700'}`}>
                      {app.currentStatus}
                    </span>
                  ),
                }))}
              />
            }
          />
        </div>
      </div>
    </div>
  )
}
