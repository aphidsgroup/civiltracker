import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for pages that still read tenant data on the JWT alone.
 *
 * `/boq`, `/mobile/attendance`, `/mobile/checklists` and the dashboard layout took the
 * company (and, for the layout, the role and name) from `auth()` claims and queried
 * before anything checked the live principal, a permission or a module. A revoked member
 * with an unexpired token kept reading BOQ money, the muster roll and the checklist; a
 * field role saw every site's workers and checklist instead of its assigned sites; the
 * checklist page even fell back to *any* active membership when the JWT had no company.
 * `/sites` also fired a permanent `site.deleteMany` from its render.
 *
 * Now each page runs the live gate first, field roles see only assigned live sites, the
 * layout renders the live principal, and the sites page never deletes anything.
 *
 * `@/lib/permissions`, `@/lib/auth/site-mutation` and `@/lib/pages/tenant-page-access`
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
  attendanceProps: vi.fn(),
  checklistProps: vi.fn(),
  shellProps: vi.fn(),
  badgeCount: vi.fn(),
  prisma: {
    company: { findFirst: vi.fn(), findUnique: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    bOQItem: { findMany: vi.fn(), aggregate: vi.fn() },
    labour: { findMany: vi.fn() },
    contractorAttendance: { findMany: vi.fn() },
    projectChecklist: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('next/link', () => ({ default: ({ children }: { children?: ReactNode }) => children }))
vi.mock('@/components/mobile/MobileAttendanceClient', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.attendanceProps(props)
    return null
  },
}))
vi.mock('@/app/(mobile)/mobile/checklists/ChecklistMobileClient', () => ({
  ChecklistMobileClient: (props: Record<string, unknown>) => {
    mocks.checklistProps(props)
    return null
  },
}))
vi.mock('@/components/responsive/ResponsiveShell', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.shellProps(props)
    return null
  },
}))
vi.mock('@/components/layout/DashboardSidebar', () => ({ default: () => null }))
vi.mock('@/components/layout/DashboardTopbar', () => ({ default: () => null }))
vi.mock('@/lib/approvals/valid-reads', () => ({ getPendingApprovalBadgeCount: mocks.badgeCount }))
vi.mock('@/components/client/SiteActions', () => ({ SiteCardActions: () => null }))

const { default: BOQPage } = await import('@/app/(dashboard)/boq/page')
const { default: MobileAttendancePage } = await import('@/app/(mobile)/mobile/attendance/page')
const { default: MobileChecklistsPage } = await import('@/app/(mobile)/mobile/checklists/page')
const { default: DashboardLayout } = await import('@/app/(dashboard)/layout')
const { default: SitesPage } = await import('@/app/(dashboard)/sites/page')

const ENGINEER = 'user_site_engineer'

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', name: 'Tower A', deletedAt: null, assignedEngineerId: null, engineerId: null },
  { id: 'site_mine', companyId: 'company_1', name: 'Mine', deletedAt: null, assignedEngineerId: ENGINEER, engineerId: null },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', deletedAt: new Date('2026-01-01'), assignedEngineerId: ENGINEER, engineerId: null },
  { id: 'site_other', companyId: 'company_2', name: 'Other tenant', deletedAt: null, assignedEngineerId: ENGINEER, engineerId: null },
]
const siteById = new Map(SITES.map((site) => [site.id as string, site]))
const siteRelation = (row: Row, key: string) => (key === 'site' ? siteById.get(row.siteId as string) ?? null : undefined)

