import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for the tenant read pages still authorizing from the JWT after d1e35c5.
 *
 * The dashboard, expense, bill, DPR, nested site and mobile pages took the company, the
 * user and the role from `auth()` claims, so a revoked member, a demoted role or a
 * suspended tenant kept reading until the token expired. Several read without any
 * permission check, the mobile pages scoped by an unauthenticated `undefined` user, and
 * the bill detail page looked a bill up by bare id, across every tenant.
 *
 * Now every page runs the shared `resolveTenantPageAccess` gate first: the live principal,
 * the page permission and its module decide before any query, SUPER_ADMIN is sent to the
 * platform dashboard, and every read binds to the live company and to a live site of
 * exactly that company. Sections a role may not see are neither queried nor rendered.
 *
 * `@/lib/permissions` and `@/lib/pages/tenant-page-access` are real.
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
  prisma: {
    company: { findFirst: vi.fn(), findUnique: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    expense: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), aggregate: vi.fn(), count: vi.fn() },
    dailyProgressReport: { findFirst: vi.fn(), findMany: vi.fn() },
    labour: { count: vi.fn() },
    labourAttendance: { count: vi.fn(), findMany: vi.fn() },
    contractorAttendance: { findMany: vi.fn() },
    salaryRun: { aggregate: vi.fn() },
    invoice: { aggregate: vi.fn() },
    vendor: { count: vi.fn(), aggregate: vi.fn() },
    subcontractor: { count: vi.fn(), aggregate: vi.fn() },
    material: { count: vi.fn() },
    sitePhoto: { count: vi.fn(), findMany: vi.fn() },
    payment: { aggregate: vi.fn() },
    auditLog: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('next/link', () => ({ default: () => null }))
vi.mock('@/components/bills/BillApprovalList', () => ({ default: () => null }))
vi.mock('@/app/(dashboard)/expenses/ExpenseTableClient', () => ({ default: () => null }))
vi.mock('@/components/responsive/ResponsiveTable', () => ({ default: () => null }))
vi.mock('@/components/responsive/MobileCardList', () => ({ default: () => null }))
vi.mock('@/components/mobile/PWAInstallBanner', () => ({ default: () => null }))
vi.mock('@/components/mobile/SiteSelectorClient', () => ({ default: () => null }))
vi.mock('@/components/ui/LiveClock', () => ({ default: () => null }))

const { default: BillDetailPage } = await import('@/app/(dashboard)/bills/[id]/page')
const { default: CompanyDashboard } = await import('@/app/(dashboard)/dashboard/page')
const { default: ExpensesPage } = await import('@/app/(dashboard)/expenses/page')
const { default: BillsPage } = await import('@/app/(dashboard)/bills/page')
const { default: DprPage } = await import('@/app/(dashboard)/dpr/page')
const { default: SiteExpensesPage } = await import('@/app/(dashboard)/sites/[id]/expenses/page')
const { default: SiteDprPage } = await import('@/app/(dashboard)/sites/[id]/dpr/page')
const { default: MobileHome } = await import('@/app/(mobile)/mobile/home/page')
const { default: MobileReports } = await import('@/app/(mobile)/mobile/reports/page')
const { default: MobileActivityPage } = await import('@/app/(mobile)/mobile/activity/page')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', name: 'Tower A', status: 'ACTIVE', deletedAt: null, budget: 1000, spent: 100 },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', status: 'ACTIVE', deletedAt: new Date('2026-01-01'), budget: 0, spent: 0 },
  { id: 'site_other', companyId: 'company_2', name: 'Other tenant', status: 'ACTIVE', deletedAt: null, budget: 0, spent: 0 },
]
const siteById = new Map(SITES.map((site) => [site.id as string, site]))
const siteRelation = (row: Row, key: string) => (key === 'site' ? (siteById.get(row.siteId as string) ?? null) : undefined)

