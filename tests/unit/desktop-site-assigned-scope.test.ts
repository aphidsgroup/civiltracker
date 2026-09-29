import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for the desktop site pages widening a field role to every site of its
 * company.
 *
 * `/sites`, the shared `/sites/[id]` layout and every nested section bound a URL site id
 * to *any* live site of the live company. A SITE_ENGINEER or SUPERVISOR, whose mobile
 * pages and actions already act only on the sites it is the engineer of or that its
 * active membership lists, could list and open every other site of the company from the
 * desktop.
 *
 * Now each page and the layout resolve the site under `assignedSiteWhere` — the same
 * live-principal scope the mobile pages and actions use — before any other read. An
 * unassigned, deleted or foreign site leaves for /sites having read only the membership
 * and the one site lookup. Privileged roles keep every live site of their company.
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
  countSitePendingApprovalsForViewer: vi.fn(),
  prisma: {
    company: { findFirst: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    expense: { findMany: vi.fn(), aggregate: vi.fn() },
    dailyProgressReport: { findMany: vi.fn() },
    labour: { findMany: vi.fn() },
    labourAttendance: { findMany: vi.fn() },
    contractorAttendance: { findMany: vi.fn() },
    sitePhoto: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
    material: { findMany: vi.fn() },
    subcontractor: { findMany: vi.fn() },
    projectChecklist: { findFirst: vi.fn(), findUnique: vi.fn() },
    projectChecklistTask: { findMany: vi.fn() },
    checklistTemplate: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('next/link', () => ({ default: ({ children }: { children?: ReactNode }) => children }))
vi.mock('@/lib/approvals/valid-reads', () => ({ countSitePendingApprovalsForViewer: mocks.countSitePendingApprovalsForViewer }))
vi.mock('@/components/bills/BillApprovalList', () => ({ default: () => null }))
vi.mock('@/components/client/EditSiteModal', () => ({ EditSiteModal: () => null }))
vi.mock('@/components/client/SiteTabsNav', () => ({ SiteTabsNav: () => null }))
vi.mock('@/components/client/SiteActions', () => ({ SiteCardActions: () => null }))
vi.mock('@/app/(dashboard)/labour/LabourCardList', () => ({ LabourCardList: () => null }))
vi.mock('@/app/(dashboard)/subcontractors/SubCardList', () => ({ SubCardList: () => null }))
vi.mock('@/components/admin/PhotoApprovalCard', () => ({ PhotoApprovalCard: () => null }))
vi.mock('@/app/(dashboard)/sites/[id]/checklist/ChecklistClient', () => ({ ChecklistClient: () => null }))
vi.mock('@/components/responsive/ResponsiveTable', () => ({ default: () => null }))
vi.mock('@/components/responsive/MobileCardList', () => ({ default: () => null }))
vi.mock('@/actions/site-labour', () => ({ updateSiteLabour: vi.fn(), markSiteLabourPaid: vi.fn(), deactivateSiteLabour: vi.fn() }))
vi.mock('@/actions/site-subcontractors', () => ({ updateSiteSubcontractor: vi.fn(), markSiteSubcontractorPaid: vi.fn(), deactivateSiteSubcontractor: vi.fn() }))
vi.mock('@/actions/checklists', () => ({ enableChecklistForProject: vi.fn(), toggleTaskStatus: vi.fn(), toggleCategoryNeglect: vi.fn(), addCustomTask: vi.fn() }))

const { default: SitesPage } = await import('@/app/(dashboard)/sites/page')
const { default: SiteLayout } = await import('@/app/(dashboard)/sites/[id]/layout')
const { default: SiteOverviewPage } = await import('@/app/(dashboard)/sites/[id]/page')
const { default: SiteActivityPage } = await import('@/app/(dashboard)/sites/[id]/activity/page')
const { default: SiteBillsPage } = await import('@/app/(dashboard)/sites/[id]/bills/page')
const { default: ProjectChecklistPage } = await import('@/app/(dashboard)/sites/[id]/checklist/page')
const { default: SiteDprPage } = await import('@/app/(dashboard)/sites/[id]/dpr/page')
const { default: SiteExpensesPage } = await import('@/app/(dashboard)/sites/[id]/expenses/page')
const { default: SiteLabourPage } = await import('@/app/(dashboard)/sites/[id]/labour/page')
const { default: SiteMaterialsPage } = await import('@/app/(dashboard)/sites/[id]/materials/page')
const { default: SitePhotosPage } = await import('@/app/(dashboard)/sites/[id]/photos/page')
const { default: SiteSubcontractorsPage } = await import('@/app/(dashboard)/sites/[id]/subcontractors/page')

const ENGINEER_ID = 'user_site_engineer'
const SUPERVISOR_ID = 'user_supervisor'
const RECENTLY = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)

/** The relation data the pages render (overview's latest DPR, the index card counts). */
const RENDERED = { dprs: [], _count: { labour: 0, expenses: 0 } }

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', name: 'Tower A', status: 'ACTIVE', deletedAt: null },
  { id: 'site_assigned', companyId: 'company_1', name: 'Assigned Tower', status: 'ACTIVE', deletedAt: null, assignedEngineerId: ENGINEER_ID },
  { id: 'site_engineer', companyId: 'company_1', name: 'Engineer Tower', status: 'ACTIVE', deletedAt: null, engineerId: SUPERVISOR_ID },
  { id: 'site_member', companyId: 'company_1', name: 'Member Tower', status: 'ACTIVE', deletedAt: null },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', status: 'ACTIVE', deletedAt: RECENTLY, assignedEngineerId: ENGINEER_ID },
  { id: 'site_other', companyId: 'company_2', name: 'Other Tenant Tower', status: 'ACTIVE', deletedAt: null, assignedEngineerId: ENGINEER_ID },
].map((site) => ({ ...RENDERED, ...site }))