const LABOUR: Row[] = [
  { id: 'w_1', companyId: 'company_1', siteId: 'site_1', isActive: true, name: 'A', trade: 'MASON', phone: null, dailyWage: 700, attendance: [] },
  { id: 'w_mine', companyId: 'company_1', siteId: 'site_mine', isActive: true, name: 'B', trade: 'HELPER', phone: null, dailyWage: 600, attendance: [] },
  { id: 'w_dead', companyId: 'company_1', siteId: 'site_dead', isActive: true, name: 'C', trade: 'HELPER', phone: null, dailyWage: 600, attendance: [] },
  { id: 'w_other', companyId: 'company_2', siteId: 'site_other', isActive: true, name: 'D', trade: 'HELPER', phone: null, dailyWage: 600, attendance: [] },
]
const CONTRACTOR_LOGS: Row[] = [
  { id: 'c_1', companyId: 'company_1', siteId: 'site_1', date: new Date(0), labourCount: 3, dailyAdvance: 0, contractorType: 'Mason' },
  { id: 'c_mine', companyId: 'company_1', siteId: 'site_mine', date: new Date(0), labourCount: 2, dailyAdvance: 0, contractorType: 'Mason' },
  { id: 'c_dead', companyId: 'company_1', siteId: 'site_dead', date: new Date(0), labourCount: 2, dailyAdvance: 0, contractorType: 'Mason' },
]
const BOQ: Row[] = [
  { id: 'b_1', companyId: 'company_1', siteId: 'site_1', description: 'Slab', category: 'RCC', unit: 'm3', quantity: 1, rate: 1, amount: 1, gstPercent: 18, totalWithGst: 1, site: { name: 'Tower A' } },
  { id: 'b_mine', companyId: 'company_1', siteId: 'site_mine', description: 'Mine', category: 'RCC', unit: 'm3', quantity: 1, rate: 1, amount: 1, gstPercent: 18, totalWithGst: 1, site: { name: 'Mine' } },
  { id: 'b_dead', companyId: 'company_1', siteId: 'site_dead', description: 'BAD dead site', category: 'RCC', unit: 'm3', quantity: 1, rate: 1, amount: 1, gstPercent: 18, totalWithGst: 1, site: { name: 'Gone' } },
]

function principal(role: string, companyId: string | undefined = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: `Live ${role}`, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

let modules: unknown

/** A matcher that ignores the date the page computes for "today". */
function withoutDate(where: Row) {
  const { date: _date, ...rest } = where
  return rest
}

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['SITES', 'BOQ', 'LABOUR', 'TASKS']
  // The JWT always claims an admin of company_1; only the live principal decides.
  mocks.auth.mockResolvedValue({ user: { id: 'user_1', companyId: 'company_1', role: 'COMPANY_ADMIN', name: 'Stale JWT' } })
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findFirst.mockImplementation(async () => ({ modulesJson: modules, name: 'Acme', plan: 'PRO', city: 'Chennai' }))
  mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: [] })
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)
  mocks.prisma.site.findMany.mockImplementation(inMemoryDelegate(SITES).findMany)
  mocks.prisma.site.deleteMany.mockResolvedValue({ count: 0 })
  mocks.prisma.bOQItem.findMany.mockImplementation(inMemoryDelegate(BOQ, siteRelation).findMany)
  mocks.prisma.bOQItem.aggregate.mockResolvedValue({ _sum: { amount: 0, totalWithGst: 0 } })
  mocks.prisma.labour.findMany.mockImplementation(async (args: { where: Row }) => inMemoryDelegate(LABOUR, siteRelation).findMany({ where: args.where }))
  mocks.prisma.contractorAttendance.findMany.mockImplementation(async (args: { where: Row }) =>
    inMemoryDelegate(CONTRACTOR_LOGS, siteRelation).findMany({ where: withoutDate(args.where) }))
  mocks.prisma.projectChecklist.findFirst.mockResolvedValue({ id: 'checklist_1', stages: [] })
  mocks.badgeCount.mockResolvedValue(0)
})

const tenantReads = () => [
  mocks.prisma.site.findFirst, mocks.prisma.site.findMany, mocks.prisma.bOQItem.findMany, mocks.prisma.bOQItem.aggregate,
  mocks.prisma.labour.findMany, mocks.prisma.contractorAttendance.findMany,
  mocks.prisma.projectChecklist.findFirst, mocks.prisma.projectChecklist.findUnique, mocks.prisma.companyMember.findFirst,
].reduce((sum, fn) => sum + fn.mock.calls.length, 0)