function expense(id: string, overrides: Row = {}): Row {
  const row: Row = {
    id,
    companyId: 'company_1',
    siteId: 'site_1',
    description: `Expense ${id}`,
    amount: 1180,
    category: 'MATERIAL',
    paymentMode: 'CASH',
    approvalStatus: 'PENDING',
    notes: null,
    billNumber: null,
    billDate: null,
    paidTo: 'Supplier',
    approvedAt: null,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    createdById: 'user_company_admin',
    createdBy: { id: 'user_company_admin', name: 'Admin' },
    billAttachments: [],
    deletedAt: null,
    ...overrides,
  }
  row.site = siteById.get(row.siteId as string) ?? null
  return row
}

const EXPENSES: Row[] = [
  expense('bill_own'),
  expense('bill_foreign', { companyId: 'company_2', siteId: 'site_other' }),
  expense('bill_deleted', { deletedAt: new Date('2026-02-01') }),
  expense('bill_dead_site', { siteId: 'site_dead' }),
  // Stamped company_1 but pinned to company_2's live site.
  expense('bill_forged', { siteId: 'site_other' }),
]

const DPRS: Row[] = [
  { id: 'dpr_1', companyId: 'company_1', siteId: 'site_1', date: new Date('2026-09-01'), createdAt: new Date('2026-09-01T12:00:00Z'), labourCount: 4, workDone: 'Slab', delayReason: null, createdBy: { name: 'SE' }, site: { name: 'Tower A' } },
  { id: 'dpr_foreign', companyId: 'company_2', siteId: 'site_other', date: new Date('2026-09-01'), createdAt: new Date('2026-09-01T12:00:00Z'), labourCount: 1, workDone: 'x', delayReason: null, createdBy: { name: 'X' }, site: { name: 'Other' } },
]

const MEMBERS: Row[] = [
  // Assigned to a live own site and, by a stale row, to another tenant's site.
  { userId: 'user_site_engineer', companyId: 'company_1', isActive: true, siteIds: ['site_1', 'site_other', 'site_dead'] },
  { userId: 'user_site_engineer', companyId: 'company_2', isActive: true, siteIds: ['site_other'] },
]

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: `${role} Person`, email: `${role.toLowerCase()}@acme.test`, role, companyId, companyName: `Name of ${companyId}` }
}

const SUPER_ADMIN = { id: 'root', name: 'Root', email: 'root@platform.test', role: 'SUPER_ADMIN' }

const P = <T,>(value: T) => Promise.resolve(value)

type PageCase = {
  name: string
  path: string
  module: string
  run: () => Promise<unknown>
  deniedRoles: string[]
}

