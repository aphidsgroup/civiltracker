import { getSiteCostReport, getVendorPayableReport, getClientReceivableReport } from '@/actions/reports'
import { requireUser } from '@/lib/auth/require-user'
import { formatINR } from '@/lib/reports/money'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ExportButtons from './ExportButtons'

export default async function ReportDetailPage({ params }: { params: Promise<{ reportType: string }> }) {
  await requireUser()
  const { reportType } = await params

  let title = ''
  let description = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any[] = []
  let columns: { key: string; label: string; isMoney?: boolean }[] = []

  // Dynamic Routing mapping
  switch (reportType) {
    case 'site-cost':
      title = 'Site Cost Report'
      description = 'Aggregated cost breakdown across all active sites.'
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
          <Link href="/reports" className="text-sm text-p hover:underline mb-2 inline-block">← Back to Dashboard</Link>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-mut">{description}</p>
        </div>
        <ExportButtons reportType={reportType} filters={{}} />
      </div>

      <div className="bg-white rounded-xl border border-line overflow-x-auto shadow-sm">
        <table className="ct-table">
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center text-mut p-12">No data found for this report.</td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr key={i}>
                  {columns.map(col => (
                    <td key={col.key}>
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
