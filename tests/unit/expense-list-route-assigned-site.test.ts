import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'

/**
 * Regression for `GET /api/expenses` and field roles.
 *
 * The route bound the list to the caller's company only, so a SITE_ENGINEER or SUPERVISOR
 * holding `expenses.view` (a custom grant, or a future matrix change) could read the
 * expenses of every site of the company, and name any company site in `?siteId=`.
 *
 * Now a field role's optional `siteId` must be one of its assigned live sites — refused
 * with 403 before any expense is read otherwise — and the returned list is bound to the
 * same `assignedSiteScope`. Other roles keep reading the whole company. The permission
 * matrix is real; `hasPermission` is wrapped only so a test can grant a field role
 * `expenses.view`.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  hasPermission: vi.fn(),
  extraGrants: new Set<string>(),
  prisma: {
    company: { findUnique: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findFirst: vi.fn() },
    expense: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/permissions')>()
  mocks.hasPermission.mockImplementation(
    (role: string, permission: string) => mocks.extraGrants.has(`${role}:${permission}`) || actual.hasPermission(role as never, permission as never)
  )
  return { ...actual, hasPermission: mocks.hasPermission }
})

const { GET } = await import('@/app/api/expenses/route')

const SITES: Row[] = [
  { id: 'site_mine', companyId: 'company_1', deletedAt: null, assignedEngineerId: 'user_field', engineerId: null },
  { id: 'site_listed', companyId: 'company_1', deletedAt: null, assignedEngineerId: null, engineerId: null },
  { id: 'site_theirs', companyId: 'company_1', deletedAt: null, assignedEngineerId: 'someone_else', engineerId: null },
  { id: 'site_dead', companyId: 'company_1', deletedAt: new Date('2026-01-01'), assignedEngineerId: 'user_field', engineerId: null },
  { id: 'site_other', companyId: 'company_2', deletedAt: null, assignedEngineerId: 'user_field', engineerId: null },
]

const EXPENSES: Row[] = [
  { id: 'exp_mine', companyId: 'company_1', siteId: 'site_mine', deletedAt: null },
  { id: 'exp_listed', companyId: 'company_1', siteId: 'site_listed', deletedAt: null },
  { id: 'exp_theirs', companyId: 'company_1', siteId: 'site_theirs', deletedAt: null },
  { id: 'exp_dead_site', companyId: 'company_1', siteId: 'site_dead', deletedAt: null },
  { id: 'exp_other', companyId: 'company_2', siteId: 'site_other', deletedAt: null },
]

const relations: RelationResolver = (row, key) => {
  if (key === 'site') return SITES.find((site) => site.id === row.siteId) ?? null
  return undefined
}

let membership: { siteIds: string[] } | null

function principal(role: string) {
  return { id: 'user_field', name: role, email: 'field@acme.test', role, companyId: 'company_1' }
}

async function list(siteId?: string) {
  const url = `https://app.test/api/expenses${siteId ? `?siteId=${siteId}` : ''}`
  const response = await GET(new Request(url))
  const body = (await response.json()) as { expenses?: Row[]; error?: string }
  return { status: response.status, ids: body.expenses?.map((expense) => expense.id).sort(), error: body.error }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.extraGrants.clear()
  mocks.extraGrants.add('SITE_ENGINEER:expenses.view')
  mocks.extraGrants.add('SUPERVISOR:expenses.view')
  membership = { siteIds: ['site_listed'] }
  mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
  mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['EXPENSES'], status: 'ACTIVE' })
  mocks.prisma.companyMember.findFirst.mockImplementation(async () => membership)
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)
  mocks.prisma.expense.findMany.mockImplementation(inMemoryDelegate(EXPENSES, relations).findMany)
})

describe('GET /api/expenses assigned-site policy for field roles', () => {
  it.each(['SITE_ENGINEER', 'SUPERVISOR'])('lists a %s only the expenses of its assigned live sites', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    expect(await list()).toMatchObject({ status: 200, ids: ['exp_listed', 'exp_mine'] })
  })

  it.each(['site_theirs', 'site_dead', 'site_other', 'site_missing'])(
    'refuses ?siteId=%s outside the scope with 403 before any expense read',
    async (siteId) => {
      const result = await list(siteId)

      expect(result.status).toBe(403)
      expect(result.error).toMatch(/Site not found or access denied/)
      expect(mocks.prisma.expense.findMany).not.toHaveBeenCalled()
    }
  )

  it('narrows the list to one assigned site when it is named', async () => {
    expect(await list('site_listed')).toMatchObject({ status: 200, ids: ['exp_listed'] })
  })

  it('returns nothing, and refuses every named site, for a field role with no assignment', async () => {
    mocks.requireUser.mockResolvedValue({ ...principal('SUPERVISOR'), id: 'user_unassigned' })
    membership = { siteIds: [] }

    expect(await list()).toMatchObject({ status: 200, ids: [] })
    expect((await list('site_mine')).status).toBe(403)
  })

  it('reads the membership of exactly the live company, and only an active one', async () => {
    await list()

    expect(mocks.prisma.companyMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_field', companyId: 'company_1', isActive: true } })
    )
  })

  it('keeps refusing a field role without expenses.view before any read', async () => {
    mocks.extraGrants.clear()

    expect((await list()).status).toBe(403)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.expense.findMany).not.toHaveBeenCalled()
  })
})

describe('GET /api/expenses for company-wide roles', () => {
  it('lists every expense of the live company to an ACCOUNTANT without a membership lookup', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))

    const result = await list()

    expect(result.status).toBe(200)
    expect(result.ids).toEqual(expect.arrayContaining(['exp_listed', 'exp_mine', 'exp_theirs']))
    expect(result.ids).not.toContain('exp_other')
    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
  })
})
