import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression for `deleteCompany` / `deleteUser` being callable as bare server actions.
 *
 * The typed confirmation lived only in the page's inline server action, so a direct call
 * to the exported action (a forged action id, or any future caller) permanently deleted a
 * company or user with no confirmation at all. The target was read outside any
 * transaction, the delete and the audit record were separate writes, and `logActivity`
 * swallows its own failure — a delete could land with no durable audit trail.
 *
 * Now each action requires the confirmation text as an argument and compares it on the
 * server with the target's current canonical value (company name; user email). Inside one
 * transaction it re-reads the live SUPER_ADMIN actor, re-reads the target, checks the
 * confirmation against that fresh row, deletes and writes the audit record; if any step
 * fails the whole transaction fails. Deleting a peer SUPER_ADMIN stays allowed; deleting
 * oneself stays refused.
 *
 * `@/lib/auth/require-user` and `@/lib/auth/require-super-admin` are real.
 */
const mocks = vi.hoisted(() => {
  const tx = {
    user: { findFirst: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    company: { findUnique: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    auth: vi.fn(),
    logActivity: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn(),
    tx,
    prisma: {
      user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
      company: { findUnique: vi.fn(), delete: vi.fn() },
      companyMember: { findFirst: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn() } }))

const actions = await import('@/actions/super-admin')

const LIVE_SUPER = { id: 'sa_1', email: 'root@platform.test', name: 'Root', role: 'SUPER_ADMIN', isActive: true }
let company: Record<string, unknown> | null
let target: Record<string, unknown> | null
let actorInTx: Record<string, unknown> | null

beforeEach(() => {
  vi.clearAllMocks()
  company = { id: 'company_b', name: 'Beta Builders', email: 'ops@beta.test', status: 'ACTIVE', plan: 'PRO', _count: { sites: 2, members: 3 } }
  target = {
    id: 'user_b', name: 'Bea', email: 'bea@beta.test', role: 'COMPANY_ADMIN', isActive: true,
    companyMembers: [{ companyId: 'company_b', company: { name: 'Beta Builders' } }],
  }
  actorInTx = { id: 'sa_1' }
  mocks.auth.mockResolvedValue({ user: { id: 'sa_1', role: 'SUPER_ADMIN' } })
  mocks.prisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => (where.id === 'sa_1' ? LIVE_SUPER : null))

  mocks.tx.user.findFirst.mockImplementation(async () => actorInTx)
  mocks.tx.company.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => (company && where.id === company.id ? company : null))
  mocks.tx.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => (target && where.id === target.id ? target : null))
  mocks.tx.company.delete.mockResolvedValue({})
  mocks.tx.user.delete.mockResolvedValue({})
  mocks.tx.auditLog.create.mockResolvedValue({})
  // Models an interactive transaction: the callback's rejection is the transaction's.
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx))
})

function outsideTxWrites() {
  return mocks.prisma.company.delete.mock.calls.length + mocks.prisma.user.delete.mock.calls.length + mocks.prisma.auditLog.create.mock.calls.length
}

