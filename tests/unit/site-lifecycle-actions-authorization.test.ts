import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for `src/actions/site.ts` authorizing site edits, soft deletes and restores
 * from JWT claims alone.
 *
 * `updateSiteDetails`, `softDeleteSite` and `restoreSite` only checked that the token
 * carried a company id, so a revoked member, a SITE_ENGINEER or a company with SITES
 * switched off could edit or delete any site of the company. Status and budget were
 * written unvalidated, an update matched deleted sites, and a foreign or missing id
 * reported success.
 *
 * Now each action runs the live `sites.update` / `sites.delete` permission and the SITES
 * module before reading, binds the site to exactly the live company in the right
 * lifecycle state, validates status and budget, and fails when no row was written.
 *
 * `@/lib/permissions`, `@/lib/auth/require-permission`, `@/lib/auth/require-module` and
 * `@/lib/auth/site-mutation` are real.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  auth: vi.fn(),
  revalidatePath: vi.fn(),
  logActivity: vi.fn(),
  prisma: {
    company: { findUnique: vi.fn() },
    site: { findFirst: vi.fn(), updateMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))

const { updateSiteDetails, softDeleteSite, restoreSite } = await import('@/actions/site')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', name: 'Tower A', location: 'Chennai', status: 'ACTIVE', deletedAt: null, budget: 1000 },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', location: 'x', status: 'ACTIVE', deletedAt: new Date('2026-01-01'), budget: 0 },
  { id: 'site_other', companyId: 'company_2', name: 'Other Tower', location: 'x', status: 'ACTIVE', deletedAt: null, budget: 0 },
  { id: 'site_other_dead', companyId: 'company_2', name: 'Other Gone', location: 'x', status: 'ACTIVE', deletedAt: new Date('2026-01-01'), budget: 0 },
]

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

function editForm(overrides: Record<string, string> = {}) {
  const fd = new FormData()
  const fields = { id: 'site_1', name: 'Tower A2', location: 'Chennai', address: '', projectType: '', clientName: '', clientPhone: '', areaSqft: '', startDate: '', targetEndDate: '', budget: '2500', status: 'ON_HOLD', ...overrides }
  for (const [key, value] of Object.entries(fields)) fd.append(key, value)
  return fd
}

let modules: unknown

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['SITES']
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.auth.mockResolvedValue({ user: principal('COMPANY_ADMIN') })
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  const sites = inMemoryDelegate(SITES)
  mocks.prisma.site.findFirst.mockImplementation(sites.findFirst)
  mocks.prisma.site.updateMany.mockImplementation(sites.updateMany)
})

const ACTIONS = [
  { name: 'updateSiteDetails', permission: 'sites.update', run: (id = 'site_1') => updateSiteDetails(editForm({ id })) },
  { name: 'softDeleteSite', permission: 'sites.delete', run: (id = 'site_1') => softDeleteSite(id, id === 'site_1' ? 'Tower A' : 'Gone') },
  { name: 'restoreSite', permission: 'sites.delete', run: (id = 'site_dead') => restoreSite(id) },
]

describe('site lifecycle actions: live permission and module gate', () => {
  it.each(ACTIONS)('$name refuses a revoked principal before touching the site', async ({ run }) => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))
    await expect(run()).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.site.updateMany).not.toHaveBeenCalled()
  })

  it.each(ACTIONS)('$name refuses a live role without $permission even when the JWT says admin', async ({ run }) => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    await expect(run()).rejects.toThrow(/FORBIDDEN/)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.site.updateMany).not.toHaveBeenCalled()
  })

  it.each(ACTIONS)('$name refuses when the SITES module is disabled', async ({ run }) => {
    modules = ['EXPENSES']
    await expect(run()).rejects.toThrow(/Module SITES is not enabled/)
    expect(mocks.prisma.site.updateMany).not.toHaveBeenCalled()
  })

  it('a PROJECT_MANAGER may edit but may not delete or restore', async () => {
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER'))
    await expect(updateSiteDetails(editForm())).resolves.toEqual({ success: true })
    await expect(softDeleteSite('site_1', 'Tower A')).rejects.toThrow(/sites\.delete/)
    await expect(restoreSite('site_dead')).rejects.toThrow(/sites\.delete/)
    expect(mocks.prisma.site.updateMany).toHaveBeenCalledTimes(1)
  })
})

