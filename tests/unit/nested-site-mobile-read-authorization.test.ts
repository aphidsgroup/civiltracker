import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for the nested site sections and the mobile site pages still reading from
 * the JWT, by bare URL id, or by role name.
 *
 * `/sites/[id]/{labour,materials,subcontractors,photos,checklist}` took the company from
 * `auth()` claims and checked no permission or module; they render in parallel with the
 * site layout, so the layout's gate never guarded them. Photos and the checklist read by
 * a bare site id across every tenant, the checklist resolved a deleted site, and the
 * labour site picker offered deleted sites. `/mobile/sites` checked no permission or
 * module, read the assignment from a membership regardless of its state, and showed
 * budget and spend to every role not named SITE_ENGINEER or SUPERVISOR.
 * `/mobile/sites/[id]` let a field role open any live site of the company, assigned or
 * not.
 *
 * Now each page runs `resolveTenantPageAccess` first and binds the URL id to one live
 * site of exactly the live company before any other read; the mobile pages share one
 * assigned-site policy; finance is selected and shown only under `expenses.view` and the
 * EXPENSES module.
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
    company: { findFirst: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    labour: { findMany: vi.fn(), count: vi.fn() },
    material: { findMany: vi.fn() },
    subcontractor: { findMany: vi.fn() },
    sitePhoto: { findMany: vi.fn() },
    projectChecklistTask: { findMany: vi.fn() },
    projectChecklist: { findFirst: vi.fn(), findUnique: vi.fn() },
    checklistTemplate: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('next/link', () => ({ default: ({ children }: { children?: ReactNode }) => children }))
vi.mock('@/app/(dashboard)/labour/LabourCardList', () => ({ LabourCardList: () => null }))
vi.mock('@/app/(dashboard)/subcontractors/SubCardList', () => ({ SubCardList: () => null }))
vi.mock('@/components/admin/PhotoApprovalCard', () => ({ PhotoApprovalCard: () => null }))
vi.mock('@/app/(dashboard)/sites/[id]/checklist/ChecklistClient', () => ({ ChecklistClient: () => null }))
vi.mock('@/components/responsive/ResponsiveTable', () => ({ default: () => null }))
vi.mock('@/components/responsive/MobileCardList', () => ({ default: () => null }))
vi.mock('@/actions/site-labour', () => ({ updateSiteLabour: vi.fn(), markSiteLabourPaid: vi.fn(), deactivateSiteLabour: vi.fn() }))
vi.mock('@/actions/site-subcontractors', () => ({ updateSiteSubcontractor: vi.fn(), markSiteSubcontractorPaid: vi.fn(), deactivateSiteSubcontractor: vi.fn() }))
vi.mock('@/actions/checklists', () => ({ enableChecklistForProject: vi.fn(), toggleTaskStatus: vi.fn(), toggleCategoryNeglect: vi.fn(), addCustomTask: vi.fn() }))

const { default: SiteLabourPage } = await import('@/app/(dashboard)/sites/[id]/labour/page')
const { default: SiteMaterialsPage } = await import('@/app/(dashboard)/sites/[id]/materials/page')
const { default: SiteSubcontractorsPage } = await import('@/app/(dashboard)/sites/[id]/subcontractors/page')
const { default: SitePhotosPage } = await import('@/app/(dashboard)/sites/[id]/photos/page')
const { default: ProjectChecklistPage } = await import('@/app/(dashboard)/sites/[id]/checklist/page')
const { default: MobileSitesPage } = await import('@/app/(mobile)/mobile/sites/page')
const { default: MobileSingleSitePage } = await import('@/app/(mobile)/mobile/sites/[id]/page')

const ENGINEER_ID = 'user_site_engineer'
const SUPERVISOR_ID = 'user_supervisor'

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', name: 'Tower A', location: 'Chennai', status: 'ACTIVE', deletedAt: null, budget: 1000000, spent: 250000 },
  { id: 'site_assigned', companyId: 'company_1', name: 'Assigned Tower', location: 'Chennai', status: 'ACTIVE', deletedAt: null, budget: 1000000, spent: 250000, assignedEngineerId: ENGINEER_ID },
  { id: 'site_engineer', companyId: 'company_1', name: 'Engineer Tower', location: 'Chennai', status: 'ACTIVE', deletedAt: null, budget: 0, spent: 0, engineerId: SUPERVISOR_ID },
  { id: 'site_member', companyId: 'company_1', name: 'Member Tower', location: 'Chennai', status: 'ACTIVE', deletedAt: null, budget: 0, spent: 0 },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', location: 'x', status: 'ACTIVE', deletedAt: new Date('2026-01-01'), budget: 0, spent: 0, assignedEngineerId: ENGINEER_ID },
  { id: 'site_other', companyId: 'company_2', name: 'Other Tenant Tower', location: 'x', status: 'ACTIVE', deletedAt: null, budget: 0, spent: 0, engineerId: ENGINEER_ID },
]

