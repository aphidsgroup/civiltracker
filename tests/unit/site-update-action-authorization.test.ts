import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for `updateSite` (src/actions/sites.ts) mutating a soft-deleted site.
 *
 * The action loaded the site by bare id with `findUnique` — deleted rows included — then
 * checked the company and issued `site.update({ where: { id } })`. A soft-deleted site of
 * the caller's company could be edited, the SITES module was never checked, and the write
 * itself carried no tenant or liveness guard.
 *
 * Now the live principal needs `sites.update` with SITES on, the id is bound to a live
 * site of exactly the live company inside the principal's assigned-site scope before any
 * write, and the write repeats that binding and must match exactly one row.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module` and `@/lib/auth/site-mutation` are real.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  logActivity: vi.fn(),
  prisma: {
    company: { findUnique: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))

const { updateSite } = await import('@/actions/sites')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', name: 'Tower A', status: 'ACTIVE', deletedAt: null },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', status: 'ACTIVE', deletedAt: new Date('2026-01-01') },
  { id: 'site_other', companyId: 'company_2', name: 'Other', status: 'ACTIVE', deletedAt: null },
]

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

const DATA = { name: 'Tower A2', location: 'Chennai', budget: '1000' }

let modules: unknown

function writes() {
  return mocks.prisma.site.update.mock.calls.length + mocks.prisma.site.updateMany.mock.calls.length
}

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['SITES']
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  const sites = inMemoryDelegate(SITES)
  mocks.prisma.site.findFirst.mockImplementation(sites.findFirst)
  mocks.prisma.site.updateMany.mockImplementation(sites.updateMany)
  // A bare-id lookup returns deleted and foreign rows, exactly like the real findUnique.
  mocks.prisma.site.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => SITES.find((s) => s.id === where.id) ?? null)
  mocks.prisma.site.update.mockResolvedValue({})
})

describe('updateSite', () => {
  it('refuses a soft-deleted site of the caller company without writing', async () => {
    await expect(updateSite('site_dead', DATA)).rejects.toThrow(/Site not found or access denied/)
    expect(writes()).toBe(0)
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })

  it('refuses a site of another company without writing', async () => {
    await expect(updateSite('site_other', DATA)).rejects.toThrow(/Site not found or access denied/)
    expect(writes()).toBe(0)
  })

  it('refuses when the SITES module is disabled before reading the site', async () => {
    modules = ['LABOUR']
    await expect(updateSite('site_1', DATA)).rejects.toThrow(/Module SITES is not enabled/)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.site.findUnique).not.toHaveBeenCalled()
    expect(writes()).toBe(0)
  })

  it.each(['SITE_ENGINEER', 'SUPERVISOR', 'ACCOUNTANT', 'CLIENT'])('refuses live %s without sites.update before any read', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(updateSite('site_1', DATA)).rejects.toThrow(/sites\.update/)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(writes()).toBe(0)
  })

  it('refuses a SUPER_ADMIN, which has no tenant context', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root', name: 'Root', email: 'root@platform.test', role: 'SUPER_ADMIN' })
    await expect(updateSite('site_1', DATA)).rejects.toThrow(/FORBIDDEN/)
    expect(writes()).toBe(0)
  })

  it('fails when the site is deleted between the check and the guarded write', async () => {
    mocks.prisma.site.updateMany.mockResolvedValue({ count: 0 })
    await expect(updateSite('site_1', DATA)).rejects.toThrow(/Site not found or access denied/)
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })

  it('updates only the live site of the live company with a guarded write', async () => {
    await expect(updateSite('site_1', DATA)).resolves.toEqual({ success: true, siteId: 'site_1' })
    expect(mocks.prisma.site.update).not.toHaveBeenCalled()
    const call = mocks.prisma.site.updateMany.mock.calls[0][0]
    expect(call.where).toEqual({ id: 'site_1', companyId: 'company_1', deletedAt: null })
    expect(call.data).toMatchObject({ name: 'Tower A2', location: 'Chennai', budget: 1000 })
    expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'company_1', recordId: 'site_1', action: 'UPDATE' }))
  })
})
