import { getDailyLabourReport } from '@/actions/reports'
import { requireUser } from '@/lib/auth/require-user'
import { prisma } from '@/lib/prisma'
import { formatINR } from '@/lib/reports/money'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, CalendarCheck } from 'lucide-react'
import ExportButtons from '../[reportType]/ExportButtons'

export const dynamic = 'force-dynamic'

export default async function DailyLabourReportPage({
  searchParams
}: {
  searchParams: Promise<{ date?: string; siteId?: string }>
}) {
  const user = await requireUser()
  if (!user.companyId) redirect('/login')
  const companyId = user.companyId

  const { date, siteId } = await searchParams

  const todayStr = new Date().toISOString().split('T')[0]
  const dateStr = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayStr

  const [report, activeSites] = await Promise.all([
    getDailyLabourReport({ date: dateStr, siteId }),
    prisma.site.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    })
  ])

  const filters = { date: dateStr, siteId: siteId || undefined }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link href="/reports" className="text-sm text-blue-600 hover:underline mb-2 inline-flex items-center gap-1.5 font-medium">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Daily Labour Report (DLR)</h1>
          <p className="text-sm text-gray-500">Direct labour attendance, contractor headcount, and site DPR context for a given day.</p>
        </div>
        <ExportButtons reportType="daily-labour" filters={filters} />
      </div>

      <form method="GET" className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
        <CalendarCheck className="w-4 h-4 text-[#fc6e20]" />
        <input
          type="date"
          name="date"
          defaultValue={dateStr}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700"
        />
        <select name="siteId" defaultValue={siteId || ''} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700">
          <option value="">All Sites</option>
          {activeSites.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button type="submit" className="px-4 py-1.5 text-sm font-medium bg-[#fc6e20] hover:bg-[#e85b0d] text-white rounded-lg shadow-sm transition-colors">
          Apply
        </button>
      </form>

      {report.sites.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500 text-sm shadow-sm">
          No sites found for this company.
        </div>
      ) : (
        report.sites.map(site => (
          <div key={site.siteId} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-gray-900">{site.siteName}</h2>
              <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                <span>Present: <strong className="text-gray-800">{site.summary.presentCount}</strong></span>
                <span>Half Day: <strong className="text-gray-800">{site.summary.halfDayCount}</strong></span>
                <span>Absent: <strong className="text-gray-800">{site.summary.absentCount}</strong></span>
                <span>Contractor Headcount: <strong className="text-gray-800">{site.summary.contractorHeadcount}</strong></span>
                <span>Overtime Hours: <strong className="text-gray-800">{site.summary.totalOvertimeHours}h</strong></span>
                <span>Direct Advance: <strong className="text-gray-800">{formatINR(site.summary.totalDirectAdvance)}</strong></span>
                <span>Wage Estimate: <strong className="text-gray-800">{formatINR(site.summary.totalWageEstimate)}</strong></span>
                <span>Contractor Advance: <strong className="text-gray-800">{formatINR(site.summary.totalContractorAdvance)}</strong></span>
              </div>
            </div>

            <div className="px-6 py-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Direct Labour</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/75">
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Trade</th>
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Daily Wage</th>
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Overtime</th>
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Advance</th>
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Wage Estimate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {site.directLabour.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center text-gray-500 py-6 text-sm">No direct labour attendance for this date.</td>
                      </tr>
                    ) : (
                      site.directLabour.map(worker => (
                        <tr key={worker.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap font-medium">{worker.name}</td>
                          <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{worker.trade}</td>
                          <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{worker.status}</td>
                          <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{formatINR(worker.dailyWage)}</td>
                          <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{worker.overtimeHours}h</td>
                          <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{formatINR(worker.advance)}</td>
                          <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap font-semibold">{formatINR(worker.wageEstimate)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Contractors</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/75">
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Subcontractor</th>
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Headcount</th>
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Start Time</th>
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Daily Advance</th>
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {site.contractors.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center text-gray-500 py-6 text-sm">No contractor attendance for this date.</td>
                      </tr>
                    ) : (
                      site.contractors.map(contractor => (
                        <tr key={contractor.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap font-medium">{contractor.subcontractorName}</td>
                          <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{contractor.headcount}</td>
                          <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{contractor.startTime || '-'}</td>
                          <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{formatINR(contractor.dailyAdvance)}</td>
                          <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{contractor.notes || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Daily Progress Report</h3>
              {site.dpr ? (
                <div className="text-sm text-gray-700 space-y-1">
                  <p><span className="font-medium">Work Done:</span> {site.dpr.workDone}</p>
                  {site.dpr.workPlanned && <p><span className="font-medium">Work Planned:</span> {site.dpr.workPlanned}</p>}
                  <p><span className="font-medium">Labour Count (DPR):</span> {site.dpr.labourCount}</p>
                  {site.dpr.weather && <p><span className="font-medium">Weather:</span> {site.dpr.weather}</p>}
                  {site.dpr.delayReason && <p><span className="font-medium text-red-700">Delay Reason:</span> {site.dpr.delayReason}</p>}
                  {site.dpr.qualityIssue && <p><span className="font-medium text-red-700">Quality Issue:</span> {site.dpr.qualityIssue}</p>}
                  {site.dpr.safetyIssue && <p><span className="font-medium text-red-700">Safety Issue:</span> {site.dpr.safetyIssue}</p>}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No DPR submitted for this date.</p>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
