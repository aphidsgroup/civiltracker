import { getFounderDashboardStats } from '@/actions/reports'
import { Card } from '@/components/ui/card'
import { requireUser } from '@/lib/auth/require-user'
import { formatCompactINR } from '@/lib/reports/money'
import { AlertTriangle, TrendingUp, Users, Landmark, ChevronRight } from 'lucide-react'
import Link from 'next/link'

export default async function MobileReportsDashboard() {
  await requireUser()
  const stats = await getFounderDashboardStats()

  const quickLinks = [
    { label: 'Site Cost', href: '/reports/site-cost', color: 'border-l-amber-500' },
    { label: 'Vendor Payable', href: '/reports/vendor-payable', color: 'border-l-red-500' },
    { label: 'Client Receivable', href: '/reports/client-receivable', color: 'border-l-green-500' }
  ]

  return (
    <div className="p-4 space-y-4 pb-24 max-w-lg mx-auto bg-gray-50 min-h-screen">
      <div className="pt-2">
        <h1 className="text-xl font-bold text-gray-900">Financial Overview</h1>
        <p className="text-xs text-gray-500">Quick summary of site costs and liabilities</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm border-b-4 border-b-amber-500">
          <div className="flex items-center gap-2 mb-1 text-gray-500">
            <TrendingUp className="w-4 h-4 text-amber-500" />
            <h3 className="font-semibold text-[10px] uppercase tracking-wider">Actual Spend</h3>
          </div>
          <p className="text-lg font-bold text-gray-900">{formatCompactINR(stats.totalActualSpend)}</p>
        </Card>

        <Card className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm border-b-4 border-b-amber-600">
          <div className="flex items-center gap-2 mb-1 text-gray-500">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h3 className="font-semibold text-[10px] uppercase tracking-wider">Pending Appr.</h3>
          </div>
          <p className="text-lg font-bold text-amber-900">{formatCompactINR(stats.pendingApprovalAmount)}</p>
        </Card>

        <Card className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm border-b-4 border-b-red-500">
          <div className="flex items-center gap-2 mb-1 text-gray-500">
            <Users className="w-4 h-4 text-red-500" />
            <h3 className="font-semibold text-[10px] uppercase tracking-wider">Payable</h3>
          </div>
          <p className="text-lg font-bold text-red-900">{formatCompactINR(stats.vendorPayable + stats.salaryPayable)}</p>
        </Card>

        <Card className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm border-b-4 border-b-green-500">
          <div className="flex items-center gap-2 mb-1 text-gray-500">
            <Landmark className="w-4 h-4 text-green-500" />
            <h3 className="font-semibold text-[10px] uppercase tracking-wider">Receivable</h3>
          </div>
          <p className="text-lg font-bold text-green-900">{formatCompactINR(stats.clientReceivable)}</p>
        </Card>
      </div>

      {stats.overBudgetSites > 0 && (
        <div className="bg-red-50 text-red-800 p-3.5 rounded-xl border border-red-200 flex items-center gap-2.5 text-sm font-medium">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <span>{stats.overBudgetSites} site(s) are over budget!</span>
        </div>
      )}

      <h2 className="text-xs font-bold pt-2 uppercase tracking-wider text-gray-400 pl-1">Quick Reports</h2>
      <div className="space-y-2.5">
        {quickLinks.map(link => (
          <Link key={link.href} href={link.href} className={`block bg-white p-3.5 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center border-l-4 hover:bg-gray-50 transition-colors ${link.color}`}>
            <span className="font-semibold text-sm text-gray-800">{link.label}</span>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </Link>
        ))}
      </div>
    </div>
  )
}
