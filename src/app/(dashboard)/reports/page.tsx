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
          <h1 className="text-2xl font-bold">Financial Overview</h1>
          <p className="text-sm text-mut">Founder&apos;s snapshot of site costs, budget usage, and liabilities.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/reports/export-history" className="btn-ghost text-sm">Export History</Link>
          <Link href="/reports/site-cost" className="btn-primary text-sm">Detailed Reports</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 ct-card">
          <div className="flex items-center gap-3 mb-2 text-mut">
            <Building2 className="w-5 h-5 text-p" />
            <h3 className="font-semibold text-sm uppercase tracking-wider">Active Sites</h3>
          </div>
          <p className="text-2xl font-bold">{stats.totalActiveSites}</p>
          <p className="text-xs text-mut mt-1">{stats.overBudgetSites} over budget</p>
        </Card>

        <Card className="p-4 ct-card">
          <div className="flex items-center gap-3 mb-2 text-mut">
            <Target className="w-5 h-5 text-violet" />
            <h3 className="font-semibold text-sm uppercase tracking-wider">Total Budget</h3>
          </div>
          <p className="text-2xl font-bold">{formatCompactINR(stats.totalBudget)}</p>
          <p className="text-xs text-mut mt-1">Allocated across sites</p>
        </Card>

        <Card className="p-4 ct-card">
          <div className="flex items-center gap-3 mb-2 text-mut">
            <TrendingUp className="w-5 h-5 text-amber" />
            <h3 className="font-semibold text-sm uppercase tracking-wider">Actual Spend</h3>
          </div>
          <p className="text-2xl font-bold">{formatCompactINR(stats.totalActualSpend)}</p>
          <p className="text-xs text-mut mt-1">Approved & paid out</p>
        </Card>

        <Card className="p-4 ct-card">
          <div className="flex items-center gap-3 mb-2 text-mut">
            <Wallet className="w-5 h-5 text-green" />
            <h3 className="font-semibold text-sm uppercase tracking-wider">Budget Rem</h3>
          </div>
          <p className="text-2xl font-bold">{formatCompactINR(stats.budgetRemaining)}</p>
          <p className="text-xs text-mut mt-1">Remaining to spend</p>
        </Card>
      </div>

      <h2 className="text-lg font-bold pt-4">Liabilities & Receivables</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 ct-card bg-orange-50/50">
          <div className="flex items-center gap-3 mb-2 text-mut">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            <h3 className="font-semibold text-sm uppercase tracking-wider text-orange-800">Pending Appr</h3>
          </div>
          <p className="text-2xl font-bold text-orange-900">{formatCompactINR(stats.pendingApprovalAmount)}</p>
        </Card>

        <Card className="p-4 ct-card bg-red-50/50">
          <div className="flex items-center gap-3 mb-2 text-mut">
            <Banknote className="w-5 h-5 text-red-600" />
            <h3 className="font-semibold text-sm uppercase tracking-wider text-red-800">Vendor Payable</h3>
          </div>
          <p className="text-2xl font-bold text-red-900">{formatCompactINR(stats.vendorPayable)}</p>
        </Card>

        <Card className="p-4 ct-card bg-blue-50/50">
          <div className="flex items-center gap-3 mb-2 text-mut">
            <Users className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-sm uppercase tracking-wider text-blue-800">Salary Payable</h3>
          </div>
          <p className="text-2xl font-bold text-blue-900">{formatCompactINR(stats.salaryPayable)}</p>
        </Card>

        <Card className="p-4 ct-card bg-green-50/50">
          <div className="flex items-center gap-3 mb-2 text-mut">
            <Landmark className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold text-sm uppercase tracking-wider text-green-800">Client Recv.</h3>
          </div>
          <p className="text-2xl font-bold text-green-900">{formatCompactINR(stats.clientReceivable)}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <Card className="p-6 ct-card">
          <h3 className="font-bold mb-4 flex items-center gap-2"><CreditCard className="w-5 h-5" /> Cost Breakdown</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-line">
              <span className="text-sm font-medium">Material Costs</span>
              <span className="font-bold">{formatCompactINR(stats.materialCost)}</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-line">
              <span className="text-sm font-medium">Labour & Salary</span>
              <span className="font-bold">{formatCompactINR(stats.labourCost)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Other Expenses</span>
              <span className="font-bold">{formatCompactINR(stats.totalActualSpend - stats.materialCost - stats.labourCost)}</span>
            </div>
          </div>
        </Card>

        <Card className="p-6 ct-card">
          <h3 className="font-bold mb-4 flex items-center gap-2"><Activity className="w-5 h-5" /> Risk & Profitability</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-line">
              <span className="text-sm font-medium">Delayed Sites w/ Cost Risk</span>
              <span className="font-bold text-red-600">{stats.delayedSitesWithCostRisk}</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-line">
              <span className="text-sm font-medium">Over Budget Sites</span>
              <span className="font-bold text-orange-600">{stats.overBudgetSites}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Estimated Profitability Margin</span>
              <span className="font-bold text-green-600">{stats.profitMarginPercent.toFixed(1)}%</span>
            </div>
          </div>
          <p className="text-xs text-mut mt-4">* Profitability is an estimate based on recorded client contract value minus all approved material, labour, and expense payouts.</p>
        </Card>
      </div>
    </div>
  )
}
