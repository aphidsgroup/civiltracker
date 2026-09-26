import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for the site overview page found at f3c09f6.
 *
 * The page trusted the JWT company claim, so a revoked membership or demoted role kept
 * reading site financials until the token expired, and it counted pending approvals for
 * every visitor — including roles that hold no `approvals.view` and may not know the
 * approval queue exists. The shared count helper carried no caller permission at all.
 *
 * Now: the live principal is resolved first, `sites.view` is checked before any query,
 * the site is looked up under the principal's exact company and never soft deleted, and
 * the pending-approval figure is computed — and rendered — only for `approvals.view`.
 * SUPER_ADMIN is explicit: it carries no company context, so this tenant page turns it
 * away to the platform dashboard before any read.
 *
 * `@/lib/permissions` is the real matrix.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireUser: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  prisma: {
    company: { findFirst: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findFirst: vi.fn(), findUnique: vi.fn() },
    labourAttendance: { findMany: vi.fn() },
    contractorAttendance: { findMany: vi.fn() },
    projectChecklist: { findUnique: vi.fn() },
    expense: { aggregate: vi.fn(), findMany: vi.fn() },
    approval: { findMany: vi.fn(), count: vi.fn() },
    purchaseOrder: { findMany: vi.fn() },
    dailyProgressReport: { findMany: vi.fn() },
    material: { findMany: vi.fn() },
    salaryRun: { findMany: vi.fn() },
    document: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))

const { default: SiteOverviewPage } = await import('@/app/(dashboard)/sites/[id]/page')
const { countSitePendingApprovalsForViewer } = await import('@/lib/approvals/valid-reads')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', name: 'Tower A', location: 'Chennai', deletedAt: null, budget: 1000, progress: 10, dprs: [] },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', location: 'Chennai', deletedAt: new Date('2026-01-01'), budget: 0, progress: 0, dprs: [] },
  { id: 'site_other', companyId: 'company_2', name: 'Other tenant', location: 'Madurai', deletedAt: null, budget: 0, progress: 0, dprs: [] },
]

/** Active company_1 memberships assigning the field roles below to site_1. */
const MEMBERS: Row[] = [
  { userId: 'user_site_engineer', companyId: 'company_1', isActive: true, siteIds: ['site_1'] },
  { userId: 'user_supervisor', companyId: 'company_1', isActive: true, siteIds: ['site_1'] },
]

const siteById = new Map(SITES.map((site) => [site.id as string, site]))

function approval(id: string, overrides: Row = {}): Row {
  const row: Row = {
    id,
    companyId: 'company_1',
    siteId: 'site_1',
    entityType: 'EXPENSE',
    entityId: 'expense_1',
    currentStatus: 'PENDING',
    deletedAt: null,
    ...overrides,
  }
  row.site = siteById.get(row.siteId as string) ?? null
  return row
}

const APPROVALS: Row[] = [
  approval('ok_1'),
  approval('ok_2'),
  approval('bad_orphan', { entityId: 'expense_missing' }),
  // Stamped company_1, pinned to company_2's live site: never counted under site_1 or anywhere.
  approval('bad_cross_bound', { siteId: 'site_other', entityId: 'expense_forged' }),
  approval('bad_deleted', { deletedAt: new Date('2026-02-01') }),
]

const EXPENSES: Row[] = [
  { id: 'expense_1', companyId: 'company_1', siteId: 'site_1', deletedAt: null },
  { id: 'expense_forged', companyId: 'company_1', siteId: 'site_other', deletedAt: null },
]

const siteRelation = (row: Row, key: string) => (key === 'site' ? (siteById.get(row.siteId as string) ?? null) : undefined)

function principal(role: string, companyId: string | undefined = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

const SUPER_ADMIN = { id: 'root_1', name: 'Root', email: 'root@platform.test', role: 'SUPER_ADMIN' }

/** Active members without `sites.view`. */
const ROLES_WITHOUT_SITE_VIEW = ['ACCOUNTANT', 'PURCHASE_MANAGER', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'] as const

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function render(id = 'site_1') {
  return renderToStaticMarkup(await SiteOverviewPage(params(id)))
}

function expectNoSiteDataReads() {
  expect(mocks.prisma.labourAttendance.findMany).not.toHaveBeenCalled()
  expect(mocks.prisma.contractorAttendance.findMany).not.toHaveBeenCalled()
  expect(mocks.prisma.projectChecklist.findUnique).not.toHaveBeenCalled()
  expect(mocks.prisma.expense.aggregate).not.toHaveBeenCalled()
}

function expectNoApprovalReads() {
  expect(mocks.prisma.approval.findMany).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.count).not.toHaveBeenCalled()
}

function expectNoReads() {
  expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.site.findUnique).not.toHaveBeenCalled()
  expectNoSiteDataReads()
  expectNoApprovalReads()
}

