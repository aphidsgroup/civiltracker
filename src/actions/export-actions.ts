'use server'

import { getSiteCostReport, getVendorPayableReport, getClientReceivableReport, logReportExport, parseReportSiteId } from '@/actions/reports'
import { generatePDFBuffer, generateExcelBuffer } from '@/lib/reports/report-export'
import { readsAssignedSitesOnly, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'
import { prisma } from '@/lib/prisma'

const REPORT_TYPES = new Set(['site-cost', 'vendor-payable', 'client-receivable'])

/**
 * Exports a report. The report type is checked before anything is read; the live
 * principal then needs `reports.export` with the REPORTS module on, and each report
 * still runs its own grant. Field roles are refused the company-wide ledgers. Only a
 * validated site id is forwarded from the caller's filters — never a company id or any
 * other key.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function exportReportAction(reportType: string, format: 'PDF' | 'EXCEL', filters: any) {
  if (!REPORT_TYPES.has(reportType)) return { error: 'Unknown report type' }

  const gate = await resolveTenantPageAccess({ grants: [{ permission: 'reports.export', module: 'REPORTS' }] })
  if (gate.status === 'denied') throw new Error('FORBIDDEN: Report export is not available')
  const { user, companyId } = gate.access
  if (user.role === 'CLIENT') throw new Error('FORBIDDEN: Report export is not available')
  if (reportType !== 'site-cost' && readsAssignedSitesOnly(user.role)) {
    throw new Error('FORBIDDEN: Company-wide reports are not available to field roles')
  }

  const siteId = await parseReportSiteId(filters)
  const safeFilters = siteId ? { siteId } : {}

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

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } })

  // Log the export
  await logReportExport(reportType, format, safeFilters)

  try {
    let buffer: Buffer
    if (format === 'PDF') {
      buffer = await generatePDFBuffer(title, company?.name || 'Civil Tracker', safeFilters, headers, rows)
    } else {
      buffer = await generateExcelBuffer(title, company?.name || 'Civil Tracker', safeFilters, headers, rows)
    }
    return { base64: buffer.toString('base64') }
  } catch (error) {
    console.error("Export Error:", error)
    return { error: 'Failed to generate file' }
  }
}