const MEMBERS: Row[] = [
  { userId: ENGINEER_ID, companyId: 'company_1', isActive: true, siteIds: ['site_member', 'site_other', 'site_dead'] },
  // A deactivated membership still names a site; it must grant nothing.
  { userId: SUPERVISOR_ID, companyId: 'company_1', isActive: false, siteIds: ['site_1'] },
]

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: `${role} Person`, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

const P = <T,>(value: T) => Promise.resolve(value)

type Delegate = Record<string, ReturnType<typeof vi.fn>>

function dataReads() {
  const prismaReads = Object.entries(mocks.prisma as Record<string, Delegate>)
    .filter(([model]) => model !== 'company')
    .flatMap(([model, delegate]) => Object.entries(delegate).map(([op, fn]) => ({ name: `${model}.${op}`, fn })))
  return [...prismaReads, { name: 'countSitePendingApprovalsForViewer', fn: mocks.countSitePendingApprovalsForViewer }]
}

function calledReads() {
  return dataReads().filter(({ fn }) => fn.mock.calls.length > 0).map(({ name }) => name)
}

function wheres(fn: ReturnType<typeof vi.fn>) {
  return fn.mock.calls.map((call) => (call[0] as { where?: Row } | undefined)?.where)
}

type SitePage = { name: string; run: (id: string) => Promise<unknown> }

/** Every independent site page a field role holds the permission for. */
const FIELD_PAGES: SitePage[] = [
  { name: 'site layout', run: (id) => SiteLayout({ children: null, params: P({ id }) }) },
  { name: 'site overview', run: (id) => SiteOverviewPage({ params: P({ id }) }) },
  { name: 'site activity', run: (id) => SiteActivityPage({ params: P({ id }), searchParams: P({}) }) },
  { name: 'site checklist', run: (id) => ProjectChecklistPage({ params: P({ id }) }) },
  { name: 'site dpr', run: (id) => SiteDprPage({ params: P({ id }) }) },
  { name: 'site materials', run: (id) => SiteMaterialsPage({ params: P({ id }) }) },
  { name: 'site photos', run: (id) => SitePhotosPage({ params: P({ id }) }) },
]

/** Site pages whose permission no field role holds; they still bind under the same scope. */
const PRIVILEGED_PAGES: SitePage[] = [
  { name: 'site bills', run: (id) => SiteBillsPage({ params: P({ id }), searchParams: P({}) }) },
  { name: 'site expenses', run: (id) => SiteExpensesPage({ params: P({ id }), searchParams: P({}) }) },
  { name: 'site labour', run: (id) => SiteLabourPage({ params: P({ id }) }) },
  { name: 'site subcontractors', run: (id) => SiteSubcontractorsPage({ params: P({ id }) }) },
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

  for (const fn of [
    mocks.prisma.expense.findMany, mocks.prisma.dailyProgressReport.findMany, mocks.prisma.labour.findMany,
    mocks.prisma.labourAttendance.findMany, mocks.prisma.contractorAttendance.findMany, mocks.prisma.sitePhoto.findMany,
    mocks.prisma.auditLog.findMany, mocks.prisma.material.findMany, mocks.prisma.subcontractor.findMany,
    mocks.prisma.projectChecklistTask.findMany, mocks.prisma.checklistTemplate.findMany,
  ]) fn.mockResolvedValue([])
  mocks.prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
  mocks.prisma.projectChecklist.findFirst.mockResolvedValue(null)
  mocks.prisma.projectChecklist.findUnique.mockResolvedValue(null)
  mocks.countSitePendingApprovalsForViewer.mockResolvedValue(null)
})