const MEMBERS: Row[] = [
  { userId: ENGINEER_ID, companyId: 'company_1', isActive: true, siteIds: ['site_member', 'site_other', 'site_dead'] },
  // A deactivated membership still names a site; it must grant nothing.
  { userId: SUPERVISOR_ID, companyId: 'company_1', isActive: false, siteIds: ['site_1'] },
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
  /** A module set that enables some other section but not this page's. */
  otherModules: string[]
  /** Site-scoped nested pages leave for /sites; the mobile detail answers not found. */
  siteScoped?: RegExp
}

const NON_SITE_ROLES = ['ACCOUNTANT', 'PURCHASE_MANAGER', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT']

const PAGES: PageCase[] = [
  {
    name: 'site labour',
    module: 'LABOUR',
    run: (id = 'site_1') => SiteLabourPage({ params: P({ id }) }),
    deniedRoles: ['SITE_ENGINEER', 'SUPERVISOR', 'ACCOUNTANT', 'PURCHASE_MANAGER', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'],
    otherModules: ['sites', 'materials'],
    siteScoped: /NEXT_REDIRECT:\/sites$/,
  },
  {
    name: 'site materials',
    module: 'MATERIALS',
    run: (id = 'site_1') => SiteMaterialsPage({ params: P({ id }) }),
    deniedRoles: ['ACCOUNTANT', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'],
    otherModules: ['sites', 'labour'],
    siteScoped: /NEXT_REDIRECT:\/sites$/,
  },
  {
    name: 'site subcontractors',
    module: 'MATERIALS',
    run: (id = 'site_1') => SiteSubcontractorsPage({ params: P({ id }) }),
    deniedRoles: ['PROJECT_MANAGER', 'SITE_ENGINEER', 'SUPERVISOR', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'],
    otherModules: ['sites', 'labour', 'expenses'],
    siteScoped: /NEXT_REDIRECT:\/sites$/,
  },
  {
    name: 'site photos',
    module: 'SITES',
    run: (id = 'site_1') => SitePhotosPage({ params: P({ id }) }),
    deniedRoles: NON_SITE_ROLES,
    otherModules: ['labour', 'materials'],
    siteScoped: /NEXT_REDIRECT:\/sites$/,
  },
  {
    name: 'site checklist',
    module: 'SITES',
    run: (id = 'site_1') => ProjectChecklistPage({ params: P({ id }) }),
    deniedRoles: NON_SITE_ROLES,
    otherModules: ['labour', 'materials'],
    siteScoped: /NEXT_REDIRECT:\/sites$/,
  },
  {
    name: 'mobile sites list',
    module: 'SITES',
    run: () => MobileSitesPage(),
    deniedRoles: NON_SITE_ROLES,
    otherModules: ['expenses', 'labour'],
  },
  {
    name: 'mobile site detail',
    module: 'SITES',
    run: (id = 'site_1') => MobileSingleSitePage({ params: P({ id }) }),
    deniedRoles: NON_SITE_ROLES,
    otherModules: ['expenses', 'labour'],
    siteScoped: /NEXT_NOT_FOUND/,
  },
]

type Delegate = Record<string, ReturnType<typeof vi.fn>>

/** Every data read; the module lookup on `company` is the gate's own, checked separately. */
function dataReads() {
  return Object.entries(mocks.prisma as Record<string, Delegate>)
    .filter(([model]) => model !== 'company')
    .flatMap(([model, delegate]) => Object.entries(delegate).map(([op, fn]) => ({ name: `${model}.${op}`, fn })))
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
}

function wheres(fn: ReturnType<typeof vi.fn>) {
  return fn.mock.calls.map((call) => (call[0] as { where?: Row } | undefined)?.where)
}

function firstCall(fn: ReturnType<typeof vi.fn>) {
  return fn.mock.invocationCallOrder[0]
}

/** Prisma leaves a column out when its select flag is absent or false. */
function expectNoFinanceSelected(select: Row | undefined) {
  expect(select).toBeDefined()
  expect(select?.budget ?? false).toBe(false)
  expect(select?.spent ?? false).toBe(false)
}

async function render(element: Promise<unknown>) {
  return renderToStaticMarkup((await element) as ReactElement)
}

const SECONDARY_READS = [
  mocks.prisma.labour.findMany,
  mocks.prisma.material.findMany,
  mocks.prisma.subcontractor.findMany,
  mocks.prisma.sitePhoto.findMany,
  mocks.prisma.projectChecklistTask.findMany,
  mocks.prisma.projectChecklist.findFirst,
  mocks.prisma.checklistTemplate.findMany,
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
  mocks.prisma.companyMember.findFirst.mockImplementation(inMemoryDelegate(MEMBERS).findFirst)

  for (const fn of SECONDARY_READS) fn.mockResolvedValue([])
  mocks.prisma.projectChecklist.findFirst.mockResolvedValue(null)
  mocks.prisma.labour.count.mockResolvedValue(3)
})

describe.each(PAGES)('$name page gate', (page) => {
  it('refuses a revoked principal before any read and never consults the JWT itself', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    await expect(page.run()).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.auth).not.toHaveBeenCalled()
    expectNoReads()
  })

  it('sends a SUPER_ADMIN, which carries no tenant context, away before any read', async () => {
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

  it(`is not opened by other modules while ${page.module} is off`, async () => {
    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: page.otherModules })

    await expect(page.run()).rejects.toThrow(/NEXT_REDIRECT|NEXT_NOT_FOUND/)
    expectNoDataReads()
  })

  it('reads only under the live company, never the JWT company', async () => {
    await page.run()

    const scoped = dataReads().flatMap(({ fn }) => wheres(fn)).filter(Boolean)
    expect(scoped.length).toBeGreaterThan(0)
    expect(JSON.stringify(scoped)).not.toContain('company_jwt')
    expect(JSON.stringify(scoped)).not.toContain('jwt_user')
  })

  if (page.siteScoped) {
    const leaves = page.siteScoped

    it.each(['site_other', 'site_dead', 'site_missing'])('resolves %s as the one exact live company site read, and reads nothing else', async (id) => {
      await expect(page.run(id)).rejects.toThrow(leaves)

      expect(calledReads()).toEqual(['site.findFirst'])
      expect(wheres(mocks.prisma.site.findFirst)).toEqual([{ id, companyId: 'company_1', deletedAt: null }])
    })

    it('never leaks a known foreign site to an admin of another company', async () => {
      mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN', 'company_2'))

      await expect(page.run('site_1')).rejects.toThrow(leaves)
      expect(calledReads()).toEqual(['site.findFirst'])
    })

    it('resolves the site before any secondary read', async () => {
      await page.run('site_1')

      const siteRead = firstCall(mocks.prisma.site.findFirst)
      expect(siteRead).toBeDefined()
      for (const { fn } of dataReads()) {
        if (fn === mocks.prisma.site.findFirst || fn.mock.calls.length === 0) continue
        expect(firstCall(fn)).toBeGreaterThan(siteRead)
      }
    })
  }
})

describe('SiteLabourPage', () => {
  it('reads the labour of the resolved site and offers only live sites of the company', async () => {
    await SiteLabourPage({ params: P({ id: 'site_1' }) })

    expect(wheres(mocks.prisma.labour.findMany)).toEqual([{ companyId: 'company_1', siteId: 'site_1' }])
    expect(wheres(mocks.prisma.site.findMany)).toEqual([{ companyId: 'company_1', deletedAt: null }])
  })
})

describe('SiteMaterialsPage', () => {
  it('lets a SITE_ENGINEER, who holds materials.view, read the materials of the resolved site', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    await SiteMaterialsPage({ params: P({ id: 'site_1' }) })

    expect(wheres(mocks.prisma.material.findMany)).toEqual([{ companyId: 'company_1', siteId: 'site_1', isActive: true }])
  })
})