const PAGES: PageCase[] = [
  {
    name: 'bill detail',
    path: '/bills/bill_own',
    module: 'BILLS',
    run: () => BillDetailPage({ params: P({ id: 'bill_own' }) }),
    deniedRoles: ['SITE_ENGINEER', 'SUPERVISOR', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'],
  },
  {
    name: 'expenses',
    path: '/expenses',
    module: 'EXPENSES',
    run: () => ExpensesPage({ searchParams: P({}) }),
    deniedRoles: ['SITE_ENGINEER', 'SUPERVISOR', 'PURCHASE_MANAGER', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'],
  },
  {
    name: 'bills',
    path: '/bills',
    module: 'BILLS',
    run: () => BillsPage({ searchParams: P({}) }),
    deniedRoles: ['SITE_ENGINEER', 'SUPERVISOR', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'],
  },
  {
    name: 'dpr',
    path: '/dpr',
    module: 'DPR',
    run: () => DprPage(),
    deniedRoles: ['ACCOUNTANT', 'PURCHASE_MANAGER', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'],
  },
  {
    name: 'site expenses',
    path: '/sites/site_1/expenses',
    module: 'EXPENSES',
    run: () => SiteExpensesPage({ params: P({ id: 'site_1' }), searchParams: P({}) }),
    deniedRoles: ['SITE_ENGINEER', 'SUPERVISOR', 'PURCHASE_MANAGER', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'],
  },
  {
    name: 'site dpr',
    path: '/sites/site_1/dpr',
    module: 'DPR',
    run: () => SiteDprPage({ params: P({ id: 'site_1' }) }),
    deniedRoles: ['ACCOUNTANT', 'PURCHASE_MANAGER', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'],
  },
  {
    name: 'mobile home',
    path: '/mobile/home',
    module: 'SITES',
    run: () => MobileHome({ searchParams: P({}) }),
    deniedRoles: ['ACCOUNTANT', 'PURCHASE_MANAGER', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'],
  },
  {
    name: 'mobile reports',
    path: '/mobile/reports',
    module: 'REPORTS',
    run: () => MobileReports(),
    deniedRoles: ['VENDOR', 'SUBCONTRACTOR', 'CLIENT'],
  },
  {
    name: 'mobile activity',
    path: '/mobile/activity',
    module: 'SITES',
    run: () => MobileActivityPage({ searchParams: P({}) }),
    deniedRoles: ['ACCOUNTANT', 'PURCHASE_MANAGER', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'],
  },
]

type Delegate = Record<string, ReturnType<typeof vi.fn>>

/** Every data read; the module lookup on `company` is the gate's own, checked separately. */
function dataReads() {
  return Object.entries(mocks.prisma as Record<string, Delegate>)
    .filter(([model]) => model !== 'company')
    .flatMap(([model, delegate]) => Object.entries(delegate).map(([op, fn]) => ({ name: `${model}.${op}`, fn })))
}

function expectNoDataReads() {
  const called = dataReads().filter(({ fn }) => fn.mock.calls.length > 0).map(({ name }) => name)
  expect(called).toEqual([])
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

  const expenses = inMemoryDelegate(EXPENSES, siteRelation)
  mocks.prisma.expense.findFirst.mockImplementation(expenses.findFirst)
  mocks.prisma.expense.findMany.mockImplementation(expenses.findMany)
  mocks.prisma.expense.count.mockImplementation(expenses.count)
  mocks.prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 }, _count: 0 })

  mocks.prisma.dailyProgressReport.findMany.mockImplementation(inMemoryDelegate(DPRS, siteRelation).findMany)
  // Today's-DPR lookup uses a date window (`lte`) the in-memory evaluator does not model.
  mocks.prisma.dailyProgressReport.findFirst.mockResolvedValue(null)

  mocks.prisma.companyMember.findFirst.mockImplementation(inMemoryDelegate(MEMBERS).findFirst)

  for (const fn of [mocks.prisma.labour.count, mocks.prisma.labourAttendance.count, mocks.prisma.vendor.count, mocks.prisma.subcontractor.count, mocks.prisma.material.count, mocks.prisma.sitePhoto.count]) {
    fn.mockResolvedValue(0)
  }
  for (const fn of [mocks.prisma.labourAttendance.findMany, mocks.prisma.contractorAttendance.findMany, mocks.prisma.sitePhoto.findMany, mocks.prisma.auditLog.findMany]) {
    fn.mockResolvedValue([])
  }
  mocks.prisma.salaryRun.aggregate.mockResolvedValue({ _sum: { totalNet: 0 } })
  mocks.prisma.invoice.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
  mocks.prisma.vendor.aggregate.mockResolvedValue({ _sum: { amountPayable: 0 } })
  mocks.prisma.subcontractor.aggregate.mockResolvedValue({ _sum: { raBilled: 0, advance: 0, retention: 0 } })
  mocks.prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
})

describe.each(PAGES)('$name page gate', (page) => {
  it('refuses a revoked principal before any read and never consults the JWT itself', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    await expect(page.run()).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.auth).not.toHaveBeenCalled()
    expectNoReads()
  })

  it('sends a SUPER_ADMIN, which carries no tenant context, to the platform dashboard before any read', async () => {
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
})

describe('BillDetailPage', () => {
  it('looks the bill up under the live company, not deleted, on a live site of that company', async () => {
    const html = await render(BillDetailPage({ params: P({ id: 'bill_own' }) }))

    expect(html).toContain('Expense bill_own')
    expect(mocks.prisma.expense.findUnique).not.toHaveBeenCalled()
    expect(wheres(mocks.prisma.expense.findFirst)[0]).toEqual({
      id: 'bill_own',
      companyId: 'company_1',
      deletedAt: null,
      site: { companyId: 'company_1', deletedAt: null },
    })
  })

  it.each([
    ['another tenant', 'bill_foreign'],
    ['a soft-deleted', 'bill_deleted'],
    ['a dead-site', 'bill_dead_site'],
    ['a cross-bound forged', 'bill_forged'],
    ['a missing', 'bill_missing'],
  ])('answers %s bill id exactly like a missing one, rendering nothing of it', async (_label, id) => {
    await expect(BillDetailPage({ params: P({ id }) })).rejects.toThrow('NEXT_REDIRECT:/bills')
  })

  it('does not leak another tenant bill to an admin whose live company differs from the bill', async () => {
    mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN', 'company_2'))

    await expect(BillDetailPage({ params: P({ id: 'bill_own' }) })).rejects.toThrow('NEXT_REDIRECT:/bills')
  })
})

describe('CompanyDashboard', () => {
  it('refuses a revoked principal before any read', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    await expect(CompanyDashboard()).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.auth).not.toHaveBeenCalled()
    expectNoReads()
  })

  it('sends a SUPER_ADMIN to the platform dashboard before any read', async () => {
    mocks.requireUser.mockResolvedValue(SUPER_ADMIN)

    await expect(CompanyDashboard()).rejects.toThrow('NEXT_REDIRECT:/super-admin/dashboard')
    expectNoReads()
  })

  it('reads every section under the live company and its live sites for an admin', async () => {
    mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN', 'company_2'))

    await render(CompanyDashboard())

    expect(wheres(mocks.prisma.site.findMany)[0]).toMatchObject({ companyId: 'company_2', deletedAt: null })
    for (const where of wheres(mocks.prisma.expense.findMany)) {
      expect(where).toMatchObject({ companyId: 'company_2', deletedAt: null, siteId: { in: ['site_other'] } })
    }
    expect(mocks.prisma.labour.count).toHaveBeenCalled()
    expect(mocks.prisma.material.count).toHaveBeenCalled()
  })

  it.each([
    ['SITE_ENGINEER', 'NEXT_REDIRECT:/mobile/home'],
    ['SUPERVISOR', 'NEXT_REDIRECT:/mobile/home'],
    ['CLIENT', 'NEXT_REDIRECT:/client-portal'],
    ['VENDOR', 'NEXT_NOT_FOUND'],
    ['SUBCONTRACTOR', 'NEXT_NOT_FOUND'],
  ])('re-routes a live %s without company.view before any read', async (role, target) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    await expect(CompanyDashboard()).rejects.toThrow(target)
    expectNoReads()
  })

  it('never queries labour, attendance, materials or expenses for a PURCHASE_MANAGER', async () => {
    mocks.requireUser.mockResolvedValue(principal('PURCHASE_MANAGER'))

    const html = await render(CompanyDashboard())

    for (const fn of [mocks.prisma.labour.count, mocks.prisma.labourAttendance.count, mocks.prisma.labourAttendance.findMany, mocks.prisma.expense.findMany, mocks.prisma.expense.aggregate]) {
      expect(fn).not.toHaveBeenCalled()
    }
    expect(html).not.toContain('Labour Pending')
    expect(html).not.toContain('Today&#x27;s Expense')
    expect(html).toContain('Materials Tracked')
  })

  it('never queries labour or materials for an ACCOUNTANT, but shows expenses', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))

    const html = await render(CompanyDashboard())

    for (const fn of [mocks.prisma.labour.count, mocks.prisma.labourAttendance.count, mocks.prisma.labourAttendance.findMany, mocks.prisma.material.count]) {
      expect(fn).not.toHaveBeenCalled()
    }
    expect(mocks.prisma.expense.aggregate).toHaveBeenCalled()
    expect(html).toContain('Pending approval')
  })

  it('queries no module section that the company has switched off', async () => {
    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: ['sites'] })

    await render(CompanyDashboard())

    for (const fn of [mocks.prisma.expense.findMany, mocks.prisma.expense.aggregate, mocks.prisma.labour.count, mocks.prisma.material.count, mocks.prisma.vendor.aggregate]) {
      expect(fn).not.toHaveBeenCalled()
    }
  })
})