describe('deleteCompany: server-enforced confirmation', () => {
  it.each([
    ['no confirmation (direct forged call)', undefined],
    ['an empty confirmation', ''],
    ['a wrong name', 'Alpha'],
    ['the company id instead of its name', 'company_b'],
    ['a non-string payload', { equals: 'Beta Builders' }],
  ])('refuses %s without deleting', async (_label, confirmation) => {
    await expect(actions.deleteCompany('company_b', confirmation as string)).rejects.toThrow(/confirmation/i)
    expect(mocks.tx.company.delete).not.toHaveBeenCalled()
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expect(outsideTxWrites()).toBe(0)
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('checks the confirmation against the company re-read inside the transaction, not a stale name', async () => {
    company = { ...company!, name: 'Renamed Co' }
    await expect(actions.deleteCompany('company_b', 'Beta Builders')).rejects.toThrow(/confirmation/i)
    expect(mocks.tx.company.delete).not.toHaveBeenCalled()
  })

  it('refuses when the actor is no longer a live SUPER_ADMIN at transaction time', async () => {
    actorInTx = null
    await expect(actions.deleteCompany('company_b', 'Beta Builders')).rejects.toThrow(/Super admin access required/)
    expect(mocks.tx.user.findFirst.mock.calls[0][0].where).toEqual({ id: 'sa_1', role: 'SUPER_ADMIN', isActive: true })
    expect(mocks.tx.company.delete).not.toHaveBeenCalled()
  })

  it('fails the whole deletion when the audit record cannot be written', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit write failed'))
    await expect(actions.deleteCompany('company_b', 'Beta Builders')).rejects.toThrow(/audit write failed/)
    // Both writes ran on the transaction client, so the database rolls the delete back.
    expect(mocks.tx.company.delete).toHaveBeenCalledTimes(1)
    expect(outsideTxWrites()).toBe(0)
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('deletes and audits in one transaction with the exact confirmation', async () => {
    await actions.deleteCompany('company_b', '  Beta Builders ')
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.company.delete).toHaveBeenCalledWith({ where: { id: 'company_b' } })
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'sa_1', companyId: null, action: 'DELETE', module: 'COMPANY', recordId: 'company_b' }),
    })
    expect(outsideTxWrites()).toBe(0)
    expect(mocks.redirect).toHaveBeenCalledWith('/super-admin/companies')
  })
})

describe('deleteUser: server-enforced confirmation', () => {
  it.each([
    ['no confirmation (direct forged call)', undefined],
    ['an empty confirmation', ''],
    ['the display name instead of the email', 'Bea'],
    ['a different email', 'someone@beta.test'],
    ['a non-string payload', ['bea@beta.test']],
  ])('refuses %s without deleting', async (_label, confirmation) => {
    await expect(actions.deleteUser('user_b', confirmation as string)).rejects.toThrow(/confirmation/i)
    expect(mocks.tx.user.delete).not.toHaveBeenCalled()
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expect(outsideTxWrites()).toBe(0)
  })

  it('checks the confirmation against the user re-read inside the transaction', async () => {
    target = { ...target!, email: 'changed@beta.test' }
    await expect(actions.deleteUser('user_b', 'bea@beta.test')).rejects.toThrow(/confirmation/i)
    expect(mocks.tx.user.delete).not.toHaveBeenCalled()
  })

  it('still refuses self-deletion before any target read', async () => {
    await expect(actions.deleteUser('sa_1', 'root@platform.test')).rejects.toThrow(/cannot delete your own account/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('refuses when the actor is no longer a live SUPER_ADMIN at transaction time', async () => {
    actorInTx = null
    await expect(actions.deleteUser('user_b', 'bea@beta.test')).rejects.toThrow(/Super admin access required/)
    expect(mocks.tx.user.delete).not.toHaveBeenCalled()
  })

  it('fails the whole deletion when the audit record cannot be written', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit write failed'))
    await expect(actions.deleteUser('user_b', 'bea@beta.test')).rejects.toThrow(/audit write failed/)
    expect(outsideTxWrites()).toBe(0)
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('keeps allowing deletion of a peer SUPER_ADMIN with the exact confirmation', async () => {
    target = { ...target!, id: 'sa_2', email: 'peer@platform.test', role: 'SUPER_ADMIN', companyMembers: [] }
    await actions.deleteUser('sa_2', 'peer@platform.test')
    expect(mocks.tx.user.delete).toHaveBeenCalledWith({ where: { id: 'sa_2' } })
  })

  it('deletes and audits in one transaction against the user company', async () => {
    await actions.deleteUser('user_b', 'bea@beta.test')
    expect(mocks.tx.user.delete).toHaveBeenCalledWith({ where: { id: 'user_b' } })
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'sa_1', companyId: 'company_b', action: 'DELETE', module: 'USER', recordId: 'user_b' }),
    })
    expect(mocks.redirect).toHaveBeenCalledWith('/super-admin/users')
  })
})
