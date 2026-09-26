import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression for the super-admin company lifecycle actions writing without a durable
 * audit trail, and `createCompany` leaving half-created tenants behind.
 *
 * `createCompany` created the company, then the owner user, then the owner membership as
 * three separate writes: a duplicate owner email or a failed membership left a company
 * with no owner (or an owner with no company). A half-filled owner block was silently
 * dropped. `updateCompanyStatus` and `updateCompanyPlan` suspended, reactivated or
 * re-priced a tenant with no audit record at all. None re-read the SUPER_ADMIN inside
 * the write.
 *
 * Now each action re-reads the live SUPER_ADMIN inside one transaction that performs
 * every write and records an actor-bearing audit event on the same client; if the owner
 * or the audit write fails, nothing is kept. Audit records carry no password or hash.
 *
 * `@/lib/auth/require-user` and `@/lib/auth/require-super-admin` are real.
 */
type Store = {
  companies: Record<string, Record<string, unknown>>
  users: Record<string, Record<string, unknown>>
  members: Record<string, unknown>[]
  audit: Record<string, unknown>[]
}

const mocks = vi.hoisted(() => {
  const tx = {
    user: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    company: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    companyMember: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    tx,
    auth: vi.fn(),
    prisma: {
      user: { findUnique: vi.fn(), create: vi.fn() },
      company: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
      companyMember: { create: vi.fn(), findFirst: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async (value: string) => `hashed:${value}`) } }))

const { createCompany, updateCompanyStatus, updateCompanyPlan } = await import('@/actions/companies')

const LIVE_SUPER = { id: 'sa_1', email: 'root@platform.test', name: 'Root', role: 'SUPER_ADMIN', isActive: true }
const OWNER_PASSWORD = 'Owner-secret-123'

let store: Store
let liveSuperInTx: boolean
let seq: number

function input(extra: Record<string, unknown> = {}) {
  return {
    name: 'Beta Builders',
    email: 'ops@beta.test',
    plan: 'FREE',
    status: 'ACTIVE',
    userLimit: 15,
    siteLimit: 15,
    storageLimitMb: 1024,
    ownerName: 'Bea Owner',
    ownerEmail: 'bea@beta.test',
    ownerPassword: OWNER_PASSWORD,
    ...extra,
  }
}

function emptyStore(): Store {
  return {
    companies: {
      company_a: { id: 'company_a', name: 'Acme', slug: 'acme', status: 'ACTIVE', plan: 'GROWTH', userLimit: 10, siteLimit: 5, storageLimitMb: 500, deletedAt: null },
    },
    users: { sa_1: LIVE_SUPER },
    members: [],
    audit: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  store = emptyStore()
  liveSuperInTx = true
  seq = 0
  mocks.auth.mockResolvedValue({ user: { id: 'sa_1', role: 'SUPER_ADMIN' } })
  mocks.prisma.user.findUnique.mockImplementation(async ({ where }: { where: { id?: string; email?: string } }) =>
    Object.values(store.users).find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null
  )
  mocks.prisma.company.findUnique.mockImplementation(async ({ where }: { where: { id?: string; slug?: string } }) =>
    Object.values(store.companies).find((c) => (where.id ? c.id === where.id : c.slug === where.slug)) ?? null
  )

  mocks.tx.user.findFirst.mockImplementation(async () => (liveSuperInTx ? { id: 'sa_1' } : null))
  mocks.tx.user.findUnique.mockImplementation(async ({ where }: { where: { email: string } }) =>
    Object.values(store.users).find((u) => u.email === where.email) ?? null
  )
  mocks.tx.company.findUnique.mockImplementation(async ({ where }: { where: { id?: string; slug?: string } }) =>
    Object.values(store.companies).find((c) => (where.id ? c.id === where.id : c.slug === where.slug)) ?? null
  )
  mocks.tx.company.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const row = { id: `company_new_${++seq}`, deletedAt: null, ...data }
    store.companies[row.id] = row
    return row
  })
  mocks.tx.company.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    Object.assign(store.companies[where.id], data)
    return store.companies[where.id]
  })
  mocks.tx.user.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    if (Object.values(store.users).some((u) => u.email === data.email)) throw new Error('Unique constraint failed on the fields: (`email`)')
    const row = { id: `user_new_${++seq}`, ...data }
    store.users[row.id] = row
    return row
  })
  mocks.tx.companyMember.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    store.members.push(data)
    return data
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

