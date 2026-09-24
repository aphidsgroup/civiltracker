import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for the mobile DPR page found at f3c09f6.
 *
 * The page listed the sites of whatever company the JWT claimed before anything checked
 * `dpr.create` on the live principal, so a revoked member, or a role that may never file
 * a DPR, could still enumerate the tenant's site names and ids from the site picker.
 *
 * Now the live principal and `dpr.create` are checked before any site query, and only
 * live, active sites of the principal's exact company are listed. SUPER_ADMIN carries no
 * company context and `createDpr` refuses it anyway, so the page turns it away too.
 * The write itself stays in the hardened `createDpr` action.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireUser: vi.fn(),
  createDpr: vi.fn(),
  formProps: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  prisma: {
    site: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/actions/dpr', () => ({ createDpr: mocks.createDpr }))
vi.mock('@/app/(mobile)/mobile/dpr/DprFormClient', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.formProps(props)
    return null
  },
}))

const { default: MobileDprPage } = await import('@/app/(mobile)/mobile/dpr/page')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', name: 'Tower A', deletedAt: null, status: 'ACTIVE' },
  { id: 'site_hold', companyId: 'company_1', name: 'On hold', deletedAt: null, status: 'ON_HOLD' },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', deletedAt: new Date('2026-01-01'), status: 'ACTIVE' },
  { id: 'site_other', companyId: 'company_2', name: 'Other tenant', deletedAt: null, status: 'ACTIVE' },
]

function principal(role: string, companyId: string | undefined = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

/** Active members without `dpr.create`. */
const ROLES_WITHOUT_DPR_CREATE = ['ACCOUNTANT', 'PURCHASE_MANAGER', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'] as const

async function render(siteId?: string) {
  return renderToStaticMarkup(await MobileDprPage({ searchParams: Promise.resolve({ siteId }) }))
}

beforeEach(() => {
  vi.clearAllMocks()
  // The JWT always claims company_1; only the live principal decides.
  mocks.auth.mockResolvedValue({ user: { id: 'user_1', companyId: 'company_1', role: 'SUPERVISOR' } })
  mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))
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

  it('lists only live, active sites of the live principal company', async () => {
    await render('site_1')

    expect(mocks.prisma.site.findMany.mock.calls[0][0].where).toEqual({
      companyId: 'company_1',
      deletedAt: null,
      status: 'ACTIVE',
    })
    expect(mocks.formProps).toHaveBeenCalledWith(
      expect.objectContaining({ sites: [{ id: 'site_1', companyId: 'company_1', name: 'Tower A', deletedAt: null, status: 'ACTIVE' }], defaultSiteId: 'site_1' })
    )
  })

  it('uses the live company rather than the JWT claim', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER', 'company_2'))

    await render()

    expect(mocks.prisma.site.findMany.mock.calls[0][0].where).toMatchObject({ companyId: 'company_2' })
    const { sites } = mocks.formProps.mock.calls[0][0] as { sites: Row[] }
    expect(sites.map((site) => site.id)).toEqual(['site_other'])
  })
})