describe('SiteSubcontractorsPage', () => {
  it('lets an ACCOUNTANT, who holds vendors.view, read subcontractors of the live company', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))

    await SiteSubcontractorsPage({ params: P({ id: 'site_1' }) })

    expect(wheres(mocks.prisma.subcontractor.findMany)[0]).toMatchObject({ companyId: 'company_1' })
  })
})

describe('SitePhotosPage', () => {
  it('binds every photo and task read to the live company and the resolved site', async () => {
    await SitePhotosPage({ params: P({ id: 'site_1' }) })

    expect(wheres(mocks.prisma.projectChecklistTask.findMany)[0]).toMatchObject({
      category: { stage: { checklist: { siteId: 'site_1', companyId: 'company_1' } } },
    })
    const photoWheres = wheres(mocks.prisma.sitePhoto.findMany)
    expect(photoWheres).toHaveLength(2)
    for (const where of photoWheres) expect(where).toMatchObject({ siteId: 'site_1', companyId: 'company_1' })
  })
})

describe('ProjectChecklistPage', () => {
  it('reads the checklist only for the resolved site under the live company', async () => {
    await render(ProjectChecklistPage({ params: P({ id: 'site_1' }) }))

    expect(mocks.prisma.site.findUnique).not.toHaveBeenCalled()
    expect(mocks.prisma.projectChecklist.findUnique).not.toHaveBeenCalled()
    expect(wheres(mocks.prisma.projectChecklist.findFirst)).toEqual([{ siteId: 'site_1', companyId: 'company_1' }])
    expect(wheres(mocks.prisma.checklistTemplate.findMany)).toEqual([{ OR: [{ isGlobal: true }, { companyId: 'company_1' }] }])
  })
})

