import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression for `/client-accounts` listing every CLIENT login of the company — names,
 * emails, phone numbers, last login and site assignments — to any member of it.
 *
 * The page checked only that the principal had a company; every server action on it
 * already required `company.manage`, but the list itself was open to a site engineer,
 * a supervisor or even a CLIENT.
 *
 * Now the page runs `resolveTenantPageAccess` on `company.manage` — the same
 * least-privilege grant as its actions and the employee pages — before any CLIENT or
 * site read. `@/lib/permissions` and `@/lib/pages/tenant-page-access` are real.
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
    company: { findFirst: vi.fn() },
    companyMember: { findMany: vi.fn() },
    site: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/link', () => ({ default: () => null }))
vi.mock('@/lib/audit', () => ({ logActivity: vi.fn() }))
vi.mock('@/components/ui/DangerConfirmSubmit', () => ({ default: () => null }))

const { default: ClientAccountsPage } = await import('@/app/(dashboard)/client-accounts/page')

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: `${role} Person`, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

const P = <T,>(value: T) => Promise.resolve(value)

function dataReads() {
  return [mocks.prisma.companyMember.findMany, mocks.prisma.site.findMany]
}

function expectNoReads() {
  for (const fn of dataReads()) expect(fn).not.toHaveBeenCalled()
  expect(mocks.prisma.company.findFirst).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  // The JWT claims an admin of another tenant; only the live principal may decide.
  mocks.auth.mockResolvedValue({ user: { id: 'jwt_user', companyId: 'company_jwt', role: 'COMPANY_ADMIN' } })
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: null })
  mocks.prisma.companyMember.findMany.mockResolvedValue([])
  mocks.prisma.site.findMany.mockResolvedValue([])
})

describe('ClientAccountsPage gate', () => {
  it('refuses a revoked principal before any read and never consults the JWT', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    await expect(ClientAccountsPage({ searchParams: P({}) })).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.auth).not.toHaveBeenCalled()
    expectNoReads()
  })

  it('sends a SUPER_ADMIN, which carries no tenant context, away before any read', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root', name: 'Root', email: 'root@platform.test', role: 'SUPER_ADMIN' })

    await expect(ClientAccountsPage({ searchParams: P({}) })).rejects.toThrow('NEXT_REDIRECT:/super-admin/dashboard')
    expectNoReads()
  })

  it.each(['PROJECT_MANAGER', 'ACCOUNTANT', 'PURCHASE_MANAGER', 'SUPERVISOR', 'SITE_ENGINEER', 'CLIENT', 'VENDOR', 'SUBCONTRACTOR'])(
    'turns a live %s without company.manage away before any CLIENT or site read',
    async (role) => {
      mocks.requireUser.mockResolvedValue(principal(role))

      await expect(ClientAccountsPage({ searchParams: P({}) })).rejects.toThrow(/NEXT_REDIRECT|NEXT_NOT_FOUND/)
      expectNoReads()
    },
  )

  it('lists CLIENT logins and sites of the live company only for company.manage', async () => {
    await ClientAccountsPage({ searchParams: P({}) })

    expect(mocks.prisma.company.findFirst).toHaveBeenCalledWith({ where: { id: 'company_1', deletedAt: null }, select: { modulesJson: true } })
    expect(mocks.prisma.companyMember.findMany.mock.calls[0][0].where).toEqual({ companyId: 'company_1', role: 'CLIENT' })
    expect(mocks.prisma.site.findMany.mock.calls[0][0].where).toEqual({ companyId: 'company_1', deletedAt: null, status: 'ACTIVE' })
    expect(mocks.prisma.company.findFirst.mock.invocationCallOrder[0]).toBeLessThan(mocks.prisma.companyMember.findMany.mock.invocationCallOrder[0])
  })

  it('refuses an admin whose company is gone before any read', async () => {
    mocks.prisma.company.findFirst.mockResolvedValue(null)

    await expect(ClientAccountsPage({ searchParams: P({}) })).rejects.toThrow('NEXT_REDIRECT:/login')
    for (const fn of dataReads()) expect(fn).not.toHaveBeenCalled()
  })
})
