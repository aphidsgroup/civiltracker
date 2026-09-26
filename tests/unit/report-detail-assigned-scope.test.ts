import { Prisma } from '@prisma/client'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for the detailed reports reading every site, vendor and client of the
 * company for a field role, and for the SUPER_ADMIN.
 *
 * `/reports/[reportType]` checked only that someone was signed in. `getSiteCostReport`
 * opened on `reports.view` alone and summed budget, spend and salary rows of every live
 * site of the company; the vendor payable and client receivable ledgers — company-wide,
 * with no site to scope by — opened to every SITE_ENGINEER and SUPERVISOR through their
 * report permissions. None checked the REPORTS module, and a SUPER_ADMIN queried with an
 * undefined company. `exportReportAction` read the company before any permission check
 * and passed the client's filters straight through.
 *
 * Now each report resolves its own grant — permission plus the REPORTS module — on the
 * live principal. The site cost report is a finance report (`reports.finance`), is
 * narrowed to the principal's `assignedSiteWhere` at the query, and carries salary only
 * under `salary.view` with LABOUR on; the site-less ledgers fail closed for field roles.
 * Export requires `reports.export` before any read and forwards only a validated site id.
 *
 * `@/lib/permissions`, `@/lib/pages/tenant-page-access` and `@/lib/auth/site-mutation`
 * are real.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireUser: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  exportButtons: vi.fn(() => null),
  sumValidOpenApprovalAmountsBySite: vi.fn(),
  generatePDFBuffer: vi.fn(),
  generateExcelBuffer: vi.fn(),
  prisma: {
    company: { findFirst: vi.fn(), findUnique: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findMany: vi.fn() },
    vendor: { findMany: vi.fn() },
    client: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    reportExport: { create: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('next/link', () => ({ default: () => null }))
vi.mock('@/lib/approvals/valid-reads', () => ({ sumValidOpenApprovalAmountsBySite: mocks.sumValidOpenApprovalAmountsBySite }))
vi.mock('@/lib/reports/report-export', () => ({ generatePDFBuffer: mocks.generatePDFBuffer, generateExcelBuffer: mocks.generateExcelBuffer }))
vi.mock('@/app/(dashboard)/reports/[reportType]/ExportButtons', () => ({ default: mocks.exportButtons }))

const { getSiteCostReport, getVendorPayableReport, getClientReceivableReport } = await import('@/actions/reports')
const { exportReportAction } = await import('@/actions/export-actions')
const { default: ReportDetailPage } = await import('@/app/(dashboard)/reports/[reportType]/page')

const ENGINEER_ID = 'user_site_engineer'
const SUPERVISOR_ID = 'user_supervisor'

function site(id: string, companyId: string, extra: Row = {}): Row {
  return {
    id, companyId, name: `Name ${id}`, status: 'ACTIVE', deletedAt: null, progress: 50,
    budget: new Prisma.Decimal(1000),
    expenses: [{ approvalStatus: 'APPROVED', amount: new Prisma.Decimal(100) }],
    labour: [{ salaryItems: [{ status: 'PAID', netPayable: new Prisma.Decimal(50) }] }],
    ...extra,
  }
}

const SITES: Row[] = [
  site('site_1', 'company_1'),
  site('site_assigned', 'company_1', { assignedEngineerId: ENGINEER_ID }),
  site('site_engineer', 'company_1', { engineerId: SUPERVISOR_ID }),
  site('site_member', 'company_1'),
  site('site_dead', 'company_1', { deletedAt: new Date('2026-01-01'), assignedEngineerId: ENGINEER_ID }),
  site('site_other', 'company_2', { assignedEngineerId: ENGINEER_ID }),
]

const MEMBERS: Row[] = [
  { userId: ENGINEER_ID, companyId: 'company_1', isActive: true, siteIds: ['site_member', 'site_other', 'site_dead'] },
  { userId: SUPERVISOR_ID, companyId: 'company_1', isActive: false, siteIds: ['site_1'] },
]

function principal(role: string, id = `user_${role.toLowerCase()}`) {
  return { id, name: `${role} Person`, email: `${id}@acme.test`, role, companyId: 'company_1' }
}

const SUPER_ADMIN = { id: 'root', name: 'Root', email: 'root@platform.test', role: 'SUPER_ADMIN' }

const P = <T,>(value: T) => Promise.resolve(value)

type Delegate = Record<string, ReturnType<typeof vi.fn>>

function calledReads() {
  return Object.entries(mocks.prisma as Record<string, Delegate>)
    .flatMap(([model, delegate]) => Object.entries(delegate).map(([op, fn]) => ({ name: `${model}.${op}`, fn })))
    .filter(({ name, fn }) => name !== 'company.findFirst' && fn.mock.calls.length > 0)
    .map(({ name }) => name)
}

function wheres(fn: ReturnType<typeof vi.fn>) {
  return fn.mock.calls.map((call) => (call[0] as { where?: Row } | undefined)?.where)
}

beforeEach(() => {
  vi.clearAllMocks()
  // The JWT claims an admin of another tenant; only the live principal may decide.
  mocks.auth.mockResolvedValue({ user: { id: 'jwt_user', companyId: 'company_jwt', role: 'COMPANY_ADMIN' } })
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: null })
  mocks.prisma.company.findUnique.mockResolvedValue({ name: 'Acme' })
  mocks.prisma.site.findMany.mockImplementation(inMemoryDelegate(SITES).findMany)
  mocks.prisma.companyMember.findFirst.mockImplementation(inMemoryDelegate(MEMBERS).findFirst)
  mocks.prisma.vendor.findMany.mockResolvedValue([{ id: 'v1', name: 'Vendor', totalPurchase: new Prisma.Decimal(10), amountPayable: new Prisma.Decimal(5) }])
  mocks.prisma.client.findMany.mockResolvedValue([{ id: 'c1', name: 'Client', contractValue: new Prisma.Decimal(10), amountPaid: new Prisma.Decimal(4), amountDue: new Prisma.Decimal(6) }])
  mocks.prisma.auditLog.create.mockResolvedValue({})
  mocks.prisma.reportExport.create.mockResolvedValue({})
  mocks.sumValidOpenApprovalAmountsBySite.mockResolvedValue(new Map())
  mocks.generatePDFBuffer.mockResolvedValue(Buffer.from('pdf'))
  mocks.generateExcelBuffer.mockResolvedValue(Buffer.from('xlsx'))
})

