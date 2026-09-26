/** Report types that can be exported, and the file formats an export may produce. */
export const EXPORT_REPORT_TYPES = ['site-cost', 'vendor-payable', 'client-receivable'] as const
export const EXPORT_FORMATS = ['PDF', 'EXCEL'] as const

export type ExportReportType = (typeof EXPORT_REPORT_TYPES)[number]
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export function isExportReportType(value: unknown): value is ExportReportType {
  return typeof value === 'string' && (EXPORT_REPORT_TYPES as readonly string[]).includes(value)
}

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === 'string' && (EXPORT_FORMATS as readonly string[]).includes(value)
}

/** Reports scoped by site; every other export type is a company-wide ledger. */
export function isSiteScopedReport(reportType: ExportReportType) {
  return reportType === 'site-cost'
}
