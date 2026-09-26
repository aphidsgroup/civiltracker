import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for the mobile DPR page.
 *
 * The page listed the sites of whatever company the JWT claimed before anything checked
 * `dpr.create` on the live principal, so a revoked member, or a role that may never file
 * a DPR, could still enumerate the tenant's site names and ids from the site picker. It
 * then listed *every* ACTIVE company site to a SITE_ENGINEER or SUPERVISOR and ignored
 * the DPR module entirely.
 *
 * Now the live principal, `dpr.create` and the DPR module are checked before any site
 * query, and only ACTIVE live sites in the principal's `assignedSiteScope` are listed: a
 * field role sees its assigned sites only, and none at all without an assignment.
 * SUPER_ADMIN carries no company context and `createDpr` refuses it, so the page does too.
 * The write itself stays in the hardened `createDpr` action.
 *
 * `@/lib/pages/tenant-page-access`, `@/lib/auth/site-mutation` and `@/lib/permissions`
 * are real.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireUser: vi.fn(),
  createDpr: vi.fn(),
  formProps: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  prisma: {
    company: { findFirst: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('@/actions/dpr', () => ({ createDpr: mocks.createDpr }))
vi.mock('@/app/(mobile)/mobile/dpr/DprFormClient', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.formProps(props)
    return null
  },
}))

const { default: MobileDprPage } = await import('@/app/(mobile)/mobile/dpr/page')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', name: 'Tower A', deletedAt: null, status: 'ACTIVE', assignedEngineerId: 'user_supervisor', engineerId: null },
  { id: 'site_listed', companyId: 'company_1', name: 'Listed', deletedAt: null, status: 'ACTIVE', assignedEngineerId: null, engineerId: null },
  { id: 'site_theirs', companyId: 'company_1', name: 'Theirs', deletedAt: null, status: 'ACTIVE', assignedEngineerId: 'someone_else', engineerId: null },
  { id: 'site_hold', companyId: 'company_1', name: 'On hold', deletedAt: null, status: 'ON_HOLD', assignedEngineerId: 'user_supervisor', engineerId: null },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', deletedAt: new Date('2026-01-01'), status: 'ACTIVE', assignedEngineerId: 'user_supervisor', engineerId: null },
  { id: 'site_other', companyId: 'company_2', name: 'Other tenant', deletedAt: null, status: 'ACTIVE', assignedEngineerId: 'user_supervisor', engineerId: null },
]

function principal(role: string, companyId: string | undefined = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

/** Active members without `dpr.create`. */
const ROLES_WITHOUT_DPR_CREATE = ['ACCOUNTANT', 'PURCHASE_MANAGER', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'] as const

let modules: unknown
let memberSiteIds: string[]

async function render(siteId?: string) {
  return renderToStaticMarkup(await MobileDprPage({ searchParams: Promise.resolve({ siteId }) }))
}

function listedSiteIds() {
  const { sites } = mocks.formProps.mock.calls[0][0] as { sites: Row[] }
  return sites.map((site) => site.id)
}

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['DPR']
  memberSiteIds = ['site_listed']
  // The JWT always claims company_1 and an admin role; only the live principal decides.
  mocks.auth.mockResolvedValue({ user: { id: 'user_1', companyId: 'company_1', role: 'COMPANY_ADMIN' } })
  mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))
  mocks.prisma.company.findFirst.mockImplementation(async () => ({ modulesJson: modules }))
  mocks.prisma.companyMember.findFirst.mockImplementation(async () => ({ siteIds: memberSiteIds }))
  mocks.prisma.site.findMany.mockImplementation(inMemoryDelegate(SITES).findMany)
})

describe('MobileDprPage read authorization', () => {
  it('refuses a revoked principal before any site query, even with a valid JWT', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    await expect(render()).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.prisma.site.findMany).not.toHaveBeenCalled()
    expect(mocks.formProps).not.toHaveBeenCalled()
  })

  it.each(ROLES_WITHOUT_DPR_CREATE)('turns an active %s away before any site query', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    await expect(render()).rejects.toThrow(/NEXT_REDIRECT/)
    expect(mocks.prisma.site.findMany).not.toHaveBeenCalled()
    expect(mocks.formProps).not.toHaveBeenCalled()
  })

  it('turns a SUPER_ADMIN, which has no company context, away before any site query', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root_1', name: 'Root', email: 'root@platform.test', role: 'SUPER_ADMIN' })

    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/super-admin/dashboard')
    expect(mocks.prisma.site.findMany).not.toHaveBeenCalled()
  })

  it('turns the principal away before any site query when the DPR module is disabled', async () => {
    modules = ['SITES', 'LABOUR']

    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/mobile/home')
    expect(mocks.prisma.site.findMany).not.toHaveBeenCalled()
    expect(mocks.formProps).not.toHaveBeenCalled()
  })
})

describe('MobileDprPage assigned-site picker', () => {
  it.each(['SUPERVISOR', 'SITE_ENGINEER'])('lists a %s only its ACTIVE assigned live sites', async (role) => {
    mocks.requireUser.mockResolvedValue({ ...principal(role), id: 'user_supervisor' })

    await render('site_1')

    expect(listedSiteIds().sort()).toEqual(['site_1', 'site_listed'])
    expect(mocks.formProps).toHaveBeenCalledWith(expect.objectContaining({ defaultSiteId: 'site_1' }))
  })

  it('lists nothing to a field role with no assignment at all', async () => {
    mocks.requireUser.mockResolvedValue({ ...principal('SUPERVISOR'), id: 'user_unassigned' })
    memberSiteIds = []

    await render('site_theirs')

    expect(listedSiteIds()).toEqual([])
    expect(mocks.formProps).toHaveBeenCalledWith(expect.objectContaining({ defaultSiteId: undefined }))
  })

  it('never preselects a site outside the picker', async () => {
    mocks.requireUser.mockResolvedValue({ ...principal('SUPERVISOR'), id: 'user_supervisor' })

    await render('site_theirs')

    expect(mocks.formProps).toHaveBeenCalledWith(expect.objectContaining({ defaultSiteId: undefined }))
  })

  it('lists every ACTIVE live site of the live company to a PROJECT_MANAGER', async () => {
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER'))

    await render()

    expect(listedSiteIds().sort()).toEqual(['site_1', 'site_listed', 'site_theirs'])
  })

  it('uses the live company rather than the JWT claim', async () => {
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER', 'company_2'))

    await render()

    expect(mocks.prisma.site.findMany.mock.calls[0][0].where).toMatchObject({ companyId: 'company_2' })
    expect(listedSiteIds()).toEqual(['site_other'])
  })
})