function nothingWritten() {
  expect(store).toEqual(emptyStore())
  expect(mocks.prisma.company.create).not.toHaveBeenCalled()
  expect(mocks.prisma.company.update).not.toHaveBeenCalled()
  expect(mocks.prisma.user.create).not.toHaveBeenCalled()
  expect(mocks.prisma.companyMember.create).not.toHaveBeenCalled()
  expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
}

describe('createCompany', () => {
  it('creates the company, owner, owner membership and audit events in one transaction', async () => {
    const result = await createCompany(input())

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    const company = store.companies[result.companyId]
    expect(company).toMatchObject({ name: 'Beta Builders', slug: 'beta-builders', createdById: 'sa_1' })
    const owner = Object.values(store.users).find((u) => u.email === 'bea@beta.test')!
    expect(owner).toMatchObject({ role: 'COMPANY_ADMIN', passwordHash: `hashed:${OWNER_PASSWORD}` })
    expect(store.members).toEqual([expect.objectContaining({ userId: owner.id, companyId: result.companyId, role: 'COMPANY_ADMIN' })])
    expect(store.audit).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: 'sa_1', companyId: result.companyId, action: 'CREATE', module: 'COMPANY', recordId: result.companyId }),
      expect.objectContaining({ userId: 'sa_1', companyId: result.companyId, action: 'CREATE', module: 'USER', recordId: owner.id }),
    ]))
    const audited = JSON.stringify(store.audit)
    expect(audited).not.toContain(OWNER_PASSWORD)
    expect(audited).not.toContain('hashed:')
  })

  it('creates a company with no owner when the owner block is empty', async () => {
    const result = await createCompany(input({ ownerName: '', ownerEmail: '', ownerPassword: '' }))

    expect(store.companies[result.companyId]).toBeDefined()
    expect(store.members).toEqual([])
    expect(store.audit).toEqual([expect.objectContaining({ module: 'COMPANY', action: 'CREATE', userId: 'sa_1' })])
  })

  it('rolls the company back when the owner email is already taken', async () => {
    store.users.existing = { id: 'existing', email: 'bea@beta.test' }
    const before = structuredClone(store)

    await expect(createCompany(input())).rejects.toThrow()

    expect(store).toEqual(before)
  })

  it('rolls the company and owner back when the owner membership fails', async () => {
    mocks.tx.companyMember.create.mockRejectedValue(new Error('membership write failed'))

    await expect(createCompany(input())).rejects.toThrow(/membership write failed/)
    nothingWritten()
  })

  it('rolls the company and owner back when the audit write fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit store down'))

    await expect(createCompany(input())).rejects.toThrow(/audit store down/)
    nothingWritten()
  })

  it.each([
    ['name only', { ownerEmail: '', ownerPassword: '' }],
    ['email only', { ownerName: '', ownerPassword: '' }],
    ['no password', { ownerPassword: '' }],
  ])('refuses a half-filled owner block (%s) instead of silently dropping the owner', async (_label, extra) => {
    await expect(createCompany(input(extra))).rejects.toThrow(/owner/i)
    nothingWritten()
  })

  it.each([
    ['an unknown plan', { plan: 'PLATINUM_FOREVER' }],
    ['an unknown status', { status: 'GODMODE' }],
    ['a blank name', { name: '   ' }],
  ])('refuses %s before writing', async (_label, extra) => {
    await expect(createCompany(input(extra))).rejects.toThrow()
    nothingWritten()
  })

  it('refuses when the super admin is no longer live inside the transaction', async () => {
    liveSuperInTx = false

    await expect(createCompany(input())).rejects.toThrow(/FORBIDDEN/)
    nothingWritten()
  })

  it('refuses a non super admin before any write', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin_1', role: 'COMPANY_ADMIN', companyId: 'company_a' } })
    store.users.admin_1 = { id: 'admin_1', email: 'a@acme.test', role: 'COMPANY_ADMIN', isActive: true }
    mocks.prisma.companyMember.findFirst.mockResolvedValue({
      companyId: 'company_a', role: 'COMPANY_ADMIN', moduleControls: null,
      company: { slug: 'acme', name: 'Acme', status: 'ACTIVE', deletedAt: null },
    })
    const before = structuredClone(store)

    await expect(createCompany(input())).rejects.toThrow(/FORBIDDEN/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(store).toEqual(before)
  })
})

