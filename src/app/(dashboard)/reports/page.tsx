import { getFounderDashboardStats } from '@/actions/reports'
import { Card } from '@/components/ui/card'
import { requireUser } from '@/lib/auth/require-user'
import { formatCompactINR } from '@/lib/reports/money'
import { Activity, AlertTriangle, Building2, TrendingUp, Wallet, Banknote, CreditCard, Users, Landmark, Target } from 'lucide-react'
import Link from 'next/link'

export default async function ReportsDashboard() {
  await requireUser()
  const stats = await getFounderDashboardStats()

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Overview</h1>
          <p className="text-sm text-gray-500">Founder&apos;s snapshot of site costs, budget usage, and liabilities.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/reports/export-history" className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors inline-flex items-center justify-center">Export History</Link>
          <Link href="/reports/site-cost" className="px-4 py-2 text-sm font-medium bg-[#fc6e20] hover:bg-[#e85b0d] text-white rounded-lg shadow-sm transition-colors inline-flex items-center justify-center">Detailed Reports</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-gray-500">
            <Building2 className="w-5 h-5 text-[#fc6e20]" />
            <h3 className="font-semibold text-sm uppercase tracking-wider">Active Sites</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.totalActiveSites}</p>
          <p className="text-xs text-gray-500 mt-1">{stats.overBudgetSites} over budget</p>
        </Card>

        <Card className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-gray-500">
            <Target className="w-5 h-5 text-purple-600" />
            <h3 className="font-semibold text-sm uppercase tracking-wider">Total Budget</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCompactINR(stats.totalBudget)}</p>
          <p className="text-xs text-gray-500 mt-1">Allocated across sites</p>
        </Card>

        <Card className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-gray-500">
            <TrendingUp className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold text-sm uppercase tracking-wider">Actual Spend</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCompactINR(stats.totalActualSpend)}</p>
          <p className="text-xs text-gray-500 mt-1">Approved & paid out</p>
        </Card>

        <Card className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-gray-500">
            <Wallet className="w-5 h-5 text-emerald-600" />
            <h3 className="font-semibold text-sm uppercase tracking-wider">Budget Rem</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCompactINR(stats.budgetRemaining)}</p>
          <p className="text-xs text-gray-500 mt-1">Remaining to spend</p>
        </Card>
      </div>

      <h2 className="text-lg font-bold text-gray-900 pt-4">Liabilities & Receivables</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 rounded-xl border border-orange-100 shadow-sm bg-orange-50/50">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            <h3 className="font-semibold text-sm uppercase tracking-wider text-orange-800">Pending Appr</h3>
          </div>
          <p className="text-2xl font-bold text-orange-900">{formatCompactINR(stats.pendingApprovalAmount)}</p>
        </Card>

        <Card className="p-4 rounded-xl border border-red-100 shadow-sm bg-red-50/50">
          <div className="flex items-center gap-3 mb-2">
            <Banknote className="w-5 h-5 text-red-600" />
            <h3 className="font-semibold text-sm uppercase tracking-wider text-red-800">Vendor Payable</h3>
          </div>
          <p className="text-2xl font-bold text-red-900">{formatCompactINR(stats.vendorPayable)}</p>
        </Card>

        <Card className="p-4 rounded-xl border border-blue-100 shadow-sm bg-[#fff7ed]/50">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-[#fc6e20]" />
            <h3 className="font-semibold text-sm uppercase tracking-wider text-[#e85b0d]">Salary Payable</h3>
          </div>
          <p className="text-2xl font-bold text-blue-900">{formatCompactINR(stats.salaryPayable)}</p>
        </Card>

        <Card className="p-4 rounded-xl border border-green-100 shadow-sm bg-green-50/50">
          <div className="flex items-center gap-3 mb-2">
            <Landmark className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold text-sm uppercase tracking-wider text-green-800">Client Recv.</h3>
          </div>
          <p className="text-2xl font-bold text-green-900">{formatCompactINR(stats.clientReceivable)}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <Card className="p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><CreditCard className="w-5 h-5 text-gray-600" /> Cost Breakdown</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700">Material Costs</span>
              <span className="font-bold text-gray-900">{formatCompactINR(stats.materialCost)}</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700">Labour & Salary</span>
              <span className="font-bold text-gray-900">{formatCompactINR(stats.labourCost)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Other Expenses</span>
              <span className="font-bold text-gray-900">{formatCompactINR(stats.totalActualSpend - stats.materialCost - stats.labourCost)}</span>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-gray-600" /> Risk & Profitability</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700">Delayed Sites w/ Cost Risk</span>
              <span className="font-bold text-red-600">{stats.delayedSitesWithCostRisk}</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700">Over Budget Sites</span>
              <span className="font-bold text-orange-600">{stats.overBudgetSites}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Estimated Profitability Margin</span>
              <span className="font-bold text-emerald-600">{stats.profitMarginPercent.toFixed(1)}%</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4">* Profitability is an estimate based on recorded client contract value minus all approved material, labour, and expense payouts.</p>
        </Card>
      </div>
    </div>
  )
}
