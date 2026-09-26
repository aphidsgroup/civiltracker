import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Export History page (`/reports/export-history`) checked `reports.export` on the
 * live role but never the REPORTS module, so a company with reports switched off still
 * listed its export log. A SUPER_ADMIN, which has no company, queried `reportExport` with
 * `companyId: undefined` — an unfiltered, cross-tenant list.
 *
 * The page now shares the tenant page gate its parent `/reports` uses: `reports.export`
 * with REPORTS enabled on the live company, decided before any export row is read.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module` and `@/lib/pages/tenant-page-access`
 * are real; only the principal and Prisma are mocked.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  prisma: {
    company: { findFirst: vi.fn(), findUnique: vi.fn() },
    reportExport: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))

const { default: ExportHistoryPage } = await import('@/app/(dashboard)/reports/export-history/page')

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

let modules: unknown

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['REPORTS']
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findFirst.mockImplementation(async () => ({ modulesJson: modules }))
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  mocks.prisma.reportExport.findMany.mockResolvedValue([])
})

describe('ExportHistoryPage', () => {
  it.each([
    ['listed without REPORTS', ['EXPENSES', 'SITES']],
    ['switched off in the module object', { reports: false, expenses: true }],
  ])('refuses before reading exports when REPORTS is %s', async (_label, value) => {
    modules = value

    await expect(ExportHistoryPage()).rejects.toThrow(/NEXT_REDIRECT|NEXT_NOT_FOUND/)
    expect(mocks.prisma.reportExport.findMany).not.toHaveBeenCalled()
  })

  it('refuses a role without reports.export before any company or export read', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    await expect(ExportHistoryPage()).rejects.toThrow(/NEXT_REDIRECT|NEXT_NOT_FOUND/)
    expect(mocks.prisma.company.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.reportExport.findMany).not.toHaveBeenCalled()
  })

  it('refuses a revoked principal before any read', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Account is inactive'))

    await expect(ExportHistoryPage()).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.prisma.reportExport.findMany).not.toHaveBeenCalled()
  })

  it('never runs an unfiltered cross-tenant export query for a SUPER_ADMIN', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root_1', name: 'Root', email: 'root@x.test', role: 'SUPER_ADMIN' })

    await expect(ExportHistoryPage()).rejects.toThrow('NEXT_REDIRECT:/super-admin/dashboard')
    expect(mocks.prisma.reportExport.findMany).not.toHaveBeenCalled()
  })

  it('lists the exports of exactly the live company when REPORTS is enabled', async () => {
    await ExportHistoryPage()

    expect(mocks.prisma.reportExport.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.reportExport.findMany.mock.calls[0][0].where).toEqual({ companyId: 'company_1' })
  })
})