describe('MobileSitesPage', () => {
  it('lists every live site of the live company to an admin, with budget and spend', async () => {
    const html = await render(MobileSitesPage())

    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
    expect(wheres(mocks.prisma.site.findMany)).toEqual([{ companyId: 'company_1', deletedAt: null }])
    expect(mocks.prisma.site.findMany.mock.calls[0][0].select).toMatchObject({ budget: true, spent: true })
    expect(html).toContain('Tower A')
    expect(html).toContain('Budget Spent')
    expect(html).not.toContain('Gone')
    expect(html).not.toContain('Other Tenant Tower')
  })

  it('lists to a SITE_ENGINEER only its assigned live sites of the live company, from its active membership', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    const html = await render(MobileSitesPage())

    expect(wheres(mocks.prisma.companyMember.findFirst)).toEqual([{ userId: ENGINEER_ID, companyId: 'company_1', isActive: true }])
    expect(html).toContain('Assigned Tower')
    expect(html).toContain('Member Tower')
    expect(html).not.toContain('Tower A')
    expect(html).not.toContain('Engineer Tower')
    expect(html).not.toContain('Gone')
    expect(html).not.toContain('Other Tenant Tower')
  })

  it('grants a SUPERVISOR nothing from a deactivated membership', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))

    const html = await render(MobileSitesPage())

    expect(html).toContain('Engineer Tower')
    expect(html).not.toContain('Tower A')
  })

  it.each(['SITE_ENGINEER', 'SUPERVISOR'])('selects and shows no budget or spend to a %s, which lacks expenses.view', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    const html = await render(MobileSitesPage())

    const select = mocks.prisma.site.findMany.mock.calls[0][0].select
    expectNoFinanceSelected(select)
    expect(html).not.toContain('Budget Spent')
  })

  it('selects and shows no budget or spend to an admin when the EXPENSES module is off', async () => {
    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: ['sites'] })

    const html = await render(MobileSitesPage())

    const select = mocks.prisma.site.findMany.mock.calls[0][0].select
    expectNoFinanceSelected(select)
    expect(html).toContain('Tower A')
    expect(html).not.toContain('Budget Spent')
  })
})

