import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for the site, activity and report pages still authorizing from the JWT
 * after f920f44.
 *
 * `/activity`, `/sites`, `/sites/[id]/activity`, `/sites/[id]/bills` and the shared
 * `/sites/[id]` layout took the company from `auth()` claims, so a revoked member, a
 * demoted role or a module switched off kept reading. The site activity page read every
 * feed by a bare site id from the URL, across every tenant. The mobile site page and
 * `/reports` used the live principal but checked no permission or module, authorized
 * the financial ledger by role name, and let a SUPER_ADMIN query with an `undefined`
 * company. `/reports` handed every `reports.view` holder the whole financial overview,
 * and the dashboard read the live site ids even when no section needed them.
 *
 * Now every page runs `resolveTenantPageAccess` first and binds a URL site id to a live
 * site of exactly the live company before reading anything else. Pages render in
 * parallel with the layout, so each nested page carries its own gate; the layout admits
 * any role that may read one of its sections and shows site metadata only under
 * `sites.view` and the SITES module.
 *
 * `@/lib/permissions`, `@/lib/pages/tenant-page-access` and `@/actions/reports` are real.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireUser: vi.fn(),
  editSiteModal: vi.fn(() => null),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  sumValidOpenApprovalAmountsBySite: vi.fn(),
  countSitePendingApprovalsForViewer: vi.fn(),
  prisma: {
    company: { findFirst: vi.fn(), findUnique: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
    expense: { findFirst: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
    dailyProgressReport: { findMany: vi.fn() },
    labour: { count: vi.fn() },
    labourAttendance: { count: vi.fn(), findMany: vi.fn() },
    contractorAttendance: { findMany: vi.fn() },
    sitePhoto: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
    projectChecklist: { findUnique: vi.fn() },
    material: { count: vi.fn() },
    vendor: { aggregate: vi.fn() },
    subcontractor: { aggregate: vi.fn() },
    client: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('next/link', () => ({ default: () => null }))
vi.mock('@/lib/approvals/valid-reads', () => ({
  sumValidOpenApprovalAmountsBySite: mocks.sumValidOpenApprovalAmountsBySite,
  countSitePendingApprovalsForViewer: mocks.countSitePendingApprovalsForViewer,
}))
vi.mock('@/components/bills/BillApprovalList', () => ({ default: () => null }))
vi.mock('@/components/client/EditSiteModal', () => ({ EditSiteModal: mocks.editSiteModal }))
vi.mock('@/components/client/SiteTabsNav', () => ({ SiteTabsNav: () => null }))
vi.mock('@/components/client/SiteActions', () => ({ SiteCardActions: () => null }))

const { default: DashboardActivityPage } = await import('@/app/(dashboard)/activity/page')
const { default: SiteActivityPage } = await import('@/app/(dashboard)/sites/[id]/activity/page')
const { default: SiteBillsPage } = await import('@/app/(dashboard)/sites/[id]/bills/page')
const { default: SiteLayout } = await import('@/app/(dashboard)/sites/[id]/layout')
const { default: SiteOverviewPage } = await import('@/app/(dashboard)/sites/[id]/page')
const { default: SitesPage } = await import('@/app/(dashboard)/sites/page')
const { default: MobileSingleSitePage } = await import('@/app/(mobile)/mobile/sites/[id]/page')
const { default: ReportsDashboard } = await import('@/app/(dashboard)/reports/page')
const { default: CompanyDashboard } = await import('@/app/(dashboard)/dashboard/page')
const { getFounderDashboardStats } = await import('@/actions/reports')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', name: 'Tower A', location: 'Chennai', status: 'ACTIVE', deletedAt: null, budget: 1000, spent: 100, progress: 10, targetEndDate: null, expenses: [], labour: [], dprs: [], _count: { labour: 0, expenses: 0 } },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', location: 'x', status: 'ACTIVE', deletedAt: new Date('2026-01-01'), budget: 0, spent: 0, progress: 0, targetEndDate: null, expenses: [], labour: [], dprs: [], _count: { labour: 0, expenses: 0 } },
  { id: 'site_other', companyId: 'company_2', name: 'Other Tenant Tower', location: 'x', status: 'ACTIVE', deletedAt: null, budget: 0, spent: 0, progress: 0, targetEndDate: null, expenses: [], labour: [], dprs: [], _count: { labour: 0, expenses: 0 } },
]

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: `${role} Person`, email: `${role.toLowerCase()}@acme.test`, role, companyId, companyName: `Name of ${companyId}` }
}

