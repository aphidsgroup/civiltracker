import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The shared read gate every hardened tenant page runs before its first data query.
 *
 * The pages it replaces authorized from the JWT: `auth()` claims decided the company and
 * the role, so a revoked member, a demoted role or a suspended tenant kept reading until
 * the token expired. The gate resolves the live principal instead, turns SUPER_ADMIN
 * (no tenant context) away, checks the permission on the live role before any query, and
 * only then loads the company modules to check the module paired with that permission.
 *
 * `@/lib/permissions` is the real matrix.
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
  prisma: { company: { findFirst: vi.fn(), findUnique: vi.fn() } },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))

const { resolveTenantPageAccess, exitDeniedPage, liveCompanySiteWhere } = await import('@/lib/pages/tenant-page-access')

// A default parameter would also replace an explicit `undefined`, so only an omitted
// argument falls back to company_1; `principal(role, undefined)` truly has no company.
function principal(role: string, ...company: [companyId?: string]) {
  const companyId = company.length > 0 ? company[0] : 'company_1'
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

const EXPENSE_READ = { grants: [{ permission: 'expenses.view' as const, module: 'EXPENSES' }] }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: null })
})

describe('resolveTenantPageAccess', () => {
  it('propagates a revoked principal without reading the JWT or any company data', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    await expect(resolveTenantPageAccess(EXPENSE_READ)).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.auth).not.toHaveBeenCalled()
    expect(mocks.prisma.company.findFirst).not.toHaveBeenCalled()
  })

  it('turns a SUPER_ADMIN away to the platform dashboard before any query', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root', name: 'Root', email: 'root@platform.test', role: 'SUPER_ADMIN' })

    await expect(resolveTenantPageAccess(EXPENSE_READ)).resolves.toEqual({ status: 'denied', redirectTo: '/super-admin/dashboard' })
    expect(mocks.prisma.company.findFirst).not.toHaveBeenCalled()
  })

  it('denies a principal without a live company context', async () => {
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER', undefined))

    await expect(resolveTenantPageAccess(EXPENSE_READ)).resolves.toEqual({ status: 'denied', redirectTo: '/login' })
    expect(mocks.prisma.company.findFirst).not.toHaveBeenCalled()
  })

  it.each(['SITE_ENGINEER', 'SUPERVISOR', 'PURCHASE_MANAGER', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'])(
    'denies a live %s without expenses.view before any query',
    async (role) => {
      mocks.requireUser.mockResolvedValue(principal(role))

      const result = await resolveTenantPageAccess(EXPENSE_READ)
      expect(result.status).toBe('denied')
      expect(mocks.prisma.company.findFirst).not.toHaveBeenCalled()
    }
  )

  it('denies when the module paired with the held permission is disabled', async () => {
    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: ['bills'] })

    const result = await resolveTenantPageAccess(EXPENSE_READ)
    expect(result.status).toBe('denied')
    expect(mocks.prisma.company.findFirst).toHaveBeenCalledWith({
      where: { id: 'company_1', deletedAt: null },
      select: { modulesJson: true },
    })
  })

  it('does not let a module enabled for another grant open a grant whose module is off', async () => {
    // ACCOUNTANT holds bills.view and expenses.view; only EXPENSES is on, so only the
    // expenses grant may open the page — the bills grant must not borrow its module.
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))
    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: ['expenses'] })

    const billsOnly = await resolveTenantPageAccess({ grants: [{ permission: 'bills.view', module: 'BILLS' }] })
    expect(billsOnly.status).toBe('denied')

    const either = await resolveTenantPageAccess({
      grants: [
        { permission: 'bills.view', module: 'BILLS' },
        { permission: 'expenses.view', module: 'EXPENSES' },
      ],
    })
    expect(either.status).toBe('ok')
  })

  it('grants on the live principal company and exposes live permission and module checks', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT', 'company_2'))
    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: { expenses: true, labour: false } })

    const result = await resolveTenantPageAccess(EXPENSE_READ)
    if (result.status !== 'ok') throw new Error('expected access')

    expect(result.access.companyId).toBe('company_2')
    expect(result.access.can('salary.view')).toBe(true)
    expect(result.access.can('sites.view')).toBe(false)
    expect(result.access.moduleEnabled('EXPENSES')).toBe(true)
    expect(result.access.moduleEnabled('LABOUR')).toBe(false)
    expect(mocks.auth).not.toHaveBeenCalled()
  })

  it('denies a company that no longer exists or was soft deleted', async () => {
    mocks.prisma.company.findFirst.mockResolvedValue(null)

    expect((await resolveTenantPageAccess(EXPENSE_READ)).status).toBe('denied')
  })
})

describe('exitDeniedPage', () => {
  it('redirects to the denial target', () => {
    expect(() => exitDeniedPage({ status: 'denied', redirectTo: '/mobile/home' }, '/expenses')).toThrow('NEXT_REDIRECT:/mobile/home')
  })

  it('answers not found instead of redirecting a page onto itself', () => {
    expect(() => exitDeniedPage({ status: 'denied', redirectTo: '/dashboard' }, '/dashboard')).toThrow('NEXT_NOT_FOUND')
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})

describe('liveCompanySiteWhere', () => {
  it('binds to a live site of exactly the given company', () => {
    expect(liveCompanySiteWhere('company_1')).toEqual({ companyId: 'company_1', deletedAt: null })
  })
})
