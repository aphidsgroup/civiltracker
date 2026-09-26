import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * The desktop "Record Expense" page (`/expenses/new`) checked the live role but never the
 * EXPENSES module, and its site picker listed every active site of the company — so a
 * SITE_ENGINEER was offered sites it is not assigned to, which the action then refused.
 *
 * The page must now require `expenses.create` with EXPENSES enabled (and approval
 * participation, since the action raises an approval) before any site query, and list
 * only ACTIVE live sites inside the principal's `assignedSiteWhere` — the same picker the
 * mobile add-expense page shows.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module`, `@/lib/auth/site-mutation` and
 * `@/lib/pages/tenant-page-access` are real; the site reads run on an in-memory evaluator.
 */
const mocks = vi.hoisted(() => ({
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
    site: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('@/lib/audit', () => ({ logActivity: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))

const { default: NewExpensePage } = await import('@/app/(dashboard)/expenses/new/page')

const SITES: Row[] = [
  { id: 'site_assigned', companyId: 'company_1', name: 'Tower A', status: 'ACTIVE', deletedAt: null, assignedEngineerId: null, engineerId: null },
  { id: 'site_engineer', companyId: 'company_1', name: 'Tower B', status: 'ACTIVE', deletedAt: null, assignedEngineerId: 'user_site_engineer', engineerId: null },
  { id: 'site_unassigned', companyId: 'company_1', name: 'Tower C', status: 'ACTIVE', deletedAt: null, assignedEngineerId: null, engineerId: null },
  { id: 'site_planning', companyId: 'company_1', name: 'Tower D', status: 'PLANNING', deletedAt: null, assignedEngineerId: 'user_site_engineer', engineerId: null },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', status: 'ACTIVE', deletedAt: new Date('2026-01-01'), assignedEngineerId: 'user_site_engineer', engineerId: null },
  { id: 'site_other', companyId: 'company_2', name: 'Foreign', status: 'ACTIVE', deletedAt: null, assignedEngineerId: 'user_site_engineer', engineerId: null },
]

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

let modules: unknown

async function renderedSiteIds() {
  const rows = await mocks.prisma.site.findMany.mock.results[0].value
  return (rows as Row[]).map((row) => row.id)
}

function expectNoSiteQuery() {
  expect(mocks.prisma.site.findMany).not.toHaveBeenCalled()
  expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['EXPENSES', 'APPROVALS']
  mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
  mocks.prisma.company.findFirst.mockImplementation(async () => ({ modulesJson: modules }))
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: ['site_assigned'] })
  const sites = inMemoryDelegate(SITES)
  mocks.prisma.site.findMany.mockImplementation(sites.findMany)
  mocks.prisma.site.findFirst.mockImplementation(sites.findFirst)
})

describe('NewExpensePage gate', () => {
  it('turns the principal away before any site query when EXPENSES is disabled', async () => {
    modules = ['APPROVALS', 'BILLS']

    await expect(NewExpensePage()).rejects.toThrow(/NEXT_REDIRECT/)
    expectNoSiteQuery()
  })

  it('turns a COMPANY_ADMIN away before any site query when EXPENSES is switched off', async () => {
    mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
    modules = { expenses: false, approvals: true }

    await expect(NewExpensePage()).rejects.toThrow(/NEXT_REDIRECT/)
    expectNoSiteQuery()
  })

  it.each(['ACCOUNTANT', 'SUPERVISOR', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'])(
    'turns an active %s without expense create or approval participation away before any query',
    async (role) => {
      mocks.requireUser.mockResolvedValue(principal(role))

      await expect(NewExpensePage()).rejects.toThrow(/NEXT_REDIRECT|NEXT_NOT_FOUND/)
      expectNoSiteQuery()
    }
  )

  it('turns a revoked principal away before any query', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    await expect(NewExpensePage()).rejects.toThrow(/UNAUTHORIZED/)
    expectNoSiteQuery()
    expect(mocks.prisma.company.findFirst).not.toHaveBeenCalled()
  })

  it('turns a SUPER_ADMIN to the platform dashboard before any query', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root_1', name: 'Root', email: 'root@x.test', role: 'SUPER_ADMIN' })

    await expect(NewExpensePage()).rejects.toThrow('NEXT_REDIRECT:/super-admin/dashboard')
    expectNoSiteQuery()
  })
})

describe('NewExpensePage site picker', () => {
  it('offers a SITE_ENGINEER only the active live sites it is assigned to', async () => {
    await NewExpensePage()

    expect(mocks.prisma.site.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.companyMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_site_engineer', companyId: 'company_1', isActive: true } })
    )
    expect((await renderedSiteIds()).sort()).toEqual(['site_assigned', 'site_engineer'])
  })

  it('offers a COMPANY_ADMIN every active live site of its own company', async () => {
    mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))

    await NewExpensePage()

    expect((await renderedSiteIds()).sort()).toEqual(['site_assigned', 'site_engineer', 'site_unassigned'])
  })
})