const SUPER_ADMIN = { id: 'root', name: 'Root', email: 'root@platform.test', role: 'SUPER_ADMIN' }

const P = <T,>(value: T) => Promise.resolve(value)

type PageCase = {
  name: string
  module: string
  run: (siteId?: string) => Promise<unknown>
  deniedRoles: string[]
  /** Set for pages that take a site id from the URL. */
  siteScoped?: boolean
}

const NON_SITE_ROLES = ['ACCOUNTANT', 'PURCHASE_MANAGER', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT']

const PAGES: PageCase[] = [
  {
    name: 'activity',
    module: 'SITES',
    run: () => DashboardActivityPage({ searchParams: P({}) }),
    deniedRoles: NON_SITE_ROLES,
  },
  {
    name: 'site activity',
    module: 'SITES',
    run: (id = 'site_1') => SiteActivityPage({ params: P({ id }), searchParams: P({}) }),
    deniedRoles: NON_SITE_ROLES,
    siteScoped: true,
  },
  {
    name: 'site bills',
    module: 'BILLS',
    run: (id = 'site_1') => SiteBillsPage({ params: P({ id }), searchParams: P({}) }),
    deniedRoles: ['SITE_ENGINEER', 'SUPERVISOR', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'],
    siteScoped: true,
  },
  {
    name: 'site layout',
    module: 'every site section',
    run: (id = 'site_1') => SiteLayout({ children: null, params: P({ id }) }),
    deniedRoles: ['VENDOR', 'SUBCONTRACTOR', 'CLIENT'],
    siteScoped: true,
  },
  {
    name: 'site overview',
    module: 'SITES',
    run: (id = 'site_1') => SiteOverviewPage({ params: P({ id }) }),
    deniedRoles: NON_SITE_ROLES,
    siteScoped: true,
  },
  {
    name: 'mobile site',
    module: 'SITES',
    run: (id = 'site_1') => MobileSingleSitePage({ params: P({ id }) }),
    deniedRoles: NON_SITE_ROLES,
    siteScoped: true,
  },
  {
    name: 'sites list',
    module: 'SITES',
    run: () => SitesPage(),
    deniedRoles: NON_SITE_ROLES,
  },
  {
    name: 'reports',
    module: 'REPORTS',
    run: () => ReportsDashboard(),
    deniedRoles: ['VENDOR', 'SUBCONTRACTOR', 'CLIENT'],
  },
]

type Delegate = Record<string, ReturnType<typeof vi.fn>>

/** Every data read; the module lookup on `company` is the gate's own, checked separately. */
function dataReads() {
  const prismaReads = Object.entries(mocks.prisma as Record<string, Delegate>)
    .filter(([model]) => model !== 'company')
    .flatMap(([model, delegate]) => Object.entries(delegate).map(([op, fn]) => ({ name: `${model}.${op}`, fn })))
  return [
    ...prismaReads,
    { name: 'sumValidOpenApprovalAmountsBySite', fn: mocks.sumValidOpenApprovalAmountsBySite },
    { name: 'countSitePendingApprovalsForViewer', fn: mocks.countSitePendingApprovalsForViewer },
  ]
}

function calledReads() {
  return dataReads().filter(({ fn }) => fn.mock.calls.length > 0).map(({ name }) => name)
}

function expectNoDataReads() {
  expect(calledReads()).toEqual([])
}

function expectNoReads() {
  expectNoDataReads()
  expect(mocks.prisma.company.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.company.findUnique).not.toHaveBeenCalled()
}

function wheres(fn: ReturnType<typeof vi.fn>) {
  return fn.mock.calls.map((call) => (call[0] as { where?: Row } | undefined)?.where)
}

async function render(element: Promise<unknown>) {
  return renderToStaticMarkup((await element) as ReactElement)
}

const FEEDS = [
  mocks.prisma.expense.findMany,
  mocks.prisma.dailyProgressReport.findMany,
  mocks.prisma.labourAttendance.findMany,
  mocks.prisma.contractorAttendance.findMany,
  mocks.prisma.sitePhoto.findMany,
  mocks.prisma.auditLog.findMany,
]

beforeEach(() => {
  vi.clearAllMocks()
  // The JWT claims an admin of another tenant; only the live principal may decide.
  mocks.auth.mockResolvedValue({ user: { id: 'jwt_user', companyId: 'company_jwt', role: 'COMPANY_ADMIN' } })
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: null })

  const sites = inMemoryDelegate(SITES)
  mocks.prisma.site.findFirst.mockImplementation(sites.findFirst)
  mocks.prisma.site.findMany.mockImplementation(sites.findMany)
  mocks.prisma.site.count.mockImplementation(sites.count)
  mocks.prisma.site.deleteMany.mockResolvedValue({ count: 0 })

  for (const fn of [...FEEDS, mocks.prisma.client.findMany]) fn.mockResolvedValue([])
  mocks.prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 }, _count: 0 })
  mocks.prisma.labour.count.mockResolvedValue(3)
  mocks.prisma.labourAttendance.count.mockResolvedValue(0)
  mocks.prisma.material.count.mockResolvedValue(0)
  mocks.prisma.vendor.aggregate.mockResolvedValue({ _sum: { amountPayable: 0 } })
  mocks.prisma.subcontractor.aggregate.mockResolvedValue({ _sum: { raBilled: 0, advance: 0, retention: 0 } })
  mocks.prisma.projectChecklist.findUnique.mockResolvedValue(null)
  mocks.sumValidOpenApprovalAmountsBySite.mockResolvedValue(new Map())
  mocks.countSitePendingApprovalsForViewer.mockResolvedValue(null)
})

