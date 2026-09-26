import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for `exportReportAction` claiming exports that never completed.
 *
 * The action wrote the `REPORT_EXPORTED_<format>` audit row before the file was rendered,
 * so a render failure still left an "exported" audit record, and the `ReportExport`
 * history row was written separately with its failure swallowed, so the audit could claim
 * an export the history never recorded.
 *
 * Now the file is rendered first; only then does `logReportExport` re-authorize the live
 * principal and write the audit and history rows in one transaction, and the file is
 * returned only after that commits. A render failure writes nothing; a failure to persist
 * either row rolls both back and hands out no file. Both failures are logged and reported
 * to the caller, never silently dropped.
 *
 * The transaction mock stages writes and commits them only when the callback resolves,
 * as the database would. `@/lib/permissions`, `@/lib/pages/tenant-page-access` and
 * `@/lib/reports/export-record` are real.
 */
const mocks = vi.hoisted(() => {
  const committed: Array<[string, unknown]> = []
  return {
    committed,
    order: [] as string[],
    requireUser: vi.fn(),
    generatePDFBuffer: vi.fn(),
    generateExcelBuffer: vi.fn(),
    getSiteCostReport: vi.fn(),
    getVendorPayableReport: vi.fn(),
    getClientReceivableReport: vi.fn(),
    auditLogCreate: vi.fn(),
    reportExportCreate: vi.fn(),
    prisma: {
      company: { findFirst: vi.fn(), findUnique: vi.fn() },
      companyMember: { findFirst: vi.fn() },
      site: { findFirst: vi.fn() },
      auditLog: { create: vi.fn() },
      reportExport: { create: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock('@/lib/reports/report-export', () => ({
  generatePDFBuffer: mocks.generatePDFBuffer,
  generateExcelBuffer: mocks.generateExcelBuffer,
}))
vi.mock('@/actions/reports', () => ({
  getSiteCostReport: mocks.getSiteCostReport,
  getVendorPayableReport: mocks.getVendorPayableReport,
  getClientReceivableReport: mocks.getClientReceivableReport,
  parseReportSiteId: async (filters: { siteId?: string } | undefined) => filters?.siteId || undefined,
}))

const { exportReportAction } = await import('@/actions/export-actions')

const SITES: Row[] = [{ id: 'site_1', companyId: 'company_1', deletedAt: null }]

const principal = { id: 'user_admin', name: 'Admin', email: 'admin@acme.test', role: 'COMPANY_ADMIN', companyId: 'company_1' }

// Failures must be reported, not dropped: the spy records them and keeps test output quiet.
const consoleError = vi.spyOn(console, 'error')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.committed.length = 0
  mocks.order.length = 0
  consoleError.mockImplementation(() => {})

  mocks.requireUser.mockResolvedValue(principal)
  mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: null })
  mocks.prisma.company.findUnique.mockResolvedValue({ name: 'Acme' })
  mocks.prisma.companyMember.findFirst.mockResolvedValue(null)
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)
  mocks.getSiteCostReport.mockResolvedValue([
    { name: 'Tower A', budget: 100, actualSpend: 40, pendingApproval: 5, budgetUsedPercent: 40, riskStatus: 'LOW' },
  ])
  mocks.getClientReceivableReport.mockResolvedValue([{ name: 'Client', contractValue: 10, amountPaid: 4, amountDue: 6 }])
  mocks.generatePDFBuffer.mockImplementation(async () => {
    mocks.order.push('render')
    return Buffer.from('pdf-bytes')
  })
  mocks.generateExcelBuffer.mockImplementation(async () => {
    mocks.order.push('render')
    return Buffer.from('xlsx-bytes')
  })
  mocks.auditLogCreate.mockResolvedValue({ id: 'audit_1' })
  mocks.reportExportCreate.mockResolvedValue({ id: 'export_1' })

  // Writes inside the callback are staged and commit only if it resolves.
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const staged: Array<[string, unknown]> = []
    const tx = {
      auditLog: {
        create: async (args: { data: unknown }) => {
          const row = await mocks.auditLogCreate(args)
          staged.push(['auditLog', args.data])
          return row
        },
      },
      reportExport: {
        create: async (args: { data: unknown }) => {
          const row = await mocks.reportExportCreate(args)
          staged.push(['reportExport', args.data])
          return row
        },
      },
    }
    const result = await fn(tx)
    mocks.committed.push(...staged)
    mocks.order.push('commit')
    return result
  })
})