describe('getSiteCostReport', () => {
  it('reports to a SITE_ENGINEER only its assignedEngineer and active-membership live sites, filtered at the query', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    const rows = await getSiteCostReport({})

    expect(rows.map((row) => row.id).sort()).toEqual(['site_assigned', 'site_member'])
    expect(wheres(mocks.prisma.companyMember.findFirst)).toEqual([{ userId: ENGINEER_ID, companyId: 'company_1', isActive: true }])
    expect(wheres(mocks.prisma.site.findMany)[0]).toMatchObject({ companyId: 'company_1', deletedAt: null })
  })

  it('reports to a SUPERVISOR only the site it is the engineer of, never one from a deactivated membership', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))

    const rows = await getSiteCostReport({})

    expect(rows.map((row) => row.id)).toEqual(['site_engineer'])
  })

  it.each(['site_1', 'site_dead', 'site_other'])('returns nothing for a field role filtering to the unassigned, deleted or foreign site %s', async (siteId) => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    expect(await getSiteCostReport({ siteId })).toEqual([])
  })

  it('does not widen a field role with no assignment to the company', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER', 'user_unassigned'))

    expect(await getSiteCostReport({})).toEqual([])
  })

  it('reads and sums no salary rows for a role without salary.view', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    const rows = await getSiteCostReport({ siteId: 'site_assigned' })

    expect(mocks.prisma.site.findMany.mock.calls[0][0].include).not.toHaveProperty('labour')
    expect(rows[0].actualSpend).toBe(100)
  })

  it('reports every live company site, salary included, to an admin, with no assignment lookup', async () => {
    const rows = await getSiteCostReport({})

    expect(rows.map((row) => row.id).sort()).toEqual(['site_1', 'site_assigned', 'site_engineer', 'site_member'])
    expect(rows[0].actualSpend).toBe(150)
    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
  })

  it('narrows an admin to one live company site by a string site filter only', async () => {
    expect((await getSiteCostReport({ siteId: 'site_1' })).map((row) => row.id)).toEqual(['site_1'])
    expect(await getSiteCostReport({ siteId: 'site_other' })).toEqual([])
    await expect(getSiteCostReport({ siteId: { not: 'x' } })).rejects.toThrow()
  })

  it.each([
    ['a SUPER_ADMIN, which has no company', SUPER_ADMIN],
    ['a reports.view holder without reports.finance', principal('PURCHASE_MANAGER')],
    ['a CLIENT', principal('CLIENT')],
  ])('refuses %s before any read', async (_label, user) => {
    mocks.requireUser.mockResolvedValue(user)

    await expect(getSiteCostReport({})).rejects.toThrow(/FORBIDDEN/)
    expect(calledReads()).toEqual([])
  })

  it('refuses when the REPORTS module is off', async () => {
    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: ['sites'] })

    await expect(getSiteCostReport({})).rejects.toThrow(/FORBIDDEN/)
    expect(calledReads()).toEqual([])
  })
})

