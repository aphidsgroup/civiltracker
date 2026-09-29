import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for `GET /api/sites` listing every active site of the company to a field role.
 *
 * The route checked `sites.view` + SITES and then filtered by company only, so a
 * SITE_ENGINEER or SUPERVISOR received the name, budget and spend of sites it was never
 * assigned to, and a SUPER_ADMIN received the active sites of every tenant.
 *
 * Now the live principal must hold `sites.view` with SITES on and carry a tenant
 * context, and the list is narrowed at the query to the canonical `assignedSiteScope`
 * plus `status: 'ACTIVE'`, so nothing outside that scope is ever read.
 *
 * `@/lib/permissions`, `@/lib/auth/require-permission`, `@/lib/auth/require-module`,
 * `@/lib/auth/require-api-permission` and `@/lib/auth/site-mutation` are real.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  prisma: {
    company: { findUnique: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))

const { GET } = await import('@/app/api/sites/route')

const ENGINEER_ID = 'user_site_engineer'
const SUPERVISOR_ID = 'user_supervisor'

const SITES: Row[] = [
  { id: 'site_open', companyId: 'company_1', name: 'Open', status: 'ACTIVE', deletedAt: null },
  { id: 'site_assigned', companyId: 'company_1', name: 'Assigned', status: 'ACTIVE', deletedAt: null, assignedEngineerId: ENGINEER_ID },
  { id: 'site_member', companyId: 'company_1', name: 'Member', status: 'ACTIVE', deletedAt: null },
  { id: 'site_planning', companyId: 'company_1', name: 'Planning', status: 'PLANNING', deletedAt: null, assignedEngineerId: ENGINEER_ID },
  { id: 'site_dead', companyId: 'company_1', name: 'Dead', status: 'ACTIVE', deletedAt: new Date('2026-01-01'), assignedEngineerId: ENGINEER_ID },
  { id: 'site_other', companyId: 'company_2', name: 'Other', status: 'ACTIVE', deletedAt: null, assignedEngineerId: ENGINEER_ID },
]

const MEMBERS: Row[] = [
  { userId: ENGINEER_ID, companyId: 'company_1', isActive: true, siteIds: ['site_member', 'site_other', 'site_dead'] },
  { userId: SUPERVISOR_ID, companyId: 'company_1', isActive: false, siteIds: ['site_open'] },
]

function principal(role: string, id = `user_${role.toLowerCase()}`) {
  return { id, name: role, email: `${id}@acme.test`, role, companyId: 'company_1' }
}

let modules: unknown

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['SITES']
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  mocks.prisma.companyMember.findFirst.mockImplementation(inMemoryDelegate(MEMBERS).findFirst)
  mocks.prisma.site.findMany.mockImplementation(inMemoryDelegate(SITES).findMany)
})

async function listIds() {
  const res = await GET()
  expect(res.status).toBe(200)
  const body = await res.json()
  return (body.sites as Array<{ id: string }>).map((site) => site.id).sort()
}

describe('GET /api/sites', () => {
  it('lists every active live site of the company to a COMPANY_ADMIN', async () => {
    expect(await listIds()).toEqual(['site_assigned', 'site_member', 'site_open'])
  })

  it('lists to a SITE_ENGINEER only its assigned and active-membership live active sites, filtered at the query', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER', ENGINEER_ID))
    expect(await listIds()).toEqual(['site_assigned', 'site_member'])
    const where = mocks.prisma.site.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ companyId: 'company_1', deletedAt: null, status: 'ACTIVE' })
    expect(where.OR).toBeDefined()
  })

  it('lists nothing to a SUPERVISOR whose only site comes from a deactivated membership', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR', SUPERVISOR_ID))
    expect(await listIds()).toEqual([])
  })

  it('lists nothing to an unassigned SITE_ENGINEER', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER', 'user_unassigned'))
    expect(await listIds()).toEqual([])
  })

  it('refuses a SUPER_ADMIN, which has no tenant context, before reading any site', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root', name: 'Root', email: 'root@platform.test', role: 'SUPER_ADMIN' })
    const res = await GET()
    expect(res.status).toBe(403)
    expect(mocks.prisma.site.findMany).not.toHaveBeenCalled()
  })

  it('refuses a role without sites.view before reading any site', async () => {
    mocks.requireUser.mockResolvedValue(principal('VENDOR'))
    const res = await GET()
    expect(res.status).toBe(403)
    expect(mocks.prisma.site.findMany).not.toHaveBeenCalled()
  })

  it('refuses when the SITES module is disabled', async () => {
    modules = ['LABOUR']
    const res = await GET()
    expect(res.status).toBe(403)
    expect(mocks.prisma.site.findMany).not.toHaveBeenCalled()
  })

  it('answers 401 to a revoked principal', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))
    const res = await GET()
    expect(res.status).toBe(401)
    expect(mocks.prisma.site.findMany).not.toHaveBeenCalled()
  })
})
