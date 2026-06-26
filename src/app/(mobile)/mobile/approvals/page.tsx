import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import MobileCardList from '@/components/responsive/MobileCardList'
import { getApprovalsAction } from '@/actions/approvals'
import { ArrowLeft, CheckSquare } from 'lucide-react'

export default async function MobileApprovalsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const params = searchParams ? await searchParams : {}
  const activeStatus = params.status || 'ALL'

  const approvals = await getApprovalsAction({ status: activeStatus })

  const statusBadge: Record<string, string> = {
    PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
    SUBMITTED: 'bg-amber-50 text-amber-700 border-amber-200',
    PENDING_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
    APPROVED: 'bg-green-50 text-green-700 border-green-200',
    PAID: 'bg-[#fff7ed] text-[#e85b0d] border-blue-200',
    REJECTED: 'bg-red-50 text-red-700 border-red-200',
    DRAFT: 'bg-gray-50 text-gray-600 border-gray-200',
  }

  const tabs = ['ALL', 'PENDING', 'APPROVED', 'REJECTED']

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto bg-gray-50 min-h-screen">
      <div className="mb-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3">
        <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
          <CheckSquare className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Field Approvals</h1>
          <p className="text-xs text-gray-500">Review site requests & bills</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto mb-4 pb-1 scrollbar-none">
        {tabs.map((tab) => {
          const isActive = activeStatus === tab
          return (
            <Link
              key={tab}
              href={`/mobile/approvals${tab === 'ALL' ? '' : `?status=${tab}`}`}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {tab}
            </Link>
          )
        })}
      </div>

      {/* Mobile Card List */}
      <MobileCardList
        items={approvals.map((app) => ({
          id: app.id,
          title: (
            <Link href={`/mobile/approvals/${app.id}`} className="block font-semibold text-gray-900 hover:text-amber-600 transition-colors">
              {app.title}
            </Link>
          ),
          subtitle: `${app.entityType} • ${app.site?.name || 'Office'} • ${app.requestedBy.name}`,
          meta: (
            <div className="flex justify-between items-center mt-2">
              <div className="text-sm font-extrabold text-gray-900">
                {formatCurrency(app.amount ? Number(app.amount) : 0)}
              </div>
              <span className="text-[11px] text-gray-400 font-medium">
                {formatDate(app.submittedAt)}
              </span>
            </div>
          ),
          statusNode: (
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider ${statusBadge[app.currentStatus] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
              {app.currentStatus}
            </span>
          ),
        }))}
      />

      <div className="mt-8 text-center">
        <Link href="/mobile/home" className="inline-flex items-center text-amber-600 font-bold text-xs hover:underline">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Mobile Home
        </Link>
      </div>
    </div>
  )
}
