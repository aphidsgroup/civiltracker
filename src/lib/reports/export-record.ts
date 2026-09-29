import { prisma } from '@/lib/prisma'
import { isExportFormat, isExportReportType, isSiteScopedReport } from '@/lib/reports/report-types'
import type { ExportFormat, ExportReportType } from '@/lib/reports/report-types'
import { assignedSiteWhere, readsAssignedSitesOnly, resolveTenantPageAccess } from '@/lib/pages/tenant-page-access'

/*
 * Report export bookkeeping. An export is recorded — its `REPORT_EXPORTED_<format>`
 * audit row and its `ReportExport` history row — only once the file has been rendered,
 * and both rows are written in one transaction. A render failure therefore leaves no
 * record, and a failure to persist either row leaves neither and must stop the file from
 * being handed out.
 *
 * Deliberately not a `'use server'` module: recording is reachable only through the
 * export action that actually produced the file, never as a callable endpoint that could
 * claim an export which never happened.
 */

export type AuthorizedReportExport = {
  userId: string
  companyId: string
  reportType: ExportReportType
  format: ExportFormat
  filters: { siteId?: string }
}

/**
 * Filters an export may log: a plain object carrying nothing but an optional non-empty
 * string `siteId`, and that only for a site-scoped report. A company id, a description,
 * a nested payload, an operator object or any unknown key is refused, never logged.
 */
function parseExportFilters(reportType: ExportReportType, filters: unknown): { siteId?: string } {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) throw new Error('FORBIDDEN: Invalid report filter')
  const proto = Object.getPrototypeOf(filters)
  if (proto !== Object.prototype && proto !== null) throw new Error('FORBIDDEN: Invalid report filter')

  const keys = Object.keys(filters)
  if (keys.some((key) => key !== 'siteId')) throw new Error('FORBIDDEN: Invalid report filter')
  if (keys.length === 0) return {}

  const siteId = (filters as { siteId?: unknown }).siteId
  if (typeof siteId !== 'string' || siteId === '') throw new Error('FORBIDDEN: Invalid site filter')
  if (!isSiteScopedReport(reportType)) throw new Error('FORBIDDEN: This report takes no site filter')
  return { siteId }
}

/**
 * Authorizes a report export before anything is read or rendered. The report type and
 * format are checked against their allowlists and the filters sanitized first. The live
 * principal then needs `reports.export` with the REPORTS module on; SUPER_ADMIN (no
 * company) and CLIENT are refused, and a field role is refused the company-wide ledgers.
 * A site filter must name a live site of the live company inside the principal's
 * assigned-site scope. Writes nothing.
 */
export async function authorizeReportExport(reportType: unknown, format: unknown, filters: unknown): Promise<AuthorizedReportExport> {
  if (!isExportReportType(reportType)) throw new Error('FORBIDDEN: Unknown report type')
  if (!isExportFormat(format)) throw new Error('FORBIDDEN: Unknown export format')
  const safeFilters = parseExportFilters(reportType, filters)

  const gate = await resolveTenantPageAccess({ grants: [{ permission: 'reports.export', module: 'REPORTS' }] })
  if (gate.status === 'denied') throw new Error('FORBIDDEN: Report export is not available')
  const access = gate.access
  const { user, companyId } = access
  if (user.role === 'CLIENT') throw new Error('FORBIDDEN: Report export is not available')
  if (!isSiteScopedReport(reportType) && readsAssignedSitesOnly(user.role)) {
    throw new Error('FORBIDDEN: Company-wide reports are not available to field roles')
  }

  if (safeFilters.siteId) {
    const site = await prisma.site.findFirst({
      where: { ...(await assignedSiteWhere(access)), id: safeFilters.siteId },
      select: { id: true },
    })
    if (!site) throw new Error('FORBIDDEN: Site not found or access denied')
  }

  return { userId: user.id, companyId, reportType, format, filters: safeFilters }
}

/**
 * Records a completed export: the audit row and the history row together, or neither.
 * Any failure throws.
 */
async function recordReportExport({ userId, companyId, reportType, format, filters }: AuthorizedReportExport) {
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        userId,
        companyId,
        action: `REPORT_EXPORTED_${format}`,
        module: 'REPORTS',
        after: { reportType, filters },
      },
    })
    await tx.reportExport.create({
      data: {
        companyId,
        generatedById: userId,
        reportType,
        format,
        filtersJson: filters,
      },
    })
  })
}

/**
 * The completed-export persistence step. It claims the export happened, so it is called
 * only once the file has been rendered, never before or instead of rendering. The export
 * is authorized again on the live principal (`authorizeReportExport`: allowlists,
 * sanitized filters, `reports.export` with REPORTS on, field-role and assigned-site
 * scope), then its audit and history rows are written in one transaction. Any refusal or
 * write failure throws and leaves neither row.
 */
export async function logReportExport(reportType: unknown, format: unknown, filters: unknown): Promise<void> {
  await recordReportExport(await authorizeReportExport(reportType, format, filters))
}
