import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression for the dashboard pages that host the formerly inline Server Actions reading
 * with the JWT's company id.
 *
 * Each page checked only that the token carried a company id, so a revoked member, a
 * demoted role (a CLIENT) or a company with the module switched off still received the
 * company's sites, workers, vendors, subcontractors, staff and client advances.
 *
 * Now every page runs `resolveTenantPageAccess` for its permission + module on the live
 * principal before its first data query, scopes each read to the live company, and lists
 * only live sites.
 *
 * `@/lib/permissions`, `@/lib/pages/tenant-page-access` and `@/lib/auth/site-mutation`
 * are real.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireUser: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  prisma: {
    company: { findFirst: vi.fn(), findUnique: vi.fn() },
    companyMember: { findFirst: vi.fn(), findMany: vi.fn() },
    site: { findMany: vi.fn() },
    labour: { findMany: vi.fn() },
    vendor: { findMany: vi.fn() },
    subcontractor: { findMany: vi.fn() },
    payment: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('@/lib/audit', () => ({ logActivity: vi.fn() }))
vi.mock('@/app/(dashboard)/labour/LabourCardList', () => ({ LabourCardList: () => null }))
vi.mock('@/app/(dashboard)/vendors/VendorCardList', () => ({ VendorCardList: () => null }))
vi.mock('@/app/(dashboard)/subcontractors/SubCardList', () => ({ SubCardList: () => null }))

type Page = () => Promise<unknown>

const PAGES: Array<{ path: string; load: () => Promise<{ default: Page }>; allowed: string; module: string; reads: () => ReturnType<typeof vi.fn>[] }> = [
  { path: '/boq/new', load: () => import('@/app/(dashboard)/boq/new/page'), allowed: 'PROJECT_MANAGER', module: 'BOQ', reads: () => [mocks.prisma.site.findMany] },
  { path: '/labour/new', load: () => import('@/app/(dashboard)/labour/new/page'), allowed: 'COMPANY_ADMIN', module: 'LABOUR', reads: () => [mocks.prisma.site.findMany] },
  { path: '/labour', load: () => import('@/app/(dashboard)/labour/page'), allowed: 'PROJECT_MANAGER', module: 'LABOUR', reads: () => [mocks.prisma.labour.findMany, mocks.prisma.site.findMany] },
  { path: '/materials/new', load: () => import('@/app/(dashboard)/materials/new/page'), allowed: 'PROJECT_MANAGER', module: 'MATERIALS', reads: () => [mocks.prisma.site.findMany] },
  { path: '/purchase/new', load: () => import('@/app/(dashboard)/purchase/new/page'), allowed: 'PURCHASE_MANAGER', module: 'MATERIALS', reads: () => [mocks.prisma.vendor.findMany] },
  { path: '/vendors/new', load: () => import('@/app/(dashboard)/vendors/new/page'), allowed: 'PURCHASE_MANAGER', module: 'MATERIALS', reads: () => [mocks.prisma.site.findMany] },
  { path: '/vendors', load: () => import('@/app/(dashboard)/vendors/page'), allowed: 'ACCOUNTANT', module: 'MATERIALS', reads: () => [mocks.prisma.vendor.findMany] },
  { path: '/subcontractors/new', load: () => import('@/app/(dashboard)/subcontractors/new/page'), allowed: 'PURCHASE_MANAGER', module: 'MATERIALS', reads: () => [mocks.prisma.site.findMany] },
  { path: '/subcontractors', load: () => import('@/app/(dashboard)/subcontractors/page'), allowed: 'ACCOUNTANT', module: 'MATERIALS', reads: () => [mocks.prisma.subcontractor.findMany] },
  { path: '/tasks/new', load: () => import('@/app/(dashboard)/tasks/new/page'), allowed: 'PROJECT_MANAGER', module: 'TASKS', reads: () => [mocks.prisma.site.findMany, mocks.prisma.companyMember.findMany] },
  { path: '/clients/new', load: () => import('@/app/(dashboard)/clients/new/page'), allowed: 'ACCOUNTANT', module: 'CLIENTS', reads: () => [mocks.prisma.site.findMany] },
  { path: '/clients/advances', load: () => import('@/app/(dashboard)/clients/advances/page'), allowed: 'ACCOUNTANT', module: 'CLIENTS', reads: () => [mocks.prisma.payment.findMany, mocks.prisma.site.findMany] },
]

const ALL_MODULES = ['SITES', 'BOQ', 'LABOUR', 'MATERIALS', 'TASKS', 'CLIENTS']

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

function dataReads() {
  return [
    mocks.prisma.site.findMany, mocks.prisma.labour.findMany, mocks.prisma.vendor.findMany,
    mocks.prisma.subcontractor.findMany, mocks.prisma.payment.findMany, mocks.prisma.companyMember.findMany,
  ]
}

function expectNoDataReads() {
  for (const read of dataReads()) expect(read).not.toHaveBeenCalled()
}

let modules: unknown

beforeEach(() => {
  vi.clearAllMocks()
  modules = ALL_MODULES
  mocks.auth.mockResolvedValue({ user: { id: 'user_token', role: 'COMPANY_ADMIN', companyId: 'company_2' } })
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findFirst.mockImplementation(async () => ({ modulesJson: modules }))
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: [] })
  for (const read of dataReads()) read.mockResolvedValue([])
})