describe.each(PAGES)('$name page gate', (page) => {
  it('refuses a revoked principal before any read and never consults the JWT itself', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    await expect(page.run()).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.auth).not.toHaveBeenCalled()
    expectNoReads()
  })

  it('sends a SUPER_ADMIN, which carries no tenant context, away before any global lookup', async () => {
    mocks.requireUser.mockResolvedValue(SUPER_ADMIN)

    await expect(page.run()).rejects.toThrow('NEXT_REDIRECT:/super-admin/dashboard')
    expectNoReads()
  })

  it.each(page.deniedRoles)('turns a live %s without the page permission away before any read', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    await expect(page.run()).rejects.toThrow(/NEXT_REDIRECT|NEXT_NOT_FOUND/)
    expectNoReads()
  })

  it(`denies before any data read when the ${page.module} module is disabled`, async () => {
    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: [] })

    await expect(page.run()).rejects.toThrow(/NEXT_REDIRECT|NEXT_NOT_FOUND/)
    expectNoDataReads()
    expect(mocks.prisma.company.findFirst).toHaveBeenCalledWith({ where: { id: 'company_1', deletedAt: null }, select: { modulesJson: true } })
  })

  it('reads only under the live company, never the JWT company', async () => {
    await page.run()

    const scoped = dataReads().flatMap(({ fn }) => wheres(fn)).filter(Boolean)
    expect(scoped.length).toBeGreaterThan(0)
    expect(JSON.stringify(scoped)).not.toContain('company_jwt')
    expect(JSON.stringify(scoped)).not.toContain('jwt_user')
  })

  if (page.siteScoped) {
    it.each(['site_other', 'site_dead', 'site_missing'])('resolves %s as the one exact live company site read, and reads nothing else', async (id) => {
      await expect(page.run(id)).rejects.toThrow(/NEXT_REDIRECT:\/sites|NEXT_NOT_FOUND/)

      expect(calledReads()).toEqual(['site.findFirst'])
      expect(mocks.prisma.site.findUnique).not.toHaveBeenCalled()
      expect(wheres(mocks.prisma.site.findFirst)).toEqual([{ id, companyId: 'company_1', deletedAt: null }])
    })

    it('never leaks a known foreign site to an admin of another company', async () => {
      mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN', 'company_2'))

      await expect(page.run('site_1')).rejects.toThrow(/NEXT_REDIRECT:\/sites|NEXT_NOT_FOUND/)
      expect(calledReads()).toEqual(['site.findFirst'])
    })
  }
})