describe.each(FIELD_PAGES)('$name under the assigned-site scope', (page) => {
  it.each(['site_1', 'site_engineer', 'site_dead', 'site_other', 'site_missing'])(
    'turns a SITE_ENGINEER away from the unassigned, deleted or foreign site %s, reading only its active membership and the one site',
    async (id) => {
      mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

      await expect(page.run(id)).rejects.toThrow('NEXT_REDIRECT:/sites')

      expect(calledReads()).toEqual(['companyMember.findFirst', 'site.findFirst'])
      expect(wheres(mocks.prisma.companyMember.findFirst)).toEqual([{ userId: ENGINEER_ID, companyId: 'company_1', isActive: true }])
      expect(wheres(mocks.prisma.site.findFirst)[0]).toMatchObject({ id, companyId: 'company_1', deletedAt: null })
      expect(mocks.prisma.site.findUnique).not.toHaveBeenCalled()
    },
  )

  it('opens to a SITE_ENGINEER the site it is only the assignedEngineer of', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    await expect(page.run('site_assigned')).resolves.toBeDefined()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('opens to a SITE_ENGINEER a site listed only by its active membership siteIds', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    await expect(page.run('site_member')).resolves.toBeDefined()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('opens to a SUPERVISOR the site it is the engineer of, but nothing from a deactivated membership', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))

    await expect(page.run('site_engineer')).resolves.toBeDefined()
    await expect(page.run('site_1')).rejects.toThrow('NEXT_REDIRECT:/sites')
  })

  it('does not widen a field role with no assignment at all to the company', async () => {
    mocks.requireUser.mockResolvedValue({ ...principal('SITE_ENGINEER'), id: 'user_unassigned' })

    await expect(page.run('site_1')).rejects.toThrow('NEXT_REDIRECT:/sites')
    expect(calledReads()).toEqual(['companyMember.findFirst', 'site.findFirst'])
  })

  it('opens any live company site to an admin, with no assignment lookup', async () => {
    await expect(page.run('site_1')).resolves.toBeDefined()

    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
    expect(wheres(mocks.prisma.site.findFirst)[0]).toEqual({ id: 'site_1', companyId: 'company_1', deletedAt: null })
  })
})

describe.each(PRIVILEGED_PAGES)('$name under the assigned-site scope', (page) => {
  it('binds the site for an admin exactly to a live site of the live company, with no assignment lookup', async () => {
    await expect(page.run('site_1')).resolves.toBeDefined()

    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
    expect(wheres(mocks.prisma.site.findFirst)[0]).toEqual({ id: 'site_1', companyId: 'company_1', deletedAt: null })
  })

  it.each(['site_dead', 'site_other'])('leaves for /sites on %s having read only the site', async (id) => {
    await expect(page.run(id)).rejects.toThrow('NEXT_REDIRECT:/sites')
    expect(calledReads()).toEqual(['site.findFirst'])
  })
})

describe('SitesPage under the assigned-site scope', () => {
  async function listed() {
    await SitesPage()
    return (await mocks.prisma.site.findMany.mock.results[0].value as Row[]).map((site) => site.id)
  }

  it('lists to a SITE_ENGINEER only its assignedEngineer and active-membership live sites of the live company', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    expect((await listed()).sort()).toEqual(['site_assigned', 'site_member'])
    expect(wheres(mocks.prisma.companyMember.findFirst)).toEqual([{ userId: ENGINEER_ID, companyId: 'company_1', isActive: true }])
  })

  it('lists to a SUPERVISOR only the site it is the engineer of, ignoring its deactivated membership', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))

    expect(await listed()).toEqual(['site_engineer'])
  })

  it('lists nothing to a field role with no assignment, never the whole company', async () => {
    mocks.requireUser.mockResolvedValue({ ...principal('SITE_ENGINEER'), id: 'user_unassigned' })

    expect(await listed()).toEqual([])
  })

  it('keeps the admin view of every live and recently deleted site of the live company', async () => {
    expect((await listed()).sort()).toEqual(['site_1', 'site_assigned', 'site_dead', 'site_engineer', 'site_member'])
    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
  })
})
