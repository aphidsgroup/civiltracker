import { getFounderDashboardStats } from '@/actions/reports'
import { Card } from '@/components/ui/card'
import { requireUser } from '@/lib/auth/require-user'
import { formatCompactINR } from '@/lib/reports/money'
import { AlertTriangle, TrendingUp, Users, Landmark, ChevronRight, HardHat, FileCheck, Camera, Receipt, Building2 } from 'lucide-react'
import Link from 'next/link'

export default async function MobileReportsDashboard() {
  const user = await requireUser()
  const isSiteEngineer = user.role === 'SITE_ENGINEER' || user.role === 'SUPERVISOR'

  if (isSiteEngineer) {
    const engineerLinks = [
      { label: 'Daily Muster Roll & Attendance', desc: 'View and mark worker attendance', href: '/mobile/attendance', icon: HardHat, color: 'text-blue-600 bg-blue-50 border-l-blue-500' },
      { label: 'Daily Progress Reports (DPR)', desc: 'Submit daily work achievements', href: '/mobile/dpr', icon: FileCheck, color: 'text-emerald-600 bg-emerald-50 border-l-emerald-500' },
      { label: 'Site Expense Submissions', desc: 'Log petty cash and material inputs', href: '/mobile/add-expense', icon: Receipt, color: 'text-amber-600 bg-amber-50 border-l-amber-500' },
      { label: 'Site Photo Documentation', desc: 'Upload timestamped site photos', href: '/mobile/site-photo', icon: Camera, color: 'text-purple-600 bg-purple-50 border-l-purple-500' },
    ]

    return (
      <div className="p-4 space-y-5 pb-24 max-w-lg mx-auto bg-slate-50 min-h-screen select-none">
        <div className="pt-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-wider mb-2">
            <span>Site Engineer Portal</span>
          </div>
          <h1 className="text-xl font-black text-slate-900">Field Operations Report</h1>
          <p className="text-xs text-slate-500 font-medium">Access your assigned site logs and field input submissions</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-700 mb-1">Payment & Financial Notice</div>
          <p className="text-[11px] text-slate-500 leading-relaxed m-0">
            High-level company payment ledgers and total project contract values are restricted to Company Management. You can submit payment inputs and vouchers via the designated buttons below.
          </p>
        </div>

        <div className="space-y-3">
          <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 pl-1">Field Data Submissions</div>
          {engineerLinks.map(item => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between border-l-4 no-underline active:scale-98 transition-all ${item.color}`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-white shadow-sm">
                    <Icon size={20} />
                  </div>
                  <div>
                    <div className="font-extrabold text-sm text-slate-900">{item.label}</div>
                    <div className="text-[11px] text-slate-400 font-medium">{item.desc}</div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0" />
              </Link>
            )
          })}
        </div>
      </div>
    )
  }

  // Company Management / Founder View
  const stats = await getFounderDashboardStats()

  const quickLinks = [
    { label: 'Project Sites & Costs', href: '/mobile/sites', color: 'border-l-blue-500' },
    { label: 'Pending Bill Approvals', href: '/mobile/approvals', color: 'border-l-amber-500' },
    { label: 'Labour Muster Roll', href: '/mobile/attendance', color: 'border-l-emerald-500' }
  ]

  return (
    <div className="p-4 space-y-4 pb-24 max-w-lg mx-auto bg-gray-50 min-h-screen select-none">
      <div className="pt-2">
        <h1 className="text-xl font-bold text-gray-900">Financial Overview</h1>
        <p className="text-xs text-gray-500">Quick summary of company site costs and liabilities</p>
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

      <h2 className="text-xs font-bold pt-2 uppercase tracking-wider text-gray-400 pl-1">Mobile Reports Hub</h2>
      <div className="space-y-2.5">
        {quickLinks.map(link => (
          <Link key={link.href} href={link.href} className={`block bg-white p-3.5 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center border-l-4 hover:bg-gray-50 transition-colors no-underline ${link.color}`}>
            <span className="font-semibold text-sm text-gray-800">{link.label}</span>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </Link>
        ))}
      </div>
    </div>
  )
}