describe('DashboardActivityPage', () => {
  it('binds every feed to the live company and its live sites', async () => {
    await DashboardActivityPage({ searchParams: P({}) })

    expect(wheres(mocks.prisma.site.findMany)[0]).toEqual({ companyId: 'company_1', deletedAt: null })
    for (const fn of FEEDS) {
      expect(JSON.stringify(wheres(fn)[0])).toContain('"companyId":"company_1"')
    }
    expect(wheres(mocks.prisma.expense.findMany)[0]).toMatchObject({ siteId: { in: ['site_1'] }, deletedAt: null })
  })

  it('reads no expense feed for a SUPERVISOR, even when asked for it', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))

    await DashboardActivityPage({ searchParams: P({ type: 'EXPENSE' }) })

    expect(mocks.prisma.expense.findMany).not.toHaveBeenCalled()
  })

  it('reads no attendance or DPR feed whose module is switched off', async () => {
    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: ['sites', 'expenses'] })

    await DashboardActivityPage({ searchParams: P({}) })

    for (const fn of [mocks.prisma.labourAttendance.findMany, mocks.prisma.contractorAttendance.findMany, mocks.prisma.dailyProgressReport.findMany]) {
      expect(fn).not.toHaveBeenCalled()
    }
    expect(mocks.prisma.expense.findMany).toHaveBeenCalled()
  })

  it('bounds the page size', async () => {
    await DashboardActivityPage({ searchParams: P({ limit: '999999' }) })

    expect(mocks.prisma.expense.findMany.mock.calls[0][0].take).toBe(500)
  })
})

describe('SiteActivityPage', () => {
  it('binds the exact live site before reading any feed, and every feed to that site and company', async () => {
    await SiteActivityPage({ params: P({ id: 'site_1' }), searchParams: P({}) })

    expect(wheres(mocks.prisma.site.findFirst)[0]).toEqual({ id: 'site_1', companyId: 'company_1', deletedAt: null })
    for (const fn of FEEDS) {
      expect(mocks.prisma.site.findFirst.mock.invocationCallOrder[0]).toBeLessThan(fn.mock.invocationCallOrder[0])
      expect(JSON.stringify(wheres(fn)[0])).toContain('"companyId":"company_1"')
      expect(JSON.stringify(wheres(fn)[0])).toMatch(/"(siteId|recordId)":"site_1"/)
    }
  })

  it('reads no expense feed for a SUPERVISOR, even when asked for it', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))
    // A field role opens only an assigned site.
    mocks.prisma.companyMember.findFirst.mockResolvedValueOnce({ siteIds: ['site_1'] })

    await SiteActivityPage({ params: P({ id: 'site_1' }), searchParams: P({ type: 'EXPENSE' }) })

    expect(mocks.prisma.expense.findMany).not.toHaveBeenCalled()
  })
})

describe('SiteBillsPage', () => {
  it('lets an ACCOUNTANT, who holds bills.view but not sites.view, read the bills of an owned live site', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))

    await SiteBillsPage({ params: P({ id: 'site_1' }), searchParams: P({ tab: 'ALL' }) })

    expect(wheres(mocks.prisma.site.findFirst)[0]).toEqual({ id: 'site_1', companyId: 'company_1', deletedAt: null })
    expect(wheres(mocks.prisma.expense.findMany)[0]).toEqual({ companyId: 'company_1', siteId: 'site_1', deletedAt: null })
    expect(mocks.prisma.site.findFirst.mock.invocationCallOrder[0]).toBeLessThan(mocks.prisma.expense.findMany.mock.invocationCallOrder[0])
  })

  it('does not pass an unknown tab through as an approval status', async () => {
    await SiteBillsPage({ params: P({ id: 'site_1' }), searchParams: P({ tab: 'NOT_A_STATUS' }) })

    expect(wheres(mocks.prisma.expense.findMany)[0]).toMatchObject({ approvalStatus: 'PENDING' })
  })
})

