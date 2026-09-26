import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression for super-admin actions trusting the JWT role claim.
 *
 * `changeSuperAdminPassword`, `deleteCompany` and `deleteUser` checked
 * `session.user.role === 'SUPER_ADMIN'` and nothing else. A demoted or deactivated super
 * admin kept full platform power until their token expired, and a forged or stale claim
 * was enough to delete any company or user.
 *
 * Now each action resolves the live principal from the database (`requireSuperAdmin` →
 * `requireUser`) before reading or writing anything, and acts and audits as that
 * principal, never as the session's claims.
 *
 * `@/lib/auth/require-user` and `@/lib/auth/require-super-admin` are real.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  logActivity: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  hash: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    company: { findUnique: vi.fn(), delete: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('bcryptjs', () => ({ default: { hash: mocks.hash } }))

const actions = await import('@/actions/super-admin')

type LiveUser = { id: string; email: string; name: string | null; role: string; isActive: boolean }

const LIVE_SUPER: LiveUser = { id: 'sa_1', email: 'root@platform.test', name: 'Root', role: 'SUPER_ADMIN', isActive: true }
const TARGET_USER = {
  id: 'user_b', name: 'Bea', email: 'bea@beta.test', role: 'COMPANY_ADMIN', isActive: true,
  companyMembers: [{ companyId: 'company_b', company: { name: 'Beta' } }],
}
const TARGET_COMPANY = {
  id: 'company_b', name: 'Beta', email: 'ops@beta.test', status: 'ACTIVE', plan: 'PRO', _count: { sites: 2, members: 3 },
}

let liveUsers: Record<string, LiveUser | null>

function session(user: Partial<{ id: string; role: string; name: string; email: string; companyId: string }>) {
  return { user: { name: 'Claimed', email: 'claimed@x.test', ...user } }
}

const ACTIONS: Array<[string, () => Promise<unknown>]> = [
  ['changeSuperAdminPassword', () => actions.changeSuperAdminPassword('new-secret')],
  ['deleteCompany', () => actions.deleteCompany('company_b', 'Beta')],
  ['deleteUser', () => actions.deleteUser('user_b', 'bea@beta.test')],
]

function expectNoTargetPrismaCalls() {
  expect(mocks.prisma.user.update).not.toHaveBeenCalled()
  expect(mocks.prisma.user.delete).not.toHaveBeenCalled()
  expect(mocks.prisma.company.findUnique).not.toHaveBeenCalled()
  expect(mocks.prisma.company.delete).not.toHaveBeenCalled()
  // Only the principal lookup may touch users.
  for (const [args] of mocks.prisma.user.findUnique.mock.calls) {
    expect(args.select).not.toHaveProperty('companyMembers')
  }
  expect(mocks.logActivity).not.toHaveBeenCalled()
  expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  expect(mocks.hash).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  liveUsers = { sa_1: LIVE_SUPER }
  mocks.auth.mockResolvedValue(session({ id: 'sa_1', role: 'SUPER_ADMIN' }))
  mocks.hash.mockResolvedValue('hashed')
  mocks.prisma.user.findUnique.mockImplementation(async ({ where, select }: { where: { id: string }; select: Record<string, unknown> }) => {
    if (select?.companyMembers) return where.id === TARGET_USER.id ? TARGET_USER : null
    return liveUsers[where.id] ?? null
  })
  mocks.prisma.user.findFirst.mockImplementation(async ({ where }: { where: { id: string; role: string; isActive: boolean } }) => {
    const live = liveUsers[where.id]
    return live && live.role === where.role && live.isActive === where.isActive ? { id: live.id } : null
  })
  mocks.prisma.company.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === TARGET_COMPANY.id ? TARGET_COMPANY : null)
  mocks.prisma.auditLog.create.mockResolvedValue({})
  // The destructive actions run on the transaction client; here it is the same mock.
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.prisma) => unknown) => fn(mocks.prisma))
  mocks.prisma.companyMember.findFirst.mockResolvedValue({
    companyId: 'company_a', role: 'COMPANY_ADMIN', moduleControls: null,
    company: { slug: 'alpha', name: 'Alpha', status: 'ACTIVE', deletedAt: null },
  })
})