beforeEach(() => {
  vi.clearAllMocks()
  // The JWT always claims an admin of company_1; only the live principal decides.
  mocks.auth.mockResolvedValue({ user: { id: 'user_1', companyId: 'company_1', role: 'COMPANY_ADMIN' } })
  mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

  // The page gate reads the live company's modules before any site read; SITES is enabled.
  mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: { SITES: true } })
  mocks.prisma.companyMember.findFirst.mockImplementation(inMemoryDelegate(MEMBERS).findFirst)
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)
  mocks.prisma.labourAttendance.findMany.mockResolvedValue([])
  mocks.prisma.contractorAttendance.findMany.mockResolvedValue([])
  mocks.prisma.projectChecklist.findUnique.mockResolvedValue(null)
  mocks.prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 } })

  const approvals = inMemoryDelegate(APPROVALS, siteRelation)
  mocks.prisma.approval.findMany.mockImplementation(approvals.findMany)
  mocks.prisma.approval.count.mockImplementation(approvals.count)
  mocks.prisma.expense.findMany.mockImplementation(inMemoryDelegate(EXPENSES).findMany)
  for (const name of ['purchaseOrder', 'dailyProgressReport', 'material', 'salaryRun', 'document'] as const) {
    mocks.prisma[name].findMany.mockResolvedValue([])
  }
})

describe('SiteOverviewPage authorization', () => {
  it('refuses a revoked principal before any read, even with a valid JWT', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    await expect(render()).rejects.toThrow(/UNAUTHORIZED/)
    expectNoReads()
  })

  it.each(ROLES_WITHOUT_SITE_VIEW)('turns an active %s away before any read', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    await expect(render()).rejects.toThrow(/NEXT_REDIRECT/)
    expectNoReads()
  })

  it('turns a SUPER_ADMIN, which carries no company context, away before any read', async () => {
    mocks.requireUser.mockResolvedValue(SUPER_ADMIN)

    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/super-admin/dashboard')
    expectNoReads()
  })

  it('looks the site up under the live company, not the JWT claim', async () => {
    // The JWT still says company_1, but the live membership is company_2.
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER', 'company_2'))

    await expect(render('site_1')).rejects.toThrow('NEXT_REDIRECT:/sites')

    // No active company_2 membership, so the field role is scoped to sites it engineers.
    expect(mocks.prisma.site.findFirst.mock.calls[0][0].where).toEqual({
      id: 'site_1',
      companyId: 'company_2',
      deletedAt: null,
      OR: [{ assignedEngineerId: 'user_site_engineer' }, { engineerId: 'user_site_engineer' }],
    })
    expectNoSiteDataReads()
    expectNoApprovalReads()
  })

  it.each([
    ['another tenant', 'site_other'],
    ['a soft-deleted', 'site_dead'],
    ['a missing', 'site_missing'],
  ])('refuses %s site before any site data or approval read', async (_label, id) => {
    await expect(render(id)).rejects.toThrow('NEXT_REDIRECT:/sites')

    expectNoSiteDataReads()
    expectNoApprovalReads()
  })

  it('shows no pending-approval figure, and runs no approval query, for a role without approvals.view', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))

    const html = await render()

    expect(html).toContain('Overall progress')
    expect(html).not.toContain('Pending approvals')
    expectNoApprovalReads()
  })

  it('counts only valid pending approvals of this exact site for an approvals.view role', async () => {
    const html = await render()

    expect(html).toContain('Pending approvals')
    expect(html).toMatch(/>2<\/div><div[^>]*>Pending approvals/)
  })
})

describe('countSitePendingApprovalsForViewer', () => {
  const SITE_1 = { id: 'site_1', companyId: 'company_1' }

  it('returns no figure and queries nothing without approvals.view', async () => {
    await expect(countSitePendingApprovalsForViewer(principal('SUPERVISOR'), SITE_1)).resolves.toBeNull()
    await expect(countSitePendingApprovalsForViewer(principal('CLIENT'), SITE_1)).resolves.toBeNull()
    expectNoApprovalReads()
  })

  it("returns no figure and queries nothing for another tenant's site", async () => {
    await expect(countSitePendingApprovalsForViewer(principal('COMPANY_ADMIN', 'company_2'), SITE_1)).resolves.toBeNull()
    expectNoApprovalReads()
  })

  it('counts valid rows only, for a tenant approver and for a SUPER_ADMIN', async () => {
    await expect(countSitePendingApprovalsForViewer(principal('COMPANY_ADMIN'), SITE_1)).resolves.toBe(2)
    await expect(countSitePendingApprovalsForViewer(SUPER_ADMIN, SITE_1)).resolves.toBe(2)
  })

  it('never counts a cross-bound approval under the foreign site it is pinned to', async () => {
    const foreign = { id: 'site_other', companyId: 'company_2' }

    await expect(countSitePendingApprovalsForViewer(SUPER_ADMIN, foreign)).resolves.toBe(0)
  })
})
