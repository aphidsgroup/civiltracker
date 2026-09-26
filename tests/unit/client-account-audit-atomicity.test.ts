import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression for client-account creation and deactivation landing without a durable
 * audit record.
 *
 * `createClientUser` created the CLIENT login, its membership and its site allow-list in
 * one transaction but recorded nothing. `removeClientAccount` deactivated the membership
 * with a bare write and then called `logActivity`, which swallows its own failure: a
 * client could gain or lose portal access with no audit trail.
 *
 * Now both write their audit record on the same transaction client as the access change,
 * so an audit failure rolls the user, membership and site assignment back. The
 * `company.manage` gate and the typed name/email confirmation are unchanged, and the
 * audit record never carries the password or its hash.
 */
type Store = {
  users: Record<string, unknown>[]
  members: Record<string, Record<string, unknown>>
  sites: Record<string, Record<string, unknown>>
  audit: Record<string, unknown>[]
}

const mocks = vi.hoisted(() => {
  const tx = {
    user: { create: vi.fn() },
    companyMember: { create: vi.fn(), update: vi.fn() },
    site: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    tx,
    requirePermission: vi.fn(),
    requireUser: vi.fn(),
    logActivity: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`)
    }),
    prisma: {
      company: { findUnique: vi.fn() },
      user: { findUnique: vi.fn(), create: vi.fn() },
      companyMember: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
      site: { findMany: vi.fn(), updateMany: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/link', () => ({ default: () => null }))
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async (value: string) => `hashed:${value}`) } }))

const { createClientUser, removeClientAccount } = await import('@/app/(dashboard)/client-accounts/page')

const companyId = 'company_1'
const actor = { id: 'admin_1', name: 'Admin', email: 'admin@example.test', role: 'COMPANY_ADMIN', companyId }
const PASSWORD = 'secure-client-password'

let store: Store

function emptyStore(): Store {
  return {
    users: [],
    members: {
      member_client: { id: 'member_client', userId: 'client_1', companyId, role: 'CLIENT', isActive: true, siteIds: ['site_2'] },
    },
    sites: {
      site_1: { id: 'site_1', companyId, clientUserId: null },
      site_2: { id: 'site_2', companyId, clientUserId: 'client_1' },
    },
    audit: [],
  }
}

function form(values: Record<string, string | string[]>) {
  const result = new FormData()
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) result.append(key, item)
  }
  return result
}

const createForm = () => form({ name: 'Client Co', email: 'client@example.test', password: PASSWORD, siteIds: ['site_1'] })

beforeEach(() => {
  vi.clearAllMocks()
  store = emptyStore()
  mocks.requirePermission.mockResolvedValue(actor)
  mocks.requireUser.mockResolvedValue(actor)
  mocks.prisma.company.findUnique.mockResolvedValue({ id: companyId, userLimit: 10, _count: { members: 1 } })
  mocks.prisma.user.findUnique.mockResolvedValue(null)
  mocks.prisma.site.findMany.mockResolvedValue([{ id: 'site_1' }])
  mocks.prisma.companyMember.findUnique.mockImplementation(async ({ where }: { where: { id: string; companyId?: string } }) => {
    const row = store.members[where.id]
    if (!row || (where.companyId && row.companyId !== where.companyId)) return null
    return { ...row, user: { id: row.userId, name: 'Client Co', email: 'client@example.test' } }
  })

  mocks.tx.user.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const row = { id: 'client_new', ...data }
    store.users.push(row)
    return row
  })
  mocks.tx.companyMember.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    store.members.member_new = { id: 'member_new', ...data }
    return store.members.member_new
  })
  mocks.tx.companyMember.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    Object.assign(store.members[where.id], data)
    return store.members[where.id]
  })
  mocks.tx.site.updateMany.mockImplementation(async ({ where, data }: { where: { id: { in: string[] } }; data: Record<string, unknown> }) => {
    for (const id of where.id.in) Object.assign(store.sites[id], data)
    return { count: where.id.in.length }
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

function noBareWrites() {
  expect(mocks.prisma.user.create).not.toHaveBeenCalled()
  expect(mocks.prisma.companyMember.create).not.toHaveBeenCalled()
  expect(mocks.prisma.companyMember.update).not.toHaveBeenCalled()
  expect(mocks.prisma.site.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
  expect(mocks.logActivity).not.toHaveBeenCalled()
}

describe('createClientUser: audited atomically', () => {
  it('records an actor-bearing, nonsecret audit event in the creating transaction', async () => {
    await expect(createClientUser(createForm())).rejects.toThrow('NEXT_REDIRECT:/client-accounts')

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(store.users).toHaveLength(1)
    expect(store.members.member_new).toMatchObject({ userId: 'client_new', role: 'CLIENT', siteIds: ['site_1'] })
    expect(store.sites.site_1.clientUserId).toBe('client_new')
    expect(store.audit).toEqual([expect.objectContaining({
      companyId, userId: 'admin_1', action: 'CREATE', module: 'USER', recordId: 'client_new',
      after: expect.objectContaining({ email: 'client@example.test', role: 'CLIENT', siteIds: ['site_1'] }),
    })])
    const audited = JSON.stringify(store.audit)
    expect(audited).not.toContain(PASSWORD)
    expect(audited).not.toContain('hashed:')
    noBareWrites()
  })

  it('rolls back the user, membership and site assignment when the audit write fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit store down'))

    await expect(createClientUser(createForm())).rejects.toThrow(/audit store down/)

    expect(mocks.tx.user.create).toHaveBeenCalledTimes(1)
    expect(store).toEqual(emptyStore())
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    noBareWrites()
  })
})

describe('removeClientAccount: audited atomically', () => {
  const removeForm = (typed = 'Client Co') => form({ memberId: 'member_client', dangerConfirmText: typed })

  it('deactivates and records the access change in one transaction', async () => {
    await removeClientAccount(removeForm())

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(store.members.member_client.isActive).toBe(false)
    expect(mocks.tx.companyMember.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'member_client', companyId },
      data: { isActive: false },
    }))
    expect(store.audit).toEqual([expect.objectContaining({
      companyId, userId: 'admin_1', action: 'UPDATE', module: 'USER', recordId: 'client_1',
      before: expect.objectContaining({ isActive: true }),
      after: expect.objectContaining({ isActive: false }),
    })])
    noBareWrites()
  })

  it('keeps the client active when the audit write fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit store down'))

    await expect(removeClientAccount(removeForm())).rejects.toThrow(/audit store down/)

    expect(mocks.tx.companyMember.update).toHaveBeenCalledTimes(1)
    expect(store).toEqual(emptyStore())
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    noBareWrites()
  })

  it('keeps the typed name/email confirmation', async () => {
    await expect(removeClientAccount(removeForm('Someone Else'))).rejects.toThrow(/confirmation/i)

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(store).toEqual(emptyStore())
  })

  it('keeps the company.manage gate', async () => {
    mocks.requirePermission.mockRejectedValue(new Error('FORBIDDEN: Missing required permission "company.manage"'))

    await expect(removeClientAccount(removeForm())).rejects.toThrow(/FORBIDDEN/)
    expect(mocks.requirePermission).toHaveBeenCalledWith('company.manage')
    expect(store).toEqual(emptyStore())
  })
})
