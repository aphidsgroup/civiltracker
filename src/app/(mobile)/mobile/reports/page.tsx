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
    { label: 'Site Cost', href: '/reports/site-cost', color: 'border-l-p' },
    { label: 'Vendor Payable', href: '/reports/vendor-payable', color: 'border-l-red-500' },
    { label: 'Client Receivable', href: '/reports/client-receivable', color: 'border-l-green-500' }
  ]

  return (
    <div className="p-4 space-y-4 pb-20">
      <div>
        <h1 className="text-xl font-bold">Financial Overview</h1>
        <p className="text-xs text-mut">Quick summary of site costs and liabilities</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3 ct-card border-b-4 border-b-p">
          <div className="flex items-center gap-2 mb-1 text-mut">
            <TrendingUp className="w-4 h-4 text-p" />
            <h3 className="font-semibold text-[10px] uppercase tracking-wider">Actual Spend</h3>
          </div>
          <p className="text-lg font-bold">{formatCompactINR(stats.totalActualSpend)}</p>
        </Card>

        <Card className="p-3 ct-card border-b-4 border-b-amber">
          <div className="flex items-center gap-2 mb-1 text-mut">
            <AlertTriangle className="w-4 h-4 text-amber" />
            <h3 className="font-semibold text-[10px] uppercase tracking-wider">Pending Appr.</h3>
          </div>
          <p className="text-lg font-bold text-orange-900">{formatCompactINR(stats.pendingApprovalAmount)}</p>
        </Card>

        <Card className="p-3 ct-card border-b-4 border-b-red-500">
          <div className="flex items-center gap-2 mb-1 text-mut">
            <Users className="w-4 h-4 text-red-500" />
            <h3 className="font-semibold text-[10px] uppercase tracking-wider">Payable</h3>
          </div>
          <p className="text-lg font-bold text-red-900">{formatCompactINR(stats.vendorPayable + stats.salaryPayable)}</p>
        </Card>

        <Card className="p-3 ct-card border-b-4 border-b-green-500">
          <div className="flex items-center gap-2 mb-1 text-mut">
            <Landmark className="w-4 h-4 text-green-500" />
            <h3 className="font-semibold text-[10px] uppercase tracking-wider">Receivable</h3>
          </div>
          <p className="text-lg font-bold text-green-900">{formatCompactINR(stats.clientReceivable)}</p>
        </Card>
      </div>

      {stats.overBudgetSites > 0 && (
        <div className="bg-red-50 text-red-800 p-3 rounded-xl border border-red-200 flex items-center gap-2 text-sm">
          <AlertTriangle className="w-4 h-4" />
          <span className="font-semibold">{stats.overBudgetSites} site(s) are over budget!</span>
        </div>
      )}

      <h2 className="text-sm font-bold pt-2 uppercase tracking-wide text-mut">Quick Reports</h2>
      <div className="space-y-2">
        {quickLinks.map(link => (
          <Link key={link.href} href={link.href} className={`block bg-white p-3 rounded-xl border border-line shadow-sm flex justify-between items-center border-l-4 ${link.color}`}>
            <span className="font-semibold text-sm">{link.label}</span>
            <ChevronRight className="w-4 h-4 text-mut" />
          </Link>
        ))}
      </div>
    </div>
  )
}
