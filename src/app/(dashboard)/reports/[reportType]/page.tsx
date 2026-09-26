import { getSiteCostReport, getVendorPayableReport, getClientReceivableReport } from '@/actions/reports'
import { exitDeniedPage, readsAssignedSitesOnly, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'
import type { Permission } from '@/lib/permissions'
import { formatINR } from '@/lib/reports/money'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import ExportButtons from './ExportButtons'
import { ArrowLeft } from 'lucide-react'

/** The permission each report opens under; site cost is a finance report. */
const REPORT_PERMISSIONS: ReadonlyMap<string, Permission> = new Map<string, Permission>([
  ['site-cost', 'reports.finance'],
  ['vendor-payable', 'reports.vendorPayable'],
  ['client-receivable', 'reports.clientReceivable'],
])

export default async function ReportDetailPage({ params }: { params: Promise<{ reportType: string }> }) {
  const { reportType } = await params
  const permission = REPORT_PERMISSIONS.get(reportType)
  if (!permission) notFound()

  // Live page guard before any report data is read.
  const gate = await resolveTenantPageAccess({ grants: [{ permission, module: 'REPORTS' }] })
  if (gate.status === 'denied') exitDeniedPage(gate, `/reports/${reportType}`)
  const { user, can } = gate.access
  if (user.role === 'CLIENT' || !can('reports.view')) exitDeniedPage({ status: 'denied', redirectTo: '/dashboard' }, `/reports/${reportType}`)
  // The vendor and client ledgers are company-wide with no site to scope by.
  const fieldRole = readsAssignedSitesOnly(user.role)
  if (fieldRole && reportType !== 'site-cost') redirect('/reports')
  const showExport = can('reports.export') && !fieldRole

  let title = ''
  let description = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any[] = []
  let columns: { key: string; label: string; isMoney?: boolean }[] = []

  // Dynamic Routing mapping
  switch (reportType) {
    case 'site-cost':
      title = 'Site Cost Report'
      description = fieldRole
        ? 'Aggregated cost breakdown across your assigned sites.'
        : 'Aggregated cost breakdown across all active sites.'
      columns = [
        { key: 'name', label: 'Site Name' },
        { key: 'budget', label: 'Budget', isMoney: true },
        { key: 'actualSpend', label: 'Actual Spend', isMoney: true },
        { key: 'pendingApproval', label: 'Pending Approval', isMoney: true },
        { key: 'budgetUsedPercent', label: 'Budget Used (%)' },
        { key: 'riskStatus', label: 'Risk Level' }
      ]
      data = await getSiteCostReport({})
      break
    case 'vendor-payable':
      title = 'Vendor Payable Report'
      description = 'Outstanding payments to vendors based on purchase orders and bills.'
      columns = [
        { key: 'name', label: 'Vendor Name' },
        { key: 'totalPurchase', label: 'Total Purchase', isMoney: true },
        { key: 'amountPayable', label: 'Amount Payable', isMoney: true }
      ]
      data = await getVendorPayableReport({})
      break
    case 'client-receivable':
      title = 'Client Receivable Report'
      description = 'Outstanding payments expected from clients based on contract values and invoices.'
      columns = [
        { key: 'name', label: 'Client Name' },
        { key: 'contractValue', label: 'Contract Value', isMoney: true },
        { key: 'amountPaid', label: 'Amount Paid', isMoney: true },
        { key: 'amountDue', label: 'Amount Due', isMoney: true }
      ]
      data = await getClientReceivableReport({})
      break
    default:
      // Additional reports can be mapped here as needed by Phase 8 requirements
      return notFound()
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link href="/reports" className="text-sm text-blue-600 hover:underline mb-2 inline-flex items-center gap-1.5 font-medium">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
        {showExport && <ExportButtons reportType={reportType} filters={{}} />}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/75">
              {columns.map(col => (
                <th key={col.key} className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center text-gray-500 py-12 text-sm">No data found for this report.</td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                  {columns.map(col => (
                    <td key={col.key} className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap font-medium">
                      {col.isMoney
                        ? formatINR(row[col.key])
                        : typeof row[col.key] === 'number' && col.key.includes('Percent')
                        ? row[col.key].toFixed(2) + '%'
                        : row[col.key] || '-'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