describe.each(PAGES)('$path', ({ path, load, allowed, module, reads }) => {
  it('refuses a revoked principal whose token is still valid, before any data read', async () => {
    const { default: page } = await load()
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))
    await expect(page()).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.auth).not.toHaveBeenCalled()
    expectNoDataReads()
  })

  it('turns away a live CLIENT even when the token still names a staff role', async () => {
    const { default: page } = await load()
    mocks.requireUser.mockResolvedValue(principal('CLIENT'))
    await expect(page()).rejects.toThrow('NEXT_REDIRECT:/client-portal')
    expectNoDataReads()
  })

  it(`turns away when ${module} is disabled for the live company`, async () => {
    const { default: page } = await load()
    modules = ALL_MODULES.filter((name) => name !== module)
    await expect(page()).rejects.toThrow(/NEXT_REDIRECT|NEXT_NOT_FOUND/)
    expectNoDataReads()
  })

  it('reads only the live company, never the token company', async () => {
    const { default: page } = await load()
    mocks.requireUser.mockResolvedValue(principal(allowed))
    await page()
    for (const read of reads()) {
      expect(read).toHaveBeenCalled()
      for (const [args] of read.mock.calls) expect(JSON.stringify(args.where)).not.toContain('company_2')
      expect(read.mock.calls[0][0].where).toMatchObject({ companyId: 'company_1' })
    }
    if (reads().includes(mocks.prisma.site.findMany)) {
      expect(mocks.prisma.site.findMany.mock.calls[0][0].where).toMatchObject({ companyId: 'company_1', deletedAt: null })
    }
    expect(path).toBeTruthy()
  })
})

describe('list scoping', () => {
  it('the labour list omits workers whose site is soft deleted', async () => {
    const { default: page } = await import('@/app/(dashboard)/labour/page')
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER'))
    await page()
    expect(mocks.prisma.labour.findMany.mock.calls[0][0].where).toMatchObject({ companyId: 'company_1', site: { deletedAt: null } })
  })

  it('the task assignee list offers only active members of the live company', async () => {
    const { default: page } = await import('@/app/(dashboard)/tasks/new/page')
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER'))
    await page()
    expect(mocks.prisma.companyMember.findMany.mock.calls[0][0].where).toEqual({ companyId: 'company_1', isActive: true })
  })

  it('a field role sees only its assigned sites on the material form', async () => {
    const { default: page } = await import('@/app/(dashboard)/materials/new/page')
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    await page()
    expect(mocks.prisma.site.findMany.mock.calls[0][0].where).toMatchObject({
      companyId: 'company_1', deletedAt: null, OR: expect.arrayContaining([{ engineerId: 'user_site_engineer' }]),
    })
  })
})