const PAGES = {
  boq: async () => renderToStaticMarkup(await BOQPage()),
  attendance: async () => renderToStaticMarkup(await MobileAttendancePage({ searchParams: Promise.resolve({}) })),
  checklists: async () => renderToStaticMarkup(await MobileChecklistsPage({ searchParams: Promise.resolve({ siteId: 'site_1' }) })),
}
type PageName = keyof typeof PAGES
const PAGE_NAMES = Object.keys(PAGES) as PageName[]

describe('live gate before any tenant read', () => {
  it.each(PAGE_NAMES)('%s refuses a revoked principal even with a valid JWT', async (name) => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))
    await expect(PAGES[name]()).rejects.toThrow(/UNAUTHORIZED/)
    expect(tenantReads()).toBe(0)
  })

  it.each([
    ['boq', 'CLIENT'], ['boq', 'VENDOR'], ['boq', 'ACCOUNTANT'],
    ['attendance', 'CLIENT'], ['attendance', 'ACCOUNTANT'], ['attendance', 'VENDOR'],
    ['checklists', 'CLIENT'], ['checklists', 'ACCOUNTANT'], ['checklists', 'VENDOR'],
  ] as [PageName, string][])('%s turns a live %s away before any tenant read', async (name, role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(PAGES[name]()).rejects.toThrow(/NEXT_REDIRECT|NEXT_NOT_FOUND/)
    expect(tenantReads()).toBe(0)
  })

  it.each([
    ['boq', 'BOQ'], ['attendance', 'LABOUR'], ['checklists', 'TASKS'],
  ] as [PageName, string][])('%s is refused when the %s module is disabled', async (name, moduleName) => {
    modules = ['SITES', 'BOQ', 'LABOUR', 'TASKS'].filter((value) => value !== moduleName)
    await expect(PAGES[name]()).rejects.toThrow(/NEXT_REDIRECT|NEXT_NOT_FOUND/)
    expect(tenantReads()).toBe(0)
  })

  it.each(PAGE_NAMES)('%s turns SUPER_ADMIN, which has no tenant context, away', async (name) => {
    mocks.requireUser.mockResolvedValue({ id: 'root', name: 'Root', email: 'root@x', role: 'SUPER_ADMIN' })
    await expect(PAGES[name]()).rejects.toThrow('NEXT_REDIRECT:/super-admin/dashboard')
    expect(tenantReads()).toBe(0)
  })

  it('never calls auth() for its data: a JWT company never reaches a query', async () => {
    mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN', 'company_2'))
    await PAGES.boq()
    expect(mocks.prisma.bOQItem.findMany.mock.calls[0][0].where).toMatchObject({ companyId: 'company_2' })
  })
})

describe('/boq', () => {
  it('lists only items on live sites of the live company', async () => {
    const html = await PAGES.boq()
    expect(html).toContain('Slab')
    expect(html).toContain('Mine')
    expect(html).not.toContain('BAD dead site')
    const itemsWhere = mocks.prisma.bOQItem.findMany.mock.calls[0][0].where
    expect(mocks.prisma.bOQItem.aggregate.mock.calls[0][0].where).toEqual(itemsWhere)
  })

  it('shows a field role only the BOQ of its assigned sites', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    const html = await PAGES.boq()
    expect(html).toContain('Mine')
    expect(html).not.toContain('Slab')
    expect(html).not.toContain('BAD dead site')
  })
})

describe('/mobile/attendance', () => {
  it('shows an admin the live company roster and sites, never deleted sites', async () => {
    await PAGES.attendance()
    const props = mocks.attendanceProps.mock.calls[0][0] as { otherWorkers: Row[]; sites: Row[]; initialContractors: Row[] }
    expect(props.otherWorkers.map((w) => w.id).sort()).toEqual(['w_1', 'w_mine'])
    expect(props.sites.map((s) => s.id).sort()).toEqual(['site_1', 'site_mine'])
    expect(props.initialContractors.map((c) => c.id).sort()).toEqual(['c_1', 'c_mine'])
  })

  it.each(['SITE_ENGINEER', 'SUPERVISOR'])('shows a %s only its assigned sites, workers and contractor logs', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: role === 'SUPERVISOR' ? ['site_mine'] : [] })
    await PAGES.attendance()
    const props = mocks.attendanceProps.mock.calls[0][0] as { otherWorkers: Row[]; sites: Row[]; initialContractors: Row[] }
    expect(props.sites.map((s) => s.id)).toEqual(['site_mine'])
    expect(props.otherWorkers.map((w) => w.id)).toEqual(['w_mine'])
    expect(props.initialContractors.map((c) => c.id)).toEqual(['c_mine'])
  })

  it('drops a default site the principal may not use', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    renderToStaticMarkup(await MobileAttendancePage({ searchParams: Promise.resolve({ siteId: 'site_1' }) }))
    expect(mocks.attendanceProps.mock.calls[0][0]).toMatchObject({ defaultSiteId: undefined })
  })
})