function directWrites() {
  return mocks.prisma.auditLog.create.mock.calls.length + mocks.prisma.reportExport.create.mock.calls.length
}

describe('exportReportAction: completed export', () => {
  it('renders, then commits exactly one audit and one history row, then returns the file', async () => {
    const result = await exportReportAction('site-cost', 'PDF', { siteId: 'site_1' })

    expect(result).toEqual({ base64: Buffer.from('pdf-bytes').toString('base64') })
    expect(mocks.order).toEqual(['render', 'commit'])
    expect(mocks.committed).toEqual([
      ['auditLog', { userId: 'user_admin', companyId: 'company_1', action: 'REPORT_EXPORTED_PDF', module: 'REPORTS', after: { reportType: 'site-cost', filters: { siteId: 'site_1' } } }],
      ['reportExport', { companyId: 'company_1', generatedById: 'user_admin', reportType: 'site-cost', format: 'PDF', filtersJson: { siteId: 'site_1' } }],
    ])
    expect(directWrites()).toBe(0)
  })
})

describe('exportReportAction: render failure', () => {
  it.each([
    ['PDF', 'site-cost', mocks.generatePDFBuffer],
    ['EXCEL', 'client-receivable', mocks.generateExcelBuffer],
  ] as const)('a failed %s render leaves no export audit or history', async (format, reportType, render) => {
    const renderError = new Error('renderer crashed')
    render.mockRejectedValueOnce(renderError)

    const result = await exportReportAction(reportType, format, {})

    expect(result).toEqual({ error: 'Failed to generate file' })
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.auditLogCreate).not.toHaveBeenCalled()
    expect(mocks.reportExportCreate).not.toHaveBeenCalled()
    expect(mocks.committed).toEqual([])
    expect(directWrites()).toBe(0)
    expect(consoleError).toHaveBeenCalledWith('Export Error:', renderError)
  })
})

describe('exportReportAction: persistence failure', () => {
  it('a failed ReportExport write rolls back the audit row and hands out no file', async () => {
    const dbError = new Error('reportExport insert failed')
    mocks.reportExportCreate.mockRejectedValueOnce(dbError)

    const result = await exportReportAction('site-cost', 'PDF', { siteId: 'site_1' })

    expect(result).toEqual({ error: 'Failed to record export' })
    expect(result).not.toHaveProperty('base64')
    // The audit row was attempted inside the transaction but never committed.
    expect(mocks.auditLogCreate).toHaveBeenCalledTimes(1)
    expect(mocks.committed).toEqual([])
    expect(mocks.order).toEqual(['render'])
    expect(directWrites()).toBe(0)
    expect(consoleError).toHaveBeenCalledWith('Export record Error:', dbError)
  })

  it('a failed audit write records no history and hands out no file', async () => {
    const dbError = new Error('auditLog insert failed')
    mocks.auditLogCreate.mockRejectedValueOnce(dbError)

    const result = await exportReportAction('site-cost', 'EXCEL', {})

    expect(result).toEqual({ error: 'Failed to record export' })
    expect(mocks.reportExportCreate).not.toHaveBeenCalled()
    expect(mocks.committed).toEqual([])
    expect(directWrites()).toBe(0)
    expect(consoleError).toHaveBeenCalledWith('Export record Error:', dbError)
  })

  it('a principal revoked between render and record gets no record and no file', async () => {
    mocks.requireUser
      .mockResolvedValueOnce(principal)
      .mockRejectedValueOnce(new Error('UNAUTHORIZED: Active company membership required'))

    const result = await exportReportAction('site-cost', 'PDF', {})

    expect(result).toEqual({ error: 'Failed to record export' })
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.committed).toEqual([])
    expect(consoleError).toHaveBeenCalledWith('Export record Error:', expect.objectContaining({ message: expect.stringMatching(/UNAUTHORIZED/) }))
  })
})

describe('exportReportAction: authorization precedes any read or render', () => {
  it('a denied principal is refused before the report is read or rendered', async () => {
    mocks.requireUser.mockResolvedValue({ ...principal, role: 'CLIENT' })
    await expect(exportReportAction('site-cost', 'PDF', {})).rejects.toThrow(/FORBIDDEN/)
    expect(mocks.getSiteCostReport).not.toHaveBeenCalled()
    expect(mocks.generatePDFBuffer).not.toHaveBeenCalled()
    expect(mocks.committed).toEqual([])
  })
})