describe('site lifecycle actions: exact tenant site binding', () => {
  it.each([
    ['updateSiteDetails', () => updateSiteDetails(editForm({ id: 'site_other' }))],
    ['updateSiteDetails on a deleted site', () => updateSiteDetails(editForm({ id: 'site_dead' }))],
    ['softDeleteSite', () => softDeleteSite('site_other', 'Other Tower')],
    ['softDeleteSite on an already deleted site', () => softDeleteSite('site_dead', 'Gone')],
    ['restoreSite', () => restoreSite('site_other_dead')],
    ['restoreSite on a live site', () => restoreSite('site_1')],
    ['restoreSite on a missing site', () => restoreSite('nope')],
  ])('%s is refused and writes nothing', async (_name, run) => {
    await expect(run()).rejects.toThrow(/not found|access denied/i)
    expect(mocks.prisma.site.updateMany).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })

  it('updates only the live site of the live company', async () => {
    await updateSiteDetails(editForm())
    const where = mocks.prisma.site.updateMany.mock.calls[0][0].where
    expect(where).toEqual({ id: 'site_1', companyId: 'company_1', deletedAt: null })
  })

  it('soft deletes only a live site and restores only a deleted one', async () => {
    await softDeleteSite('site_1', 'Tower A')
    expect(mocks.prisma.site.updateMany.mock.calls[0][0].where).toEqual({ id: 'site_1', companyId: 'company_1', deletedAt: null })
    await restoreSite('site_dead')
    expect(mocks.prisma.site.updateMany.mock.calls[1][0].where).toEqual({ id: 'site_dead', companyId: 'company_1', deletedAt: { not: null } })
  })

  it.each([
    ['updateSiteDetails', () => updateSiteDetails(editForm())],
    ['softDeleteSite', () => softDeleteSite('site_1', 'Tower A')],
    ['restoreSite', () => restoreSite('site_dead')],
  ])('%s fails when the guarded write matches no row (raced away)', async (_name, run) => {
    mocks.prisma.site.updateMany.mockResolvedValue({ count: 0 })
    await expect(run()).rejects.toThrow(/not found|access denied/i)
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('a SUPER_ADMIN without tenant context cannot mutate a company site', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root', email: 'root@x', name: 'Root', role: 'SUPER_ADMIN' })
    await expect(updateSiteDetails(editForm())).rejects.toThrow(/FORBIDDEN/)
    expect(mocks.prisma.site.updateMany).not.toHaveBeenCalled()
  })
})

describe('updateSiteDetails input validation', () => {
  it.each([
    ['an unknown status', { status: 'DEMOLISHED' }],
    ['a missing status', { status: '' }],
    ['a negative budget', { budget: '-1' }],
    ['a non-numeric budget', { budget: 'lots' }],
    ['an infinite budget', { budget: 'Infinity' }],
    ['a blank name', { name: '   ' }],
    ['a negative area', { areaSqft: '-10' }],
  ])('rejects %s without writing', async (_name, overrides) => {
    await expect(updateSiteDetails(editForm(overrides))).rejects.toThrow(/invalid|required/i)
    expect(mocks.prisma.site.updateMany).not.toHaveBeenCalled()
  })

  it('writes a validated status and budget', async () => {
    await updateSiteDetails(editForm({ budget: '0', status: 'COMPLETED' }))
    expect(mocks.prisma.site.updateMany.mock.calls[0][0].data).toMatchObject({ budget: 0, status: 'COMPLETED', name: 'Tower A2' })
  })
})