describe('/mobile/checklists', () => {
  it('never falls back to another membership when the live principal has no company', async () => {
    mocks.requireUser.mockResolvedValue({ ...principal('SITE_ENGINEER'), companyId: undefined })
    await expect(PAGES.checklists()).rejects.toThrow(/NEXT_REDIRECT/)
    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
    expect(mocks.checklistProps).not.toHaveBeenCalled()
  })

  it('refuses a field role on a live company site it is not assigned to', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    await expect(PAGES.checklists()).rejects.toThrow('NEXT_REDIRECT:/mobile/home')
    expect(mocks.prisma.projectChecklist.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.projectChecklist.findUnique).not.toHaveBeenCalled()
  })

  it.each(['site_dead', 'site_other'])('refuses site %s', async (siteId) => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    await expect(MobileChecklistsPage({ searchParams: Promise.resolve({ siteId }) })).rejects.toThrow('NEXT_REDIRECT:/mobile/home')
    expect(mocks.prisma.projectChecklist.findFirst).not.toHaveBeenCalled()
  })

  it('reads the checklist of an assigned site bound to the live company', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    renderToStaticMarkup(await MobileChecklistsPage({ searchParams: Promise.resolve({ siteId: 'site_mine' }) }))
    expect(mocks.prisma.projectChecklist.findFirst.mock.calls[0][0].where).toEqual({ siteId: 'site_mine', companyId: 'company_1' })
    expect(mocks.checklistProps).toHaveBeenCalledWith(expect.objectContaining({ siteId: 'site_mine' }))
  })
})

describe('dashboard layout', () => {
  const renderLayout = async () => renderToStaticMarkup(await DashboardLayout({ children: null }))

  it('sends a revoked principal to /login even with a valid JWT', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Account is inactive'))
    await expect(renderLayout()).rejects.toThrow('NEXT_REDIRECT:/login')
    expect(mocks.prisma.company.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.company.findUnique).not.toHaveBeenCalled()
    expect(mocks.badgeCount).not.toHaveBeenCalled()
  })

  it('renders the live principal and live company, never the JWT claims', async () => {
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER', 'company_2'))
    await renderLayout()
    expect(mocks.auth).not.toHaveBeenCalled()
    expect(mocks.prisma.company.findFirst).toHaveBeenCalledWith({
      where: { id: 'company_2', deletedAt: null },
      select: { name: true, plan: true, city: true },
    })
    const { sidebar } = mocks.shellProps.mock.calls[0][0] as { sidebar: { props: { user: Row } } }
    expect(sidebar.props.user).toMatchObject({ role: 'PROJECT_MANAGER', companyId: 'company_2', name: 'Live PROJECT_MANAGER' })
  })
})

describe('/sites', () => {
  it('never permanently deletes sites while rendering, and leaves soft-deleted rows alone', async () => {
    const card = { status: 'ACTIVE', progress: 0, spent: 0, budget: 0, location: 'Chennai', _count: { labour: 0, expenses: 0 } }
    mocks.prisma.site.findMany.mockResolvedValue([
      { ...SITES[0], ...card },
      // Soft deleted long ago: past the 15-day window, and must stay in the database.
      { ...SITES[2], ...card, deletedAt: new Date('2020-01-01') },
    ])
    renderToStaticMarkup(await SitesPage())
    expect(mocks.prisma.site.deleteMany).not.toHaveBeenCalled()
  })
})
