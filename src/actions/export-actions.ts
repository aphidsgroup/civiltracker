'use server'

import { getSiteCostReport, getVendorPayableReport, getClientReceivableReport, parseReportSiteId } from '@/actions/reports'
import { generatePDFBuffer, generateExcelBuffer } from '@/lib/reports/report-export'
import { authorizeReportExport, logReportExport } from '@/lib/reports/export-record'
import { prisma } from '@/lib/prisma'

const REPORT_TYPES = new Set(['site-cost', 'vendor-payable', 'client-receivable'])

/**
 * Exports a report. The report type is checked before anything is read; the export is
 * then authorized on the live principal (`reports.export` with the REPORTS module on, no
 * company-wide ledger for a field role, a site filter only inside the assigned-site
 * scope) and each report still runs its own grant. Only a validated site id is forwarded
 * from the caller's filters — never a company id or any other key.
 *
 * The export is recorded (`logReportExport`: live re-authorization, then audit + history
 * in one transaction) only after the file has been rendered, and the file is returned only
 * after that record commits: a render failure writes nothing, and a record failure hands
 * out no file.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function exportReportAction(reportType: string, format: 'PDF' | 'EXCEL', filters: any) {
  if (!REPORT_TYPES.has(reportType)) return { error: 'Unknown report type' }

  const siteId = await parseReportSiteId(filters)
  const safeFilters = siteId ? { siteId } : {}
  const authorized = await authorizeReportExport(reportType, format, safeFilters)

  let title = ''
  let headers: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[][] = []

  switch (reportType) {
    case 'site-cost': {
      title = 'Site Cost Report'
      headers = ['Site Name', 'Budget', 'Actual Spend', 'Pending Approval', 'Budget Used (%)', 'Risk Level']
      const data = await getSiteCostReport(safeFilters)
      rows = data.map(d => [d.name, d.budget, d.actualSpend, d.pendingApproval, d.budgetUsedPercent.toFixed(2), d.riskStatus])
      break
    }
    case 'vendor-payable': {
      title = 'Vendor Payable Report'
      headers = ['Vendor Name', 'Total Purchase', 'Amount Payable']
      const data = await getVendorPayableReport({})
      rows = data.map(d => [d.name, d.totalPurchase, d.amountPayable])
      break
    }
    case 'client-receivable': {
      title = 'Client Receivable Report'
      headers = ['Client Name', 'Contract Value', 'Amount Paid', 'Amount Due']
      const data = await getClientReceivableReport({})
      rows = data.map(d => [d.name, d.contractValue, d.amountPaid, d.amountDue])
      break
    }
  }

  const company = await prisma.company.findUnique({ where: { id: authorized.companyId }, select: { name: true } })

  let buffer: Buffer
  try {
    buffer = authorized.format === 'PDF'
      ? await generatePDFBuffer(title, company?.name || 'Civil Tracker', safeFilters, headers, rows)
      : await generateExcelBuffer(title, company?.name || 'Civil Tracker', safeFilters, headers, rows)
  } catch (error) {
    console.error('Export Error:', error)
    return { error: 'Failed to generate file' }
  }

  try {
    await logReportExport(authorized.reportType, authorized.format, authorized.filters)
  } catch (error) {
    console.error('Export record Error:', error)
    return { error: 'Failed to record export' }
  }

  return { base64: buffer.toString('base64') }
}