describe('super-admin actions: live principal gate', () => {
  it.each(ACTIONS)('%s rejects an unauthenticated caller before Prisma', async (_name, invoke) => {
    mocks.auth.mockResolvedValue(null)
    await expect(invoke()).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled()
    expectNoTargetPrismaCalls()
  })

  it.each(ACTIONS)('%s rejects a stale SUPER_ADMIN token for a demoted account', async (_name, invoke) => {
    liveUsers.sa_1 = { ...LIVE_SUPER, role: 'COMPANY_ADMIN' }
    mocks.auth.mockResolvedValue(session({ id: 'sa_1', role: 'SUPER_ADMIN', companyId: 'company_a' }))
    await expect(invoke()).rejects.toThrow(/FORBIDDEN: Super admin access required/)
    expectNoTargetPrismaCalls()
  })

  it.each(ACTIONS)('%s rejects a stale SUPER_ADMIN token for a deactivated account', async (_name, invoke) => {
    liveUsers.sa_1 = { ...LIVE_SUPER, isActive: false }
    await expect(invoke()).rejects.toThrow(/UNAUTHORIZED: Account is inactive/)
    expectNoTargetPrismaCalls()
  })

  it.each(ACTIONS)('%s rejects a SUPER_ADMIN token for a deleted account', async (_name, invoke) => {
    liveUsers.sa_1 = null
    await expect(invoke()).rejects.toThrow(/UNAUTHORIZED/)
    expectNoTargetPrismaCalls()
  })

  it.each(ACTIONS)('%s rejects a forged SUPER_ADMIN claim from a tenant admin of another company', async (_name, invoke) => {
    liveUsers.user_a = { id: 'user_a', email: 'a@alpha.test', name: 'Al', role: 'COMPANY_ADMIN', isActive: true }
    mocks.auth.mockResolvedValue(session({ id: 'user_a', role: 'SUPER_ADMIN', companyId: 'company_a' }))
    await expect(invoke()).rejects.toThrow(/FORBIDDEN: Super admin access required/)
    expectNoTargetPrismaCalls()
  })

  it.each(ACTIONS)('%s rejects a forged SUPER_ADMIN claim without any company context', async (_name, invoke) => {
    liveUsers.user_a = { id: 'user_a', email: 'a@alpha.test', name: 'Al', role: 'PROJECT_MANAGER', isActive: true }
    mocks.auth.mockResolvedValue(session({ id: 'user_a', role: 'SUPER_ADMIN' }))
    await expect(invoke()).rejects.toThrow(/UNAUTHORIZED: Company context required/)
    expectNoTargetPrismaCalls()
  })
})

describe('super-admin actions: legitimate live super admin', () => {
  it('changes only the live principal password and audits as the live principal', async () => {
    mocks.auth.mockResolvedValue(session({ id: 'sa_1', role: 'SUPER_ADMIN', name: 'Forged Name' }))
    await expect(actions.changeSuperAdminPassword('new-secret')).resolves.toEqual({ success: true })
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({ where: { id: 'sa_1' }, data: { passwordHash: 'hashed' } })
    expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'sa_1', companyId: null, recordId: 'sa_1', description: expect.stringMatching(/^Root /),
    }))
  })

  it('rejects a short password before hashing or writing', async () => {
    await expect(actions.changeSuperAdminPassword('123')).rejects.toThrow(/at least 6/)
    expect(mocks.hash).not.toHaveBeenCalled()
    expect(mocks.prisma.user.update).not.toHaveBeenCalled()
  })

  it('deletes a company in any tenant and audits as the live principal', async () => {
    await actions.deleteCompany('company_b', 'Beta')
    expect(mocks.prisma.company.delete).toHaveBeenCalledWith({ where: { id: 'company_b' } })
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: 'sa_1', companyId: null, action: 'DELETE', module: 'COMPANY', recordId: 'company_b',
      after: { _description: expect.stringMatching(/^Root permanently deleted company "Beta"/) },
    }) })
    expect(mocks.redirect).toHaveBeenCalledWith('/super-admin/companies')
  })

  it('rejects an unknown company before deleting', async () => {
    await expect(actions.deleteCompany('missing', 'Beta')).rejects.toThrow(/Company not found/)
    expect(mocks.prisma.company.delete).not.toHaveBeenCalled()
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
  })

  it('deletes a user in another company and audits against that user company', async () => {
    await actions.deleteUser('user_b', 'bea@beta.test')
    expect(mocks.prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user_b' } })
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: 'sa_1', companyId: 'company_b', module: 'USER', recordId: 'user_b',
      after: { _description: expect.stringMatching(/^Root permanently deleted user "Bea"/) },
    }) })
  })

  it('rejects an unknown user before deleting', async () => {
    await expect(actions.deleteUser('missing', 'bea@beta.test')).rejects.toThrow(/User not found/)
    expect(mocks.prisma.user.delete).not.toHaveBeenCalled()
  })

  it('rejects self-deletion by the live principal id before target reads', async () => {
    await expect(actions.deleteUser('sa_1', 'root@platform.test')).rejects.toThrow(/cannot delete your own account/)
    expect(mocks.prisma.user.delete).not.toHaveBeenCalled()
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
  })
})
