'use server'

import { requireUser } from '@/lib/auth/require-user'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { hasPermission } from '@/lib/permissions'
import { getSiteCostReport, getVendorPayableReport, getClientReceivableReport, logReportExport } from '@/actions/reports'
import { generatePDFBuffer, generateExcelBuffer } from '@/lib/reports/report-export'
import { prisma } from '@/lib/prisma'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function exportReportAction(reportType: string, format: 'PDF' | 'EXCEL', filters: any) {
  const user = await requireUser()
  const company = await prisma.company.findUnique({ where: { id: user.companyId! } })

  let title = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any[] = []
  let headers: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[][] = []

  switch (reportType) {
    case 'site-cost':
      title = 'Site Cost Report'
      headers = ['Site Name', 'Budget', 'Actual Spend', 'Pending Approval', 'Budget Used (%)', 'Risk Level']
      data = await getSiteCostReport(filters)
      rows = data.map(d => [d.name, d.budget, d.actualSpend, d.pendingApproval, d.budgetUsedPercent.toFixed(2), d.riskStatus])
      break
    case 'vendor-payable':
      title = 'Vendor Payable Report'
      headers = ['Vendor Name', 'Total Purchase', 'Amount Payable']
      data = await getVendorPayableReport(filters)
      rows = data.map(d => [d.name, d.totalPurchase, d.amountPayable])
      break
    case 'client-receivable':
      title = 'Client Receivable Report'
      headers = ['Client Name', 'Contract Value', 'Amount Paid', 'Amount Due']
      data = await getClientReceivableReport(filters)
      rows = data.map(d => [d.name, d.contractValue, d.amountPaid, d.amountDue])
      break
    default:
      return { error: 'Unknown report type' }
  }

  // Log the export
  await logReportExport(reportType, format, filters)

  try {
    let buffer: Buffer
    if (format === 'PDF') {
      buffer = await generatePDFBuffer(title, company?.name || 'Civil Tracker', filters, headers, rows)
    } else {
      buffer = await generateExcelBuffer(title, company?.name || 'Civil Tracker', filters, headers, rows)
    }
    return { base64: buffer.toString('base64') }
  } catch (error) {
    console.error("Export Error:", error)
    return { error: 'Failed to generate file' }
  }
}