describe('ExpensesPage', () => {
  it('binds the list to the live company and its live sites', async () => {
    await ExpensesPage({ searchParams: P({}) })

    expect(wheres(mocks.prisma.expense.findMany)[0]).toEqual({ companyId: 'company_1', deletedAt: null, site: { companyId: 'company_1', deletedAt: null } })
  })

  it.each(['site_other', 'site_dead', 'site_missing'])('refuses a ?siteId=%s filter that is not a live site of the company before reading expenses', async (siteId) => {
    await expect(ExpensesPage({ searchParams: P({ siteId }) })).rejects.toThrow('NEXT_REDIRECT:/expenses')
    expect(mocks.prisma.expense.findMany).not.toHaveBeenCalled()
  })

  it('bounds the page size', async () => {
    await ExpensesPage({ searchParams: P({ limit: '999999' }) })

    expect(mocks.prisma.expense.findMany.mock.calls[0][0].take).toBe(500)
  })
})

describe('BillsPage', () => {
  it('binds bills to the live company and its live sites', async () => {
    await BillsPage({ searchParams: P({ tab: 'ALL' }) })

    expect(wheres(mocks.prisma.expense.findMany)[0]).toEqual({ companyId: 'company_1', deletedAt: null, site: { companyId: 'company_1', deletedAt: null } })
  })

  it('does not pass an unknown tab through as an approval status', async () => {
    await BillsPage({ searchParams: P({ tab: 'NOT_A_STATUS' }) })

    expect(wheres(mocks.prisma.expense.findMany)[0]).toMatchObject({ approvalStatus: 'PENDING' })
  })
})

