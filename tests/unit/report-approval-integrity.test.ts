import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { APPROVALS, SITES, approvalStore, entityStores } from './support/approval-fixtures'

/**
 * The founder dashboard and the site cost report summed "pending approval" money from
 * `site.approvals` filtered by `deletedAt` alone. A malformed row, a row whose linked
 * expense is gone or sits on another site, and a row pinned to another tenant's site all
 * inflated the figure with amounts that no approver could ever action.
 *
 * The site rows returned here deliberately still carry every raw approval under
 * `approvals`, the way the old include handed them back: a report that keeps summing
 * that relation instead of the validated helper fails these tests.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  prisma: {
    site: { findMany: vi.fn() },
    client: { findMany: vi.fn() },
    approval: { findMany: vi.fn() },
    expense: { findMany: vi.fn() },
    purchaseOrder: { findMany: vi.fn() },
    dailyProgressReport: { findMany: vi.fn() },
    material: { findMany: vi.fn() },
    salaryRun: { findMany: vi.fn() },
    document: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))

const { getFounderDashboardStats, getSiteCostReport } = await import('@/actions/reports')

function reportSite(id: string) {
  const site = SITES.find((row) => row.id === id)!
  return {
    ...site,
    status: 'ACTIVE',
    budget: new Prisma.Decimal(100000),
    progress: 50,
    expenses: [],
    labour: [],
    // Every raw row on this site, invalid ones included.
    approvals: APPROVALS.filter((row) => row.siteId === id),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({
    id: 'user_1',
    name: 'Admin',
    email: 'admin@acme.test',
    role: 'COMPANY_ADMIN',
    companyId: 'company_1',
  })
  mocks.prisma.site.findMany.mockResolvedValue([reportSite('site_1'), reportSite('site_2')])
  mocks.prisma.client.findMany.mockResolvedValue([])
  mocks.prisma.approval.findMany.mockImplementation(approvalStore().findMany)
  for (const [name, store] of Object.entries(entityStores())) {
    mocks.prisma[name as keyof ReturnType<typeof entityStores>].findMany.mockImplementation(store.findMany)
  }
})

describe('getFounderDashboardStats', () => {
  it('sums only valid open approvals on the tenant sites', async () => {
    const stats = await getFounderDashboardStats()

    // a_valid (100, site_1) + a_review (30, site_2). Deleted, dead-site, malformed,
    // orphaned, cross-site, cross-bound and unmapped rows contribute nothing.
    expect(stats.pendingApprovalAmount).toBe(130)
  })

  it('no longer loads approvals through the raw site relation', async () => {
    await getFounderDashboardStats()

    const [{ include }] = mocks.prisma.site.findMany.mock.calls[0] as [{ include: Record<string, unknown> }]
    expect(include).not.toHaveProperty('approvals')
  })
})

describe('getSiteCostReport', () => {
  it('reports only valid open approvals per site', async () => {
    const rows = await getSiteCostReport({})

    expect(Object.fromEntries(rows.map((row) => [row.id, row.pendingApproval]))).toEqual({
      site_1: 100,
      site_2: 30,
    })

    const [{ include }] = mocks.prisma.site.findMany.mock.calls[0] as [{ include: Record<string, unknown> }]
    expect(include).not.toHaveProperty('approvals')
  })

  it('reports zero pending for a site whose only approvals are invalid', async () => {
    mocks.prisma.site.findMany.mockResolvedValue([reportSite('site_1')])
    mocks.prisma.approval.findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) =>
      (await approvalStore().findMany(args)).filter((row) => String(row.title).startsWith('BAD'))
    )

    const [row] = await getSiteCostReport({ siteId: 'site_1' })

    expect(row.pendingApproval).toBe(0)
  })
})
