import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for `logReportExport` being a directly callable audit-forging endpoint.
 *
 * It is exported from a `'use server'` module, so any signed-in user holding
 * `reports.export` (or a SUPER_ADMIN, with no company) could call it directly and write
 * an audit row and a `ReportExport` row with any report type, any format string spliced
 * into the audit action, and any JSON — a foreign company id, a fake `_description`, a
 * nested payload — as the logged filters. The REPORTS module was never checked.
 *
 * Now the report type and format are checked against allowlists before anything else;
 * the live principal needs `reports.export` with REPORTS on (SUPER_ADMIN and CLIENT are
 * refused); a field role is refused the company-wide ledgers; the filters may carry
 * nothing but an optional string `siteId`, only for the site cost report, and that site
 * must be a live site of the live company inside the principal's assigned-site scope.
 * Only the sanitized filters are logged.
 *
 * `@/lib/permissions`, `@/lib/pages/tenant-page-access` and `@/lib/auth/site-mutation`
 * are real.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  prisma: {
    company: { findFirst: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    reportExport: { create: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }))

const { logReportExport } = await import('@/actions/reports')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', deletedAt: null },
  { id: 'site_dead', companyId: 'company_1', deletedAt: new Date('2026-01-01') },
  { id: 'site_other', companyId: 'company_2', deletedAt: null },
]

function principal(role: string, id = `user_${role.toLowerCase()}`) {
  return { id, name: role, email: `${id}@acme.test`, role, companyId: 'company_1' }
}

function writes() {
  return mocks.prisma.auditLog.create.mock.calls.length + mocks.prisma.reportExport.create.mock.calls.length
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: null })
  mocks.prisma.companyMember.findFirst.mockResolvedValue(null)
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)
  mocks.prisma.auditLog.create.mockResolvedValue({})
  mocks.prisma.reportExport.create.mockResolvedValue({})
})

describe('logReportExport: allowlists', () => {
  it.each(['everything', 'founder', '', 'site-cost ', 42])('refuses report type %j before any read', async (reportType) => {
    await expect(logReportExport(reportType as string, 'PDF', {})).rejects.toThrow(/report type/i)
    expect(mocks.requireUser).not.toHaveBeenCalled()
    expect(writes()).toBe(0)
  })

  it.each(['CSV', 'pdf', 'PDF_DELETED_EVERYTHING', '', null])('refuses format %j before any read', async (format) => {
    await expect(logReportExport('site-cost', format as string, {})).rejects.toThrow(/format/i)
    expect(mocks.requireUser).not.toHaveBeenCalled()
    expect(writes()).toBe(0)
  })
})

describe('logReportExport: live gate', () => {
  it('refuses a revoked principal', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))
    await expect(logReportExport('site-cost', 'PDF', {})).rejects.toThrow(/UNAUTHORIZED/)
    expect(writes()).toBe(0)
  })

  it('refuses a SUPER_ADMIN, which has no company to log into', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root', name: 'Root', email: 'root@platform.test', role: 'SUPER_ADMIN' })
    await expect(logReportExport('site-cost', 'PDF', {})).rejects.toThrow(/FORBIDDEN/)
    expect(writes()).toBe(0)
  })

  it.each(['SITE_ENGINEER', 'SUPERVISOR', 'PURCHASE_MANAGER', 'CLIENT', 'VENDOR'])('refuses live %s without reports.export', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(logReportExport('site-cost', 'PDF', {})).rejects.toThrow(/FORBIDDEN/)
    expect(writes()).toBe(0)
  })

  it('refuses when the REPORTS module is off', async () => {
    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: ['sites'] })
    await expect(logReportExport('site-cost', 'PDF', {})).rejects.toThrow(/FORBIDDEN/)
    expect(writes()).toBe(0)
  })
})

describe('logReportExport: filters', () => {
  it.each([
    ['a foreign company id', { companyId: 'company_2' }],
    ['a forged audit description', { siteId: 'site_1', _description: 'CEO approved' }],
    ['a nested payload', { siteId: 'site_1', extra: { deep: true } }],
    ['an operator object as site id', { siteId: { not: 'x' } }],
    ['an array site id', { siteId: ['site_1'] }],
    ['a string instead of an object', 'siteId=site_1'],
    ['an array instead of an object', [{ siteId: 'site_1' }]],
  ])('refuses %s without writing', async (_label, filters) => {
    await expect(logReportExport('site-cost', 'PDF', filters)).rejects.toThrow(/FORBIDDEN|filter/i)
    expect(writes()).toBe(0)
  })

  it.each(['site_other', 'site_dead', 'missing'])('refuses site filter %s outside the live company', async (siteId) => {
    await expect(logReportExport('site-cost', 'PDF', { siteId })).rejects.toThrow(/Site not found or access denied/)
    expect(writes()).toBe(0)
  })

  it('refuses a site filter on a company-wide ledger report', async () => {
    await expect(logReportExport('vendor-payable', 'EXCEL', { siteId: 'site_1' })).rejects.toThrow(/filter/i)
    expect(writes()).toBe(0)
  })

  it('logs only the sanitized site filter as the live principal and company', async () => {
    await logReportExport('site-cost', 'PDF', { siteId: 'site_1' })
    expect(mocks.prisma.site.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'site_1', companyId: 'company_1', deletedAt: null })
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_company_admin',
        companyId: 'company_1',
        action: 'REPORT_EXPORTED_PDF',
        module: 'REPORTS',
        after: { reportType: 'site-cost', filters: { siteId: 'site_1' } },
      },
    })
    expect(mocks.prisma.reportExport.create).toHaveBeenCalledWith({
      data: { companyId: 'company_1', generatedById: 'user_company_admin', reportType: 'site-cost', format: 'PDF', filtersJson: { siteId: 'site_1' } },
    })
  })

  it('logs a ledger export for an ACCOUNTANT with empty filters', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))
    await logReportExport('client-receivable', 'EXCEL', {})
    expect(mocks.prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ companyId: 'company_1', action: 'REPORT_EXPORTED_EXCEL', after: { reportType: 'client-receivable', filters: {} } })
  })
})