describe('DprPage', () => {
  it('lists only reports of live sites of the live company', async () => {
    await DprPage()

    expect(wheres(mocks.prisma.dailyProgressReport.findMany)[0]).toEqual({ companyId: 'company_1', site: { companyId: 'company_1', deletedAt: null } })
  })
})

describe.each([
  ['SiteExpensesPage', (id: string) => SiteExpensesPage({ params: P({ id }), searchParams: P({}) }), mocks.prisma.expense.findMany],
  ['SiteDprPage', (id: string) => SiteDprPage({ params: P({ id }) }), mocks.prisma.dailyProgressReport.findMany],
] as const)('%s', (_name, run, secondary) => {
  it('binds the exact live site of the live company before reading its records', async () => {
    await run('site_1')

    expect(wheres(mocks.prisma.site.findFirst)[0]).toEqual({ id: 'site_1', companyId: 'company_1', deletedAt: null })
    expect(wheres(secondary)[0]).toMatchObject({ companyId: 'company_1', siteId: 'site_1' })
    expect(mocks.prisma.site.findFirst.mock.invocationCallOrder[0]).toBeLessThan(secondary.mock.invocationCallOrder[0])
  })

  it.each(['site_other', 'site_dead', 'site_missing'])('refuses site %s before any secondary read', async (id) => {
    await expect(run(id)).rejects.toThrow('NEXT_REDIRECT:/sites')
    expect(secondary).not.toHaveBeenCalled()
  })
})

