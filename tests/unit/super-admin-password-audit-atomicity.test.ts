import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression for `changeSuperAdminPassword` (src/actions/super-admin.ts) committing a
 * credential change unaudited.
 *
 * The action wrote `user.update` on the root client, then called the best-effort
 * `logActivity`, which swallows a failed audit write: the platform master password stayed
 * changed with no audit trail, and the success path and revalidation still ran.
 *
 * Now the live SUPER_ADMIN is re-read, the guarded credential write and the required audit
 * record run on one transaction client, so an audit failure rolls the password back and
 * nothing after the transaction runs.
 *
 * The transaction mock stages every write issued on `tx` and commits it only when the
 * callback resolves. `@/lib/auth/require-user` and `@/lib/auth/require-super-admin` are
 * real.
 */
const mocks = vi.hoisted(() => {
  const committed: Array<{ model: string; args: Record<string, unknown> }> = []
  let staged: typeof committed = []

  const tx = {
    user: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }

  return {
    auth: vi.fn(),
    logActivity: vi.fn(),
    revalidatePath: vi.fn(),
    hash: vi.fn(),
    committed,
    tx,
    stage(model: string, args: Record<string, unknown>) {
      staged.push({ model, args })
    },
    async runTransaction(run: (client: typeof tx) => unknown) {
      staged = []
      try {
        const result = await run(tx)
        committed.push(...staged)
        return result
      } finally {
        staged = []
      }
    },
    prisma: {
      $transaction: vi.fn(),
      user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      companyMember: { findFirst: vi.fn() },
      auditLog: { create: vi.fn() },
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('bcryptjs', () => ({ default: { hash: mocks.hash } }))

const { changeSuperAdminPassword } = await import('@/actions/super-admin')

const LIVE_SUPER = { id: 'sa_1', email: 'root@platform.test', name: 'Root', role: 'SUPER_ADMIN', isActive: true }

let liveInTx: typeof LIVE_SUPER | null

beforeEach(() => {
  vi.clearAllMocks()
  mocks.committed.length = 0
  liveInTx = LIVE_SUPER
  mocks.auth.mockResolvedValue({ user: { id: 'sa_1', role: 'SUPER_ADMIN', name: 'Forged', email: 'x@x.test' } })
  mocks.prisma.user.findUnique.mockResolvedValue(LIVE_SUPER)
  mocks.hash.mockResolvedValue('hashed')
  mocks.prisma.$transaction.mockImplementation(mocks.runTransaction)
  mocks.tx.user.findFirst.mockImplementation(async ({ where }: { where: { id: string; role: string; isActive: boolean } }) =>
    liveInTx && liveInTx.id === where.id && liveInTx.role === where.role && liveInTx.isActive === where.isActive ? { id: liveInTx.id } : null)
  mocks.tx.user.updateMany.mockImplementation(async (args: Record<string, unknown>) => {
    mocks.stage('user.updateMany', args)
    return { count: liveInTx ? 1 : 0 }
  })
  mocks.tx.auditLog.create.mockImplementation(async (args: Record<string, unknown>) => {
    mocks.stage('auditLog.create', args)
    return { id: 'audit_1' }
  })
})

function rootWrites() {
  const { prisma } = mocks
  return [prisma.user.update, prisma.user.updateMany, prisma.auditLog.create, mocks.tx.user.update, mocks.logActivity]
    .reduce((sum, fn) => sum + fn.mock.calls.length, 0)
}

describe('changeSuperAdminPassword: required audit', () => {
  it('rolls the password change back when the audit write fails, with no success side effect', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit store unavailable'))

    await expect(changeSuperAdminPassword('new-secret')).rejects.toThrow('audit store unavailable')

    expect(mocks.tx.user.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.committed).toEqual([])
    expect(rootWrites()).toBe(0)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('commits the guarded credential write and its audit record, then revalidates', async () => {
    await expect(changeSuperAdminPassword('new-secret')).resolves.toEqual({ success: true })

    expect(rootWrites()).toBe(0)
    expect(mocks.tx.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sa_1', role: 'SUPER_ADMIN', isActive: true },
    }))
    expect(mocks.committed).toEqual([
      {
        model: 'user.updateMany',
        args: { where: { id: 'sa_1', role: 'SUPER_ADMIN', isActive: true }, data: { passwordHash: 'hashed' } },
      },
      {
        model: 'auditLog.create',
        args: {
          data: {
            userId: 'sa_1',
            companyId: null,
            action: 'UPDATE',
            module: 'PASSWORD_RESET',
            recordId: 'sa_1',
            after: { _description: 'Root changed their own Super Admin password' },
          },
        },
      },
    ])
    // The hash never reaches the audit record.
    expect(JSON.stringify(mocks.committed[1])).not.toContain('hashed')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/super-admin/settings')
  })

  it('refuses when the super admin is demoted before the transaction re-read, writing nothing', async () => {
    liveInTx = { ...LIVE_SUPER, role: 'COMPANY_ADMIN' }
    await expect(changeSuperAdminPassword('new-secret')).rejects.toThrow(/FORBIDDEN: Super admin access required/)
    expect(mocks.tx.user.updateMany).not.toHaveBeenCalled()
    expect(mocks.committed).toEqual([])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses when the guarded credential write matches no live super admin', async () => {
    mocks.tx.user.updateMany.mockResolvedValue({ count: 0 })
    await expect(changeSuperAdminPassword('new-secret')).rejects.toThrow(/FORBIDDEN: Super admin access required/)
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it.each([
    ['a short password', '12345'],
    ['an empty password', ''],
    ['a non-string password', 123456 as unknown as string],
  ])('rejects %s before hashing or opening a transaction', async (_label, password) => {
    await expect(changeSuperAdminPassword(password)).rejects.toThrow(/at least 6/)
    expect(mocks.hash).not.toHaveBeenCalled()
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })
})
