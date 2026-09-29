import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression for `resetUserPassword` changing a password with no confirmation and no
 * durable audit trail.
 *
 * The action is a public server action. It took any user id, checked a COMPANY_ADMIN's
 * target against an active membership but let a SUPER_ADMIN reset any account — a peer
 * SUPER_ADMIN, a deactivated or soft-deleted user, a user of a deleted company — and wrote
 * the new hash with `prisma.user.update` before recording anything through `logActivity`,
 * which swallows its own failure. A reset could land with no audit record.
 *
 * Now the caller must pass the target's email as a typed confirmation, compared on the
 * server with the canonical row read inside the transaction. The target must be an
 * active, non-deleted, non-SUPER_ADMIN user with an active membership of a live company —
 * the actor's own company for a COMPANY_ADMIN, who also may not reset a peer or superior.
 * The hash write and the audit record share one transaction, and the audit record never
 * carries the password or its hash.
 */
type Store = {
  users: Record<string, Record<string, unknown>>
  audit: Record<string, unknown>[]
}

const mocks = vi.hoisted(() => {
  const tx = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    tx,
    auth: vi.fn(),
    logActivity: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn(),
    prisma: {
      user: { findUnique: vi.fn(), update: vi.fn() },
      companyMember: { findFirst: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('@/lib/auth/require-user', () => ({
  requireUser: async () => {
    const session = await mocks.auth()
    if (!session?.user) throw new Error('UNAUTHORIZED: Authentication required')
    return session.user
  },
}))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async (value: string) => `hashed:${value}`) } }))

const { resetUserPassword } = await import('@/actions/users')

const PASSWORD = 'A-long-enough-password'
const COMPANY_ADMIN = { id: 'admin_1', name: 'Admin', email: 'admin@acme.test', role: 'COMPANY_ADMIN', companyId: 'company_1' }
const SUPER_ADMIN = { id: 'root', name: 'Root', email: 'root@platform.test', role: 'SUPER_ADMIN' }

let store: Store

function target(extra: Record<string, unknown> = {}) {
  return {
    id: 'user_target', name: 'Target User', email: 'target@acme.test', role: 'SITE_ENGINEER',
    isActive: true, deletedAt: null, passwordHash: 'old-hash',
    memberships: [{ companyId: 'company_1', role: 'SITE_ENGINEER', isActive: true, companyDeleted: false }],
    ...extra,
  }
}

/** Mirrors the membership filter the action asks Prisma for. */
function selectMembers(row: Record<string, unknown>, where: Record<string, unknown> | undefined) {
  const members = row.memberships as { companyId: string; role: string; isActive: boolean; companyDeleted: boolean }[]
  return members
    .filter((m) => (where?.isActive === undefined || m.isActive === where.isActive))
    .filter((m) => (where?.companyId === undefined || m.companyId === where.companyId))
    .filter((m) => (where?.company === undefined || !m.companyDeleted))
    .map(({ companyId, role }) => ({ companyId, role }))
}

function signIn(user: Record<string, unknown>) {
  mocks.auth.mockResolvedValue({ user })
}

beforeEach(() => {
  vi.clearAllMocks()
  store = { users: { user_target: target() }, audit: [] }
  signIn(COMPANY_ADMIN)

  mocks.tx.user.findUnique.mockImplementation(async ({ where, select }: { where: { id: string }; select: { companyMembers?: { where?: Record<string, unknown> } } }) => {
    const row = store.users[where.id]
    if (!row) return null
    const { memberships: _memberships, passwordHash: _hash, ...rest } = row
    return { ...rest, companyMembers: selectMembers(row, select.companyMembers?.where) }
  })
  mocks.tx.user.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    Object.assign(store.users[where.id], data)
    return store.users[where.id]
  })
  mocks.tx.auditLog.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    store.audit.push(data)
    return data
  })
  // An interactive transaction: every tx write is undone when the callback rejects.
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => {
    const snapshot = structuredClone(store)
    try {
      return await fn(mocks.tx)
    } catch (error) {
      store = snapshot
      throw error
    }
  })
})

function passwordUnchanged() {
  expect(store.users.user_target.passwordHash).toBe('old-hash')
  expect(store.audit).toEqual([])
  expect(mocks.prisma.user.update).not.toHaveBeenCalled()
}

describe('resetUserPassword: typed confirmation', () => {
  it.each([
    ['missing', undefined],
    ['blank', '   '],
    ['the display name', 'Target User'],
    ['another email', 'someone@acme.test'],
    ['a non-string', { toString: () => 'target@acme.test' }],
  ])('refuses a %s confirmation without changing the password', async (_label, confirmation) => {
    await expect(resetUserPassword('user_target', PASSWORD, confirmation as string)).rejects.toThrow(/confirmation/i)
    passwordUnchanged()
  })

  it('accepts the target email, surrounding whitespace ignored', async () => {
    await resetUserPassword('user_target', PASSWORD, '  target@acme.test ')

    expect(store.users.user_target.passwordHash).toBe(`hashed:${PASSWORD}`)
    expect(store.audit).toHaveLength(1)
  })
})

