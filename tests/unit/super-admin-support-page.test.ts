import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { APPROVALS, approvalStore, entityStores, idsOf } from './support/approval-fixtures'

/**
 * The super-admin support page gated on the JWT role claim and then listed and counted
 * approval rows straight off the table.
 *
 *  - A demoted or deactivated SUPER_ADMIN kept a token that still said SUPER_ADMIN, so
 *    the platform-wide approval queue stayed readable until the token expired.
 *  - The list and both counters admitted malformed site-null rows, rows on deleted
 *    sites, rows whose linked entity is gone or on another site, and rows pinned to
 *    another tenant's site.
 *
 * The JWT here always claims SUPER_ADMIN; only the live `requireUser` principal decides.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireUser: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  prisma: {
    approval: { findMany: vi.fn(), count: vi.fn() },
    company: { count: vi.fn() },
    expense: { findMany: vi.fn() },
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

const { default: SupportPage } = await import('@/app/(super-admin)/super-admin/support/page')
const { getSupportApprovalOverview } = await import('@/lib/approvals/support-overview')

const SUPER_ADMIN = { id: 'root_1', name: 'Root', email: 'root@platform.test', role: 'SUPER_ADMIN' }

function expectNoApprovalReads() {
  expect(mocks.prisma.approval.findMany).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.count).not.toHaveBeenCalled()
  expect(mocks.prisma.company.count).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: 'root_1', role: 'SUPER_ADMIN' } })
  mocks.requireUser.mockResolvedValue(SUPER_ADMIN)
  mocks.prisma.approval.findMany.mockImplementation(approvalStore().findMany)
  mocks.prisma.approval.count.mockImplementation(approvalStore().count)
  mocks.prisma.company.count.mockResolvedValue(2)
  for (const [name, store] of Object.entries(entityStores())) {
    mocks.prisma[name as keyof ReturnType<typeof entityStores>].findMany.mockImplementation(store.findMany)
  }
})

describe('super-admin support page access', () => {
  it('redirects a stale SUPER_ADMIN token whose live role was demoted, before any read', async () => {
    mocks.requireUser.mockResolvedValue({ ...SUPER_ADMIN, role: 'COMPANY_ADMIN', companyId: 'company_1' })

    await expect(SupportPage()).rejects.toThrow('NEXT_REDIRECT:/dashboard')
    expectNoApprovalReads()
  })

  it('redirects to login when the live principal cannot be resolved, before any read', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Account is inactive'))

    await expect(SupportPage()).rejects.toThrow('NEXT_REDIRECT:/login')
    expectNoApprovalReads()
  })

  it('never consults the JWT role claim', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'root_1', role: 'VENDOR' } })

    const html = renderToStaticMarkup(await SupportPage())

    expect(html).toContain('Valid expense')
    expect(mocks.auth).not.toHaveBeenCalled()
  })
})

describe('super-admin support page data', () => {
  it('lists and counts only valid approvals', async () => {
    const html = renderToStaticMarkup(await SupportPage())

    for (const row of APPROVALS.filter((approval) => String(approval.title).startsWith('BAD'))) {
      expect(html).not.toContain(String(row.title))
    }
    expect(html).toContain('Valid expense')
    expect(html).toContain('Company PO')
    expect(html).toContain('Other tenant valid')
    // PENDING_REVIEW and APPROVED rows are not part of the pending queue.
    expect(html).not.toContain('Tower B review')
    expect(html).not.toContain('Approved expense')
    expect(mocks.prisma.approval.count).not.toHaveBeenCalled()
  })

  it('computes pending and approved totals from valid rows only', async () => {
    const overview = await getSupportApprovalOverview(SUPER_ADMIN as never)

    expect(overview.totalPending).toBe(3)
    expect(overview.totalApproved).toBe(1)
    expect(overview.totalCompanies).toBe(2)
    expect(idsOf(overview.pendingApprovals)).toEqual(['a_other_valid', 'a_po', 'a_valid'])
  })

  it('refuses a non SUPER_ADMIN principal before any read', async () => {
    await expect(
      getSupportApprovalOverview({ ...SUPER_ADMIN, role: 'COMPANY_ADMIN', companyId: 'company_1' } as never)
    ).rejects.toThrow(/^Forbidden/)
    expectNoApprovalReads()
  })
})