describe('SiteLayout', () => {
  it('shows the site header under sites.view, looked up exactly on the live company', async () => {
    const html = await render(SiteLayout({ children: null, params: P({ id: 'site_1' }) }))

    expect(html).toContain('Tower A')
    expect(mocks.prisma.site.findUnique).not.toHaveBeenCalled()
    expect(wheres(mocks.prisma.site.findFirst)).toEqual([{ id: 'site_1', companyId: 'company_1', deletedAt: null }])
    expect(mocks.editSiteModal).toHaveBeenCalled()
  })

  it.each(['ACCOUNTANT', 'PURCHASE_MANAGER'])('admits a %s to its own nested sections but reads and shows no site metadata', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    const html = await render(SiteLayout({ children: null, params: P({ id: 'site_1' }) }))

    expect(mocks.prisma.site.findFirst.mock.calls).toEqual([[{ where: { id: 'site_1', companyId: 'company_1', deletedAt: null }, select: { id: true } }]])
    expect(html).not.toContain('Tower A')
    expect(mocks.editSiteModal).not.toHaveBeenCalled()
  })

  it('reads no site metadata when the SITES module is off but another section is on', async () => {
    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: ['expenses'] })

    const html = await render(SiteLayout({ children: null, params: P({ id: 'site_1' }) }))

    expect(mocks.prisma.site.findFirst.mock.calls[0][0].select).toEqual({ id: true })
    expect(html).not.toContain('Tower A')
  })

  it('hands the budget-bearing edit form only to a role with sites.update', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    // A field role opens only an assigned site.
    mocks.prisma.companyMember.findFirst.mockResolvedValueOnce({ siteIds: ['site_1'] })

    const html = await render(SiteLayout({ children: null, params: P({ id: 'site_1' }) }))

    expect(html).toContain('Tower A')
    expect(mocks.editSiteModal).not.toHaveBeenCalled()
  })
})

describe('SiteOverviewPage', () => {
  it('binds the exact live site of the live company before reading anything else', async () => {
    await SiteOverviewPage({ params: P({ id: 'site_1' }) })

    expect(wheres(mocks.prisma.site.findFirst)[0]).toEqual({ id: 'site_1', companyId: 'company_1', deletedAt: null })
    expect(mocks.prisma.site.findFirst.mock.invocationCallOrder[0]).toBeLessThan(mocks.prisma.labourAttendance.findMany.mock.invocationCallOrder[0])
  })
})

describe('SitesPage', () => {
  it('lists only sites of the live company', async () => {
    await SitesPage()

    expect(wheres(mocks.prisma.site.findMany)[0]).toMatchObject({ companyId: 'company_1' })
  })
})

describe('MobileSingleSitePage', () => {
  it('looks the site up exactly on the live company, never by bare id', async () => {
    await MobileSingleSitePage({ params: P({ id: 'site_1' }) })

    expect(mocks.prisma.site.findUnique).not.toHaveBeenCalled()
    expect(wheres(mocks.prisma.site.findFirst)[0]).toEqual({ id: 'site_1', companyId: 'company_1', deletedAt: null })
  })

  it('reads no expense rows at all for the page', async () => {
    await MobileSingleSitePage({ params: P({ id: 'site_1' }) })

    expect(mocks.prisma.expense.findMany).not.toHaveBeenCalled()
    expect(JSON.stringify(mocks.prisma.site.findFirst.mock.calls[0][0])).not.toContain('expenses')
  })

  it('shows the budget ledger to a role with expenses.view', async () => {
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER'))

    const html = await render(MobileSingleSitePage({ params: P({ id: 'site_1' }) }))

    expect(html).toContain('Total Budget')
  })

  it.each(['SITE_ENGINEER', 'SUPERVISOR'])('shows no budget to a %s, by permission, and counts headcount under the live company', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    // A field role opens only an assigned site.
    mocks.prisma.companyMember.findFirst.mockResolvedValueOnce({ siteIds: ['site_1'] })

    const html = await render(MobileSingleSitePage({ params: P({ id: 'site_1' }) }))

    expect(html).not.toContain('Total Budget')
    expect(html).not.toContain('Spent Amount')
    expect(wheres(mocks.prisma.labour.count)[0]).toEqual({ companyId: 'company_1', siteId: 'site_1', isActive: true })
  })

  it('shows no budget to an admin when the EXPENSES module is off', async () => {
    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: ['sites'] })

    const html = await render(MobileSingleSitePage({ params: P({ id: 'site_1' }) }))

    expect(html).not.toContain('Total Budget')
    expect(mocks.prisma.labour.count).not.toHaveBeenCalled()
  })
})