describe('MobileHome', () => {
  it('resolves membership from the live principal and keeps only live sites of the live company', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    await MobileHome({ searchParams: P({}) })

    expect(wheres(mocks.prisma.companyMember.findFirst)[0]).toEqual({ userId: 'user_site_engineer', companyId: 'company_1', isActive: true })
    expect(wheres(mocks.prisma.site.findMany)[0]).toMatchObject({
      companyId: 'company_1',
      deletedAt: null,
      OR: [
        { assignedEngineerId: 'user_site_engineer' },
        { engineerId: 'user_site_engineer' },
        { id: { in: ['site_1', 'site_other', 'site_dead'] } },
      ],
    })
    expect(await mocks.prisma.site.findMany.mock.results[0].value).toEqual([expect.objectContaining({ id: 'site_1' })])
  })

  it('ignores a requested foreign site and reads only the resolved live site', async () => {
    await MobileHome({ searchParams: P({ siteId: 'site_other' }) })

    const siteScoped = [mocks.prisma.expense.aggregate, mocks.prisma.expense.count, mocks.prisma.expense.findMany, mocks.prisma.labour.count, mocks.prisma.sitePhoto.count]
      .flatMap((fn) => wheres(fn))
    expect(siteScoped.length).toBeGreaterThan(0)
    for (const where of siteScoped) expect(where).toMatchObject({ siteId: 'site_1', companyId: 'company_1' })
  })

  it('reads no expense figures for a SUPERVISOR', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))

    await MobileHome({ searchParams: P({}) })

    for (const fn of [mocks.prisma.expense.aggregate, mocks.prisma.expense.count, mocks.prisma.expense.findMany]) {
      expect(fn).not.toHaveBeenCalled()
    }
    // This SUPERVISOR has no active membership or engineer assignment, so no site is
    // resolved and no site-scoped figure is read at all.
    expect(await mocks.prisma.site.findMany.mock.results[0].value).toEqual([])
    expect(mocks.prisma.labourAttendance.count).not.toHaveBeenCalled()
  })

  it('reads only its own submissions, not site-wide expenses, for a SITE_ENGINEER', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    await MobileHome({ searchParams: P({}) })

    expect(mocks.prisma.expense.aggregate).not.toHaveBeenCalled()
    expect(mocks.prisma.expense.count).not.toHaveBeenCalled()
    expect(wheres(mocks.prisma.expense.findMany)).toEqual([expect.objectContaining({ createdById: 'user_site_engineer', siteId: 'site_1', companyId: 'company_1' })])
  })
})

describe('MobileReports', () => {
  it('binds the active site to a live site of the live company', async () => {
    await MobileReports()

    expect(wheres(mocks.prisma.site.findFirst)[0]).toMatchObject({ companyId: 'company_1', deletedAt: null })
    expect(wheres(mocks.prisma.expense.aggregate)[0]).toMatchObject({ companyId: 'company_1', siteId: 'site_1', deletedAt: null })
  })

  it('reads no finance figures for a role without reports.finance', async () => {
    mocks.requireUser.mockResolvedValue(principal('PURCHASE_MANAGER'))

    const html = await render(MobileReports())

    expect(mocks.prisma.expense.aggregate).not.toHaveBeenCalled()
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(html).toContain('Generate report')
  })
})

describe('MobileActivityPage', () => {
  it('binds every feed to the live site and the live company', async () => {
    await MobileActivityPage({ searchParams: P({}) })

    expect(wheres(mocks.prisma.site.findFirst)[0]).toMatchObject({ companyId: 'company_1', deletedAt: null })
    for (const fn of [mocks.prisma.expense.findMany, mocks.prisma.dailyProgressReport.findMany, mocks.prisma.contractorAttendance.findMany, mocks.prisma.sitePhoto.findMany, mocks.prisma.auditLog.findMany]) {
      expect(wheres(fn)[0]).toMatchObject({ companyId: 'company_1' })
    }
    expect(wheres(mocks.prisma.expense.findMany)[0]).toMatchObject({ siteId: 'site_1', deletedAt: null })
  })

  it('reads no expense feed for a SUPERVISOR, even when asked for it', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))

    await MobileActivityPage({ searchParams: P({ type: 'EXPENSE' }) })

    expect(mocks.prisma.expense.findMany).not.toHaveBeenCalled()
  })
})
