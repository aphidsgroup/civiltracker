import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression for the super-admin layout and pages trusting the JWT role claim.
 *
 * The layout and every server page (except support) admitted any session whose token said
 * `SUPER_ADMIN`, so a super admin who was demoted or deactivated kept reading every
 * company, user, subscription, audit log and storage figure until the token expired. The
 * layout and its pages render in parallel, so the layout check alone never protected a
 * page's queries.
 *
 * Now the layout and each page call `requireSuperAdminPage`, which resolves the live,
 * DB-confirmed principal before any query: a stale session goes to `/login`, a live
 * non-super-admin to its own home, and neither causes a single database read.
 */
const mocks = vi.hoisted(() => {
  const touched: string[] = []
  const delegate = (model: string) =>
    new Proxy({}, {
      get: (_target, op) => {
        if (op === 'then') return undefined
        return (..._args: unknown[]) => {
          touched.push(`${model}.${String(op)}`)
          if (op === 'count') return Promise.resolve(0)
          if (op === 'findMany' || op === 'groupBy') return Promise.resolve([])
          if (op === 'aggregate') return Promise.resolve({ _sum: {} })
          return Promise.resolve(null)
        }
      },
    })
  const prisma = new Proxy({}, {
    get: (_target, model) => (model === 'then' ? undefined : delegate(String(model))),
  })
  return {
    touched,
    prisma,
    auth: vi.fn(),
    requireUser: vi.fn(),
    getSupportApprovalOverview: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`)
    }),
    notFound: vi.fn(() => {
      throw new Error('NEXT_NOT_FOUND')
    }),
  }
})

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), unstable_cache: (fn: () => unknown) => fn }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('@/lib/approvals/support-overview', () => ({ getSupportApprovalOverview: mocks.getSupportApprovalOverview }))
vi.mock('@/components/responsive/ResponsiveShell', () => ({ default: () => null }))
vi.mock('@/components/layout/SuperAdminSidebar', () => ({ default: () => null }))
vi.mock('@/components/layout/SuperAdminTopbar', () => ({ default: () => null }))

const id = Promise.resolve({ id: 'target_1' })
const searchParams = Promise.resolve({})

const ROUTES: Array<[string, () => Promise<unknown>]> = [
  ['layout', async () => (await import('@/app/(super-admin)/layout')).default({ children: null })],
  ['dashboard', async () => (await import('@/app/(super-admin)/super-admin/dashboard/page')).default()],
  ['companies', async () => (await import('@/app/(super-admin)/super-admin/companies/page')).default({ searchParams })],
  ['companies/[id]', async () => (await import('@/app/(super-admin)/super-admin/companies/[id]/page')).default({ params: id })],
  ['users', async () => (await import('@/app/(super-admin)/super-admin/users/page')).default()],
  ['users/[id]', async () => (await import('@/app/(super-admin)/super-admin/users/[id]/page')).default({ params: id })],
  ['module-controls', async () => (await import('@/app/(super-admin)/super-admin/module-controls/page')).default()],
  ['subscriptions', async () => (await import('@/app/(super-admin)/super-admin/subscriptions/page')).default()],
  ['system-logs', async () => (await import('@/app/(super-admin)/super-admin/system-logs/page')).default()],
  ['storage', async () => (await import('@/app/(super-admin)/super-admin/storage/page')).default()],
  ['settings', async () => (await import('@/app/(super-admin)/super-admin/settings/page')).default()],
  ['support', async () => (await import('@/app/(super-admin)/super-admin/support/page')).default()],
]

function superAdmin() {
  return { id: 'user_root', name: 'Root', email: 'root@civiltracker.test', role: 'SUPER_ADMIN' }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.touched.length = 0
  // The token still claims SUPER_ADMIN; only the live principal may decide.
  mocks.auth.mockResolvedValue({ user: { id: 'user_root', role: 'SUPER_ADMIN' } })
  mocks.requireUser.mockResolvedValue(superAdmin())
  mocks.getSupportApprovalOverview.mockResolvedValue({ pendingApprovals: [], totalPending: 0, totalApproved: 0, totalCompanies: 0 })
})

describe.each(ROUTES)('super-admin %s', (_name, render) => {
  it('sends a stale or deactivated session to /login before any query', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Account is inactive'))
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/login')
    expect(mocks.touched).toEqual([])
    expect(mocks.getSupportApprovalOverview).not.toHaveBeenCalled()
  })

  it('turns away a demoted principal whose token still says SUPER_ADMIN', async () => {
    mocks.requireUser.mockResolvedValue({ ...superAdmin(), role: 'COMPANY_ADMIN', companyId: 'company_1' })
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/dashboard')
    expect(mocks.touched).toEqual([])
    expect(mocks.getSupportApprovalOverview).not.toHaveBeenCalled()
  })

  it('never decides from the JWT', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Account is inactive'))
    await expect(render()).rejects.toThrow()
    expect(mocks.auth).not.toHaveBeenCalled()
  })
})

describe('live super admin', () => {
  it('the layout renders for a DB-confirmed super admin', async () => {
    const { default: Layout } = await import('@/app/(super-admin)/layout')
    await expect(Layout({ children: null })).resolves.toBeTruthy()
    expect(mocks.requireUser).toHaveBeenCalled()
    expect(mocks.touched).toContain('company.count')
  })

  it('the settings page renders for a DB-confirmed super admin', async () => {
    const { default: Settings } = await import('@/app/(super-admin)/super-admin/settings/page')
    await expect(Settings()).resolves.toBeTruthy()
  })
})