describe('MobileSingleSitePage', () => {
  it.each(['site_assigned', 'site_member'])('opens the assigned live site %s to a SITE_ENGINEER, without finance', async (id) => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    const html = await render(MobileSingleSitePage({ params: P({ id }) }))

    expect(html).toContain('Tower')
    expect(html).not.toContain('Total Budget')
    const select = mocks.prisma.site.findFirst.mock.calls[0][0].select
    expectNoFinanceSelected(select)
  })

  it.each(['site_1', 'site_engineer', 'site_dead', 'site_other', 'site_missing'])('refuses a SITE_ENGINEER the unassigned, deleted or foreign site %s, reading nothing past the site', async (id) => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    await expect(MobileSingleSitePage({ params: P({ id }) })).rejects.toThrow('NEXT_NOT_FOUND')

    expect(calledReads()).toEqual(['companyMember.findFirst', 'site.findFirst'])
    expect(wheres(mocks.prisma.companyMember.findFirst)).toEqual([{ userId: ENGINEER_ID, companyId: 'company_1', isActive: true }])
    expect(wheres(mocks.prisma.site.findFirst)[0]).toMatchObject({ id, companyId: 'company_1', deletedAt: null })
  })

  it('refuses a SUPERVISOR a site named only by its deactivated membership', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))

    await expect(MobileSingleSitePage({ params: P({ id: 'site_1' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.prisma.labour.count).not.toHaveBeenCalled()
  })

  it('opens to a SUPERVISOR the site it is the engineer of', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))

    const html = await render(MobileSingleSitePage({ params: P({ id: 'site_engineer' }) }))

    expect(html).toContain('Engineer Tower')
  })

  it('reads no assignment for a field role when the SITES module is off', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: ['expenses'] })

    await expect(MobileSingleSitePage({ params: P({ id: 'site_assigned' }) })).rejects.toThrow(/NEXT_REDIRECT|NEXT_NOT_FOUND/)
    expectNoDataReads()
  })

  it('opens any live company site to an admin without an assignment lookup, and selects finance under expenses.view', async () => {
    const html = await render(MobileSingleSitePage({ params: P({ id: 'site_1' }) }))

    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.site.findFirst.mock.calls[0][0].select).toMatchObject({ budget: true, spent: true })
    expect(html).toContain('Total Budget')
  })

  it('selects no finance for an admin when the EXPENSES module is off', async () => {
    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: ['sites'] })

    const html = await render(MobileSingleSitePage({ params: P({ id: 'site_1' }) }))

    const select = mocks.prisma.site.findFirst.mock.calls[0][0].select
    expectNoFinanceSelected(select)
    expect(html).not.toContain('Total Budget')
  })
})