describe.each([
  { name: 'getVendorPayableReport', run: () => getVendorPayableReport({}), read: () => mocks.prisma.vendor.findMany, lacking: 'CLIENT' },
  { name: 'getClientReceivableReport', run: () => getClientReceivableReport({}), read: () => mocks.prisma.client.findMany, lacking: 'PURCHASE_MANAGER' },
])('$name, a company-wide ledger with no site scope', ({ run, read, lacking }) => {
  it.each(['SITE_ENGINEER', 'SUPERVISOR'])('fails closed for a %s, which holds the report permission, before any read', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    await expect(run()).rejects.toThrow(/FORBIDDEN/)
    expect(calledReads()).toEqual([])
  })

  it('reads the ledger for an ACCOUNTANT under the live company only', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))

    const rows = await run()

    expect(rows).toHaveLength(1)
    expect(wheres(read())).toEqual([{ companyId: 'company_1' }])
  })

  it('refuses a SUPER_ADMIN, a role without the report permission, and a disabled REPORTS module', async () => {
    mocks.requireUser.mockResolvedValueOnce(SUPER_ADMIN)
    await expect(run()).rejects.toThrow(/FORBIDDEN/)

    mocks.requireUser.mockResolvedValueOnce(principal(lacking))
    await expect(run()).rejects.toThrow(/FORBIDDEN/)

    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: ['sites'] })
    await expect(run()).rejects.toThrow(/FORBIDDEN/)
    expect(read()).not.toHaveBeenCalled()
  })
})

describe('exportReportAction', () => {
  it.each(['SITE_ENGINEER', 'SUPERVISOR'])('refuses a %s, which lacks reports.export, before reading the company or any report', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    await expect(exportReportAction('site-cost', 'PDF', {})).rejects.toThrow(/FORBIDDEN/)
    expect(calledReads()).toEqual([])
    expect(mocks.generatePDFBuffer).not.toHaveBeenCalled()
  })

  it('refuses a SUPER_ADMIN before reading any company', async () => {
    mocks.requireUser.mockResolvedValue(SUPER_ADMIN)

    await expect(exportReportAction('vendor-payable', 'EXCEL', {})).rejects.toThrow(/FORBIDDEN/)
    expect(calledReads()).toEqual([])
  })

  it('refuses when the REPORTS module is off', async () => {
    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: ['sites'] })

    await expect(exportReportAction('site-cost', 'PDF', {})).rejects.toThrow(/FORBIDDEN/)
    expect(calledReads()).toEqual([])
  })

  it('answers an unknown report type without reading anything', async () => {
    expect(await exportReportAction('everything', 'PDF', {})).toEqual({ error: 'Unknown report type' })
    expect(calledReads()).toEqual([])
  })

  it('exports the site cost rows filtered at the query, and forwards only the validated site id', async () => {
    const result = await exportReportAction('site-cost', 'PDF', { siteId: 'site_1', companyId: 'company_2' })

    expect(result).toHaveProperty('base64')
    expect(mocks.prisma.company.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'company_1' } }))
    const [, , filters, , rows] = mocks.generatePDFBuffer.mock.calls[0]
    expect(filters).toEqual({ siteId: 'site_1' })
    expect(rows.map((row: unknown[]) => row[0])).toEqual(['Name site_1'])
  })

  it('exports a foreign site filter as an empty report', async () => {
    await exportReportAction('site-cost', 'EXCEL', { siteId: 'site_other' })

    const [, , , , rows] = mocks.generateExcelBuffer.mock.calls[0]
    expect(rows).toEqual([])
  })
})

describe('ReportDetailPage', () => {
  async function render(reportType: string) {
    return renderToStaticMarkup((await ReportDetailPage({ params: P({ reportType }) })) as ReactElement)
  }

  it('refuses a revoked principal and never consults the JWT', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    await expect(render('site-cost')).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.auth).not.toHaveBeenCalled()
    expect(calledReads()).toEqual([])
  })

  it('sends a SUPER_ADMIN to the platform dashboard before any read', async () => {
    mocks.requireUser.mockResolvedValue(SUPER_ADMIN)

    await expect(render('site-cost')).rejects.toThrow('NEXT_REDIRECT:/super-admin/dashboard')
    expect(calledReads()).toEqual([])
  })

  it.each(['vendor-payable', 'client-receivable'])('turns a SITE_ENGINEER away from the company-wide %s report before any read', async (reportType) => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    await expect(render(reportType)).rejects.toThrow('NEXT_REDIRECT:/reports')
    expect(calledReads()).toEqual([])
  })

  it('shows a SITE_ENGINEER the site cost of its assigned sites only, with no export', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    const html = await render('site-cost')

    expect(html).toContain('Name site_assigned')
    expect(html).toContain('Name site_member')
    expect(html).not.toContain('Name site_1<')
    expect(html).not.toContain('Name site_other')
    expect(mocks.exportButtons).not.toHaveBeenCalled()
  })

  it('turns away a role without the report permission, and a disabled REPORTS module, before any read', async () => {
    mocks.requireUser.mockResolvedValueOnce(principal('PURCHASE_MANAGER'))
    await expect(render('client-receivable')).rejects.toThrow(/NEXT_REDIRECT|NEXT_NOT_FOUND/)

    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: ['sites'] })
    await expect(render('vendor-payable')).rejects.toThrow(/NEXT_REDIRECT|NEXT_NOT_FOUND/)
    expect(calledReads()).toEqual([])
  })

  it('shows an ACCOUNTANT the vendor ledger with export', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))

    const html = await render('vendor-payable')

    expect(html).toContain('Vendor')
    expect(mocks.exportButtons).toHaveBeenCalled()
  })

  it('answers not found for an unknown report', async () => {
    await expect(render('everything')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(calledReads()).toEqual([])
  })
})
