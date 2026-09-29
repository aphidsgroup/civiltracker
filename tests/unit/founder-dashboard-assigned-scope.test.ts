import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for the founder dashboard summing every live site of the company for a
 * field role.
 *
 * `getFounderDashboardStats` checked `reports.finance` and the REPORTS module on the live
 * principal, then read every live company site — budget, expenses, and through them the
 * pending approval money — and the whole company client ledger. SITE_ENGINEER and
 * SUPERVISOR hold `reports.finance` and `reports.clientReceivable`, so a field role saw
 * totals of sites it is not assigned to and the company-wide receivable.
 *
 * Now every site-derived total is read through the canonical `assignedSiteWhere`, and the
 * site-less client ledger is never read for a field role.
 *
 * `@/lib/permissions`, `@/lib/pages/tenant-page-access` and `@/lib/auth/site-mutation`
 * are real.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  sumValidOpenApprovalAmountsBySite: vi.fn(),
  prisma: {
    company: { findFirst: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findMany: vi.fn() },
    client: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('@/lib/approvals/valid-reads', () => ({ sumValidOpenApprovalAmountsBySite: mocks.sumValidOpenApprovalAmountsBySite }))

const { getFounderDashboardStats } = await import('@/actions/reports')

const ENGINEER_ID = 'user_site_engineer'
const SUPERVISOR_ID = 'user_supervisor'

function site(id: string, companyId: string, extra: Row = {}): Row {
  return {
    id, companyId, name: `Name ${id}`, status: 'ACTIVE', deletedAt: null, progress: 50,
    budget: new Prisma.Decimal(1000),
    expenses: [
      { approvalStatus: 'APPROVED', category: 'MATERIAL', amount: new Prisma.Decimal(100) },
      { approvalStatus: 'PAID', category: 'OTHER', amount: new Prisma.Decimal(10) },
    ],
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

function summedSiteIds() {
  return mocks.sumValidOpenApprovalAmountsBySite.mock.calls.flatMap(([sites]) => (sites as Row[]).map((row) => row.id)).sort()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: null })
  mocks.prisma.site.findMany.mockImplementation(inMemoryDelegate(SITES).findMany)
  mocks.prisma.companyMember.findFirst.mockImplementation(inMemoryDelegate(MEMBERS).findFirst)
  mocks.prisma.client.findMany.mockResolvedValue([{ amountDue: new Prisma.Decimal(7000), contractValue: new Prisma.Decimal(9000) }])
  // Every site handed in carries 5 of pending approval money.
  mocks.sumValidOpenApprovalAmountsBySite.mockImplementation(async (sites: Row[]) =>
    new Map(sites.map((row) => [row.id as string, new Prisma.Decimal(5)]))
  )
})

describe('getFounderDashboardStats: field-role site scope', () => {
  it('sums for a SITE_ENGINEER only its assignedEngineer and active-membership live sites', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER', ENGINEER_ID))

    const stats = await getFounderDashboardStats()

    expect(stats.totalActiveSites).toBe(2)
    expect(stats.totalBudget).toBe(2000)
    expect(stats.totalActualSpend).toBe(220)
    expect(stats.approvedExpenseAmount).toBe(220)
    expect(stats.paidAmount).toBe(20)
    expect(stats.vendorPayable).toBe(200)
    expect(stats.materialCost).toBe(200)
    expect(stats.pendingApprovalAmount).toBe(10)
    expect(summedSiteIds()).toEqual(['site_assigned', 'site_member'])
  })

  it('scopes every site read at the query, not after loading the company', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER', ENGINEER_ID))

    await getFounderDashboardStats()

    for (const [args] of mocks.prisma.site.findMany.mock.calls) {
      expect(args.where).toMatchObject({ companyId: 'company_1', deletedAt: null })
      expect(args.where).toHaveProperty('OR')
    }
    expect(mocks.prisma.companyMember.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: ENGINEER_ID, companyId: 'company_1', isActive: true },
    }))
  })

  it('gives a SUPERVISOR only the site it is the engineer of, never one from a deactivated membership', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR', SUPERVISOR_ID))

    const stats = await getFounderDashboardStats()

    expect(stats.totalBudget).toBe(1000)
    expect(stats.pendingApprovalAmount).toBe(5)
    expect(summedSiteIds()).toEqual(['site_engineer'])
  })

  it('does not widen a field role with no assignment to the company', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER', 'user_unassigned'))

    const stats = await getFounderDashboardStats()

    expect(stats.totalActiveSites).toBe(0)
    expect(stats.totalBudget).toBe(0)
    expect(stats.totalActualSpend).toBe(0)
    expect(stats.pendingApprovalAmount).toBe(0)
  })

  it.each([
    ['SITE_ENGINEER', ENGINEER_ID],
    ['SUPERVISOR', SUPERVISOR_ID],
  ])('never reads the company-wide client ledger for a %s', async (role, id) => {
    mocks.requireUser.mockResolvedValue(principal(role, id))

    const stats = await getFounderDashboardStats()

    expect(mocks.prisma.client.findMany).not.toHaveBeenCalled()
    expect(stats.clientReceivable).toBeNull()
    expect(stats.profitForecastAmount).toBeNull()
  })

  it('keeps every live company site, salary and client ledger for an admin', async () => {
    const stats = await getFounderDashboardStats()

    expect(stats.totalActiveSites).toBe(4)
    expect(stats.totalBudget).toBe(4000)
    expect(stats.totalActualSpend).toBe(640)
    expect(stats.clientReceivable).toBe(7000)
    expect(summedSiteIds()).toEqual(['site_1', 'site_assigned', 'site_engineer', 'site_member'])
    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
  })

  it('still refuses a reports.view holder without reports.finance before any read', async () => {
    mocks.requireUser.mockResolvedValue(principal('PURCHASE_MANAGER'))

    await expect(getFounderDashboardStats()).rejects.toThrow(/FORBIDDEN/)
    expect(mocks.prisma.site.findMany).not.toHaveBeenCalled()
    expect(mocks.prisma.client.findMany).not.toHaveBeenCalled()
  })
})