describe('updateCompanyStatus', () => {
  it('changes the status and records before/after with the actor in one transaction', async () => {
    await updateCompanyStatus('company_a', 'SUSPENDED' as never)

    expect(store.companies.company_a.status).toBe('SUSPENDED')
    expect(store.audit).toEqual([expect.objectContaining({
      userId: 'sa_1', companyId: 'company_a', action: 'UPDATE', module: 'COMPANY', recordId: 'company_a',
      before: expect.objectContaining({ status: 'ACTIVE' }),
      after: expect.objectContaining({ status: 'SUSPENDED' }),
    })])
  })

  it('keeps the old status when the audit write fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit store down'))

    await expect(updateCompanyStatus('company_a', 'SUSPENDED' as never)).rejects.toThrow(/audit store down/)
    nothingWritten()
  })

  it.each([
    ['an unknown status', 'company_a', 'GODMODE'],
    ['a missing company', 'company_missing', 'SUSPENDED'],
  ])('refuses %s', async (_label, companyId, status) => {
    await expect(updateCompanyStatus(companyId, status as never)).rejects.toThrow()
    nothingWritten()
  })

  it('refuses a deleted company', async () => {
    store.companies.company_a.deletedAt = new Date('2026-01-01')
    const before = structuredClone(store)

    await expect(updateCompanyStatus('company_a', 'ACTIVE' as never)).rejects.toThrow()
    expect(store).toEqual(before)
  })

  it('refuses when the super admin is no longer live inside the transaction', async () => {
    liveSuperInTx = false

    await expect(updateCompanyStatus('company_a', 'SUSPENDED' as never)).rejects.toThrow(/FORBIDDEN/)
    nothingWritten()
  })
})

describe('updateCompanyPlan', () => {
  it('changes plan and limits and records before/after with the actor in one transaction', async () => {
    await updateCompanyPlan('company_a', 'ENTERPRISE' as never, 50, 20, 4096)

    expect(store.companies.company_a).toMatchObject({ plan: 'ENTERPRISE', userLimit: 50, siteLimit: 20, storageLimitMb: 4096 })
    expect(store.audit).toEqual([expect.objectContaining({
      userId: 'sa_1', companyId: 'company_a', action: 'UPDATE', module: 'COMPANY', recordId: 'company_a',
      before: expect.objectContaining({ plan: 'GROWTH', userLimit: 10, siteLimit: 5, storageLimitMb: 500 }),
      after: expect.objectContaining({ plan: 'ENTERPRISE', userLimit: 50, siteLimit: 20, storageLimitMb: 4096 }),
    })])
  })

  it('leaves unspecified limits untouched', async () => {
    await updateCompanyPlan('company_a', 'STARTER' as never)

    expect(store.companies.company_a).toMatchObject({ plan: 'STARTER', userLimit: 10, siteLimit: 5, storageLimitMb: 500 })
  })

  it('keeps the old plan and limits when the audit write fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit store down'))

    await expect(updateCompanyPlan('company_a', 'ENTERPRISE' as never, 50)).rejects.toThrow(/audit store down/)
    nothingWritten()
  })

  it.each([
    ['an unknown plan', 'PLATINUM_FOREVER', 10],
    ['a negative limit', 'GROWTH', -1],
    ['a fractional limit', 'GROWTH', 1.5],
  ])('refuses %s', async (_label, plan, userLimit) => {
    await expect(updateCompanyPlan('company_a', plan as never, userLimit)).rejects.toThrow()
    nothingWritten()
  })
})