describe('resetUserPassword: exact active tenant target', () => {
  it.each([
    ['a user of another company', { memberships: [{ companyId: 'company_2', role: 'SITE_ENGINEER', isActive: true, companyDeleted: false }] }],
    ['an inactive membership', { memberships: [{ companyId: 'company_1', role: 'SITE_ENGINEER', isActive: false, companyDeleted: false }] }],
    ['a deactivated account', { isActive: false }],
    ['a soft-deleted account', { deletedAt: new Date('2026-01-01') }],
    ['a peer COMPANY_ADMIN', { role: 'COMPANY_ADMIN', memberships: [{ companyId: 'company_1', role: 'COMPANY_ADMIN', isActive: true, companyDeleted: false }] }],
    ['a SUPER_ADMIN account', { role: 'SUPER_ADMIN' }],
  ])('refuses a COMPANY_ADMIN resetting %s', async (_label, extra) => {
    store.users.user_target = target(extra)

    await expect(resetUserPassword('user_target', PASSWORD, 'target@acme.test')).rejects.toThrow()
    passwordUnchanged()
  })

  it('scopes a COMPANY_ADMIN to an active membership of its own live company', async () => {
    await resetUserPassword('user_target', PASSWORD, 'target@acme.test')

    const [{ select }] = mocks.tx.user.findUnique.mock.calls[0]
    expect(select.companyMembers.where).toMatchObject({ companyId: 'company_1', isActive: true, company: { deletedAt: null } })
  })

  it('refuses a COMPANY_ADMIN with no company', async () => {
    signIn({ ...COMPANY_ADMIN, companyId: null })

    await expect(resetUserPassword('user_target', PASSWORD, 'target@acme.test')).rejects.toThrow()
    passwordUnchanged()
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it.each(['PROJECT_MANAGER', 'SITE_ENGINEER', 'CLIENT'])('refuses a %s actor before any read', async (role) => {
    signIn({ ...COMPANY_ADMIN, role })

    await expect(resetUserPassword('user_target', PASSWORD, 'target@acme.test')).rejects.toThrow()
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    passwordUnchanged()
  })

  it('refuses an actor resetting its own password here', async () => {
    signIn({ ...COMPANY_ADMIN, id: 'user_target' })

    await expect(resetUserPassword('user_target', PASSWORD, 'target@acme.test')).rejects.toThrow()
    passwordUnchanged()
  })

  it.each([
    ['a user whose only company is deleted', { memberships: [{ companyId: 'company_2', role: 'SITE_ENGINEER', isActive: true, companyDeleted: true }] }],
    ['a user with no active membership', { memberships: [] }],
    ['a peer SUPER_ADMIN', { role: 'SUPER_ADMIN' }],
    ['a deactivated account', { isActive: false }],
  ])('refuses a SUPER_ADMIN resetting %s', async (_label, extra) => {
    signIn(SUPER_ADMIN)
    store.users.user_target = target(extra)

    await expect(resetUserPassword('user_target', PASSWORD, 'target@acme.test')).rejects.toThrow()
    passwordUnchanged()
  })

  it('lets a SUPER_ADMIN reset an active member of any live company, audited against that company', async () => {
    signIn(SUPER_ADMIN)
    store.users.user_target = target({ role: 'COMPANY_ADMIN', memberships: [{ companyId: 'company_2', role: 'COMPANY_ADMIN', isActive: true, companyDeleted: false }] })

    await resetUserPassword('user_target', PASSWORD, 'target@acme.test')

    expect(store.users.user_target.passwordHash).toBe(`hashed:${PASSWORD}`)
    expect(store.audit[0]).toMatchObject({ userId: 'root', companyId: 'company_2', recordId: 'user_target', module: 'PASSWORD_RESET' })
  })

  it('refuses a short password before any read', async () => {
    await expect(resetUserPassword('user_target', '12345', 'target@acme.test')).rejects.toThrow(/at least 6/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('resetUserPassword: atomic, nonsecret audit', () => {
  it('writes the hash and the audit record in one transaction, the password in neither the audit nor outside it', async () => {
    await resetUserPassword('user_target', PASSWORD, 'target@acme.test')

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.user.update).toHaveBeenCalledWith({ where: { id: 'user_target' }, data: { passwordHash: `hashed:${PASSWORD}` } })
    expect(store.audit).toEqual([
      expect.objectContaining({ userId: 'admin_1', companyId: 'company_1', action: 'UPDATE', module: 'PASSWORD_RESET', recordId: 'user_target' }),
    ])
    const audited = JSON.stringify(store.audit)
    expect(audited).not.toContain(PASSWORD)
    expect(audited).not.toContain('hashed:')
    expect(mocks.prisma.user.update).not.toHaveBeenCalled()
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })

  it('leaves the password untouched when the audit record fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit store down'))

    await expect(resetUserPassword('user_target', PASSWORD, 'target@acme.test')).rejects.toThrow(/audit store down/)

    // The hash write ran inside the transaction and was rolled back with it.
    expect(mocks.tx.user.update).toHaveBeenCalledTimes(1)
    passwordUnchanged()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
