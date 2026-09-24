import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { APPROVALS, approvalStore, entityStores, idsOf } from './support/approval-fixtures'

/**
 * Cover for the shared "valid approval" read helpers and the two surfaces that used to
 * count raw rows: the dashboard navigation badge and the site overview metric.
 *
 * Both counted `approval` rows straight off the table. A soft-deleted row, a row pinned
 * to a deleted site, a malformed site-null row on a site-bound type, a row whose linked
 * entity is gone or sits on another site, and a row pinned to another tenant's site were
 * all counted as work waiting to be actioned — work every action path then refuses. The
 * badge also trusted the JWT role, so a demoted member without `approvals.view` kept
 * seeing the queue size.
 *
 * The delegates evaluate the real `where` the helpers compose, so an exclusion only
 * passes when the query (or the linked-entity filter) actually drops the row.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  prisma: {
    approval: { findMany: vi.fn(), count: vi.fn() },
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

const {
  countValidApprovals,
  filterValidApprovals,
  getPendingApprovalBadgeCount,
  sumValidOpenApprovalAmountsBySite,
} = await import('@/lib/approvals/valid-reads')

function principal(role: string, companyId: string | undefined = 'company_1') {
  return { id: 'user_1', name: 'Member', email: 'member@acme.test', role, companyId }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.approval.findMany.mockImplementation(approvalStore().findMany)
  mocks.prisma.approval.count.mockImplementation(approvalStore().count)
  for (const [name, store] of Object.entries(entityStores())) {
    mocks.prisma[name as keyof ReturnType<typeof entityStores>].findMany.mockImplementation(store.findMany)
  }
})

describe('filterValidApprovals', () => {
  it('keeps only rows with a live, same-tenant site binding and a reachable linked entity', async () => {
    const live = APPROVALS.filter((row) => row.deletedAt === null && (row.site as { deletedAt?: unknown } | null)?.deletedAt == null)

    const kept = await filterValidApprovals(live as never)

    expect(idsOf(kept)).toEqual(['a_approved', 'a_other_valid', 'a_po', 'a_review', 'a_valid'])
  })

  it('drops a row pinned to another tenant site even when its linked entity claims the approval tenant', async () => {
    const crossBound = APPROVALS.find((row) => row.id === 'a_cross_bound')!

    await expect(filterValidApprovals([crossBound] as never)).resolves.toEqual([])
  })
})

describe('countValidApprovals', () => {
  it('counts only valid pending rows of the tenant', async () => {
    await expect(countValidApprovals({ companyId: 'company_1', currentStatus: 'PENDING' })).resolves.toBe(2)
  })

  it('counts only valid pending rows of one site', async () => {
    await expect(
      countValidApprovals({ companyId: 'company_1', siteId: 'site_1', currentStatus: 'PENDING' })
    ).resolves.toBe(1)
  })

  it('never counts a soft-deleted row, a deleted-site row or a malformed row, whatever the caller asks for', async () => {
    const count = await countValidApprovals({ id: { in: ['a_deleted', 'a_dead_site', 'a_malformed'] } })

    expect(count).toBe(0)
    // The exclusion is part of the query, not only a post-filter.
    const [{ where }] = mocks.prisma.approval.findMany.mock.calls[0] as [{ where: unknown }]
    expect(JSON.stringify(where)).toContain('"deletedAt":null')
    expect(where).toMatchObject({
      AND: expect.arrayContaining([
        {
          OR: [
            { siteId: null, entityType: { in: ['PURCHASE_ORDER'] } },
            { site: { is: { deletedAt: null } } },
          ],
        },
      ]),
    })
  })

  it('never uses a raw count', async () => {
    await countValidApprovals({ companyId: 'company_1' })
    expect(mocks.prisma.approval.count).not.toHaveBeenCalled()
  })
})

describe('sumValidOpenApprovalAmountsBySite', () => {
  it('sums only valid open approvals per site and never a site outside the list', async () => {
    const totals = await sumValidOpenApprovalAmountsBySite([
      { id: 'site_1', companyId: 'company_1' },
      { id: 'site_2', companyId: 'company_1' },
      { id: 'site_dead', companyId: 'company_1' },
    ])

    expect(totals.get('site_1')?.toNumber()).toBe(100)
    expect(totals.get('site_2')?.toNumber()).toBe(30)
    expect(totals.get('site_dead')?.toNumber() ?? 0).toBe(0)
    expect(totals.has('site_other')).toBe(false)
  })

  it('does not query at all for an empty site list', async () => {
    const totals = await sumValidOpenApprovalAmountsBySite([])

    expect(totals.size).toBe(0)
    expect(mocks.prisma.approval.findMany).not.toHaveBeenCalled()
  })
})

describe('getPendingApprovalBadgeCount', () => {
  it('counts only valid pending approvals of the live tenant', async () => {
    await expect(getPendingApprovalBadgeCount()).resolves.toBe(2)
  })

  it('counts valid pending approvals platform-wide for a live SUPER_ADMIN', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPER_ADMIN', undefined))

    await expect(getPendingApprovalBadgeCount()).resolves.toBe(3)
  })

  it.each(['VENDOR', 'SUBCONTRACTOR', 'CLIENT', 'SUPERVISOR'])(
    'shows no badge and reads nothing for a live %s without approvals.view',
    async (role) => {
      mocks.requireUser.mockResolvedValue(principal(role))

      await expect(getPendingApprovalBadgeCount()).resolves.toBe(0)
      expect(mocks.prisma.approval.findMany).not.toHaveBeenCalled()
      expect(mocks.prisma.approval.count).not.toHaveBeenCalled()
    }
  )

  it('shows no badge and reads nothing when the live principal cannot be resolved', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    await expect(getPendingApprovalBadgeCount()).resolves.toBe(0)
    expect(mocks.prisma.approval.findMany).not.toHaveBeenCalled()
  })
})

describe('approval surfaces use the valid-read helpers', () => {
  it('dashboard layout takes its badge from the live, permission-gated helper', async () => {
    const source = await readFile(path.resolve('src/app/(dashboard)/layout.tsx'), 'utf8')

    expect(source).toContain('getPendingApprovalBadgeCount()')
    expect(source).not.toMatch(/prisma\.approval\./)
  })

  it('site overview counts pending approvals through the valid-read helper, scoped to the site tenant', async () => {
    const source = await readFile(path.resolve('src/app/(dashboard)/sites/[id]/page.tsx'), 'utf8')

    expect(source).toMatch(
      /countValidApprovals\(\{\s*companyId:\s*site\.companyId,\s*siteId:\s*site\.id,\s*currentStatus:\s*'PENDING'/
    )
    expect(source).not.toMatch(/prisma\.approval\./)
  })
})