describe('ReportsDashboard', () => {
  it('reads no financial figures for a reports.view holder without reports.finance', async () => {
    mocks.requireUser.mockResolvedValue(principal('PURCHASE_MANAGER'))

    const html = await render(ReportsDashboard())

    expectNoDataReads()
    expect(html).not.toContain('Total Budget')
    expect(html).not.toContain('Vendor Payable')
  })

  it('reads the financial overview for an admin under the live company', async () => {
    const html = await render(ReportsDashboard())

    expect(wheres(mocks.prisma.site.findMany)[0]).toEqual({ companyId: 'company_1', deletedAt: null })
    expect(wheres(mocks.prisma.client.findMany)[0]).toEqual({ companyId: 'company_1' })
    expect(html).toContain('Total Budget')
    expect(html).toContain('Salary Payable')
  })

  it('reads no salary rows and shows no salary or profitability for a PROJECT_MANAGER', async () => {
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER'))

    const html = await render(ReportsDashboard())

    expect(mocks.prisma.site.findMany.mock.calls[0][0].include).not.toHaveProperty('labour')
    expect(html).toContain('Total Budget')
    expect(html).not.toContain('Salary Payable')
    expect(html).not.toContain('Profitability Margin')
  })
})

describe('getFounderDashboardStats', () => {
  it.each([
    ['a SUPER_ADMIN, which has no company', SUPER_ADMIN],
    ['a reports.view holder without reports.finance', principal('PURCHASE_MANAGER')],
    ['a principal with no company', { ...principal('COMPANY_ADMIN'), companyId: undefined }],
  ])('refuses %s before any read, never querying an undefined company', async (_label, user) => {
    mocks.requireUser.mockResolvedValue(user)

    await expect(getFounderDashboardStats()).rejects.toThrow(/FORBIDDEN/)
    expectNoDataReads()
  })

  it('refuses when the REPORTS module is off', async () => {
    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: ['sites'] })

    await expect(getFounderDashboardStats()).rejects.toThrow(/FORBIDDEN/)
    expectNoDataReads()
  })

  it('refuses a revoked principal', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    await expect(getFounderDashboardStats()).rejects.toThrow(/UNAUTHORIZED/)
    expectNoReads()
  })

  it('reads no salary rows and returns no salary or profit figures for a role without salary.view or reports.profitability', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))

    const stats = await getFounderDashboardStats()

    expect(stats.salaryPayable).toBeNull()
    expect(stats.labourCost).toBeNull()
    expect(stats.profitMarginPercent).toBeNull()
    expect(mocks.prisma.site.findMany.mock.calls[0][0].include).not.toHaveProperty('labour')
  })
})

describe('CompanyDashboard', () => {
  it('reads no data at all when every section module is switched off', async () => {
    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: [] })

    await render(CompanyDashboard())

    expectNoDataReads()
  })

  it('reads no live site ids when only the SITES section is on', async () => {
    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: ['sites'] })

    await render(CompanyDashboard())

    expect(mocks.prisma.site.findMany.mock.calls.map(([args]) => args.select)).not.toContainEqual({ id: true })
    expect(calledReads().sort()).toEqual(['site.count', 'site.findMany'])
  })
})
