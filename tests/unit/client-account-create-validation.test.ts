import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression for `createClientUser` accepting its identity and password fields without
 * a server-side boundary: any non-empty password (one character) was hashed, the name and
 * email were stored as typed, the phone was unbounded and extra/forged fields were
 * silently ignored.
 *
 * The action now parses the form through the strict `createClientAccountSchema` before
 * any identity, site or user access: unknown keys, repeated scalars, weak passwords and
 * malformed names/emails/phones are refused with no lookup and no write. Valid input is
 * normalized (collapsed name, lowercased email, digit-only phone), sites must be exact
 * active sites of the actor's company, and the membership plus audit record are written
 * in the creating transaction without the password or its hash.
 */
type SiteRow = { id: string; companyId: string; deletedAt: Date | null; status: string; clientUserId: string | null }
type Store = {
  users: Record<string, unknown>[]
  members: Record<string, unknown>[]
  sites: Record<string, SiteRow>
  audit: Record<string, unknown>[]
}

const mocks = vi.hoisted(() => {
  const tx = {
    user: { create: vi.fn() },
    companyMember: { create: vi.fn() },
    site: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    tx,
    requirePermission: vi.fn(),
    revalidatePath: vi.fn(),
    hash: vi.fn(async (value: string) => `hashed:${value}`),
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`)
    }),
    prisma: {
      company: { findUnique: vi.fn() },
      user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
      companyMember: { create: vi.fn() },
      site: { findMany: vi.fn(), updateMany: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logActivity: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/link', () => ({ default: () => null }))
vi.mock('bcryptjs', () => ({ default: { hash: mocks.hash } }))

const { createClientUser } = await import('@/app/(dashboard)/client-accounts/page')

const companyId = 'company_1'
const actor = { id: 'admin_1', name: 'Admin', email: 'admin@example.test', role: 'COMPANY_ADMIN', companyId }
const PASSWORD = 'Str0ng client pass'

let store: Store

function initialStore(): Store {
  return {
    users: [],
    members: [],
    sites: {
      site_1: { id: 'site_1', companyId, deletedAt: null, status: 'ACTIVE', clientUserId: null },
      site_2: { id: 'site_2', companyId, deletedAt: null, status: 'ACTIVE', clientUserId: null },
      site_deleted: { id: 'site_deleted', companyId, deletedAt: new Date('2026-01-01'), status: 'ACTIVE', clientUserId: null },
      site_on_hold: { id: 'site_on_hold', companyId, deletedAt: null, status: 'ON_HOLD', clientUserId: null },
      site_other: { id: 'site_other', companyId: 'company_2', deletedAt: null, status: 'ACTIVE', clientUserId: null },
    },
    audit: [],
  }
}

function form(values: Record<string, string | string[] | Blob>) {
  const result = new FormData()
  for (const [key, value] of Object.entries(values)) {
    if (value instanceof Blob) result.append(key, value)
    else for (const item of Array.isArray(value) ? value : [value]) result.append(key, item)
  }
  return result
}

const valid = (overrides: Record<string, string | string[] | Blob> = {}) =>
  form({ name: 'Sharma Builders', email: 'client@example.test', phone: '9876543210', password: PASSWORD, siteIds: ['site_1'], ...overrides })

function matches(row: SiteRow, where: Record<string, unknown>) {
  const ids = (where.id as { in: string[] }).in
  return ids.includes(row.id) && row.companyId === where.companyId &&
    (where.deletedAt !== null || row.deletedAt === null) &&
    (where.status === undefined || row.status === where.status)
}

beforeEach(() => {
  vi.clearAllMocks()
  store = initialStore()
  mocks.requirePermission.mockResolvedValue(actor)
  mocks.prisma.company.findUnique.mockResolvedValue({ id: companyId, userLimit: 10, _count: { members: 1 } })
  mocks.prisma.user.findFirst.mockResolvedValue(null)
  mocks.prisma.site.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    Object.values(store.sites).filter(row => matches(row, where)).map(row => ({ id: row.id })))

  mocks.tx.user.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const row = { id: 'client_new', ...data }
    store.users.push(row)
    return { id: row.id }
  })
  mocks.tx.companyMember.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const row = { id: 'member_new', ...data }
    store.members.push(row)
    return row
  })
  mocks.tx.site.updateMany.mockImplementation(async ({ where, data }: { where: Record<string, unknown>; data: Partial<SiteRow> }) => {
    const hits = Object.values(store.sites).filter(row => matches(row, where))
    for (const row of hits) Object.assign(row, data)
    return { count: hits.length }
  })
  mocks.tx.auditLog.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    store.audit.push(data)
    return data
  })
  mocks.prisma.$transaction.mockImplementation(async (fn: (client: typeof mocks.tx) => unknown) => {
    const snapshot = structuredClone(store)
    try {
      return await fn(mocks.tx)
    } catch (error) {
      store = snapshot
      throw error
    }
  })
})

function nothingTouched() {
  expect(mocks.prisma.site.findMany).not.toHaveBeenCalled()
  expect(mocks.prisma.company.findUnique).not.toHaveBeenCalled()
  expect(mocks.prisma.user.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled()
  expect(mocks.hash).not.toHaveBeenCalled()
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  expect(store).toEqual(initialStore())
}

function noBareWrites() {
  expect(mocks.prisma.user.create).not.toHaveBeenCalled()
  expect(mocks.prisma.companyMember.create).not.toHaveBeenCalled()
  expect(mocks.prisma.site.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
}

describe('createClientUser: strict server boundary', () => {
  it.each([
    ['one character', 'x'],
    ['below the form minimum', 'abc12'],
    ['seven characters', 'abcdefg'],
    ['whitespace padded to length', '   ab   '],
    ['all whitespace', '          '],
    ['over the bcrypt byte limit', 'a'.repeat(73)],
    ['control characters', 'abcd\u0000efgh'],
  ])('rejects a weak or unsafe password (%s)', async (_label, password) => {
    await expect(createClientUser(valid({ password }))).rejects.toThrow(/Invalid client account \(password\)/)
    nothingTouched()
  })

  it('rejects a missing password', async () => {
    const data = valid()
    data.delete('password')
    await expect(createClientUser(data)).rejects.toThrow(/Invalid client account \(password\)/)
    nothingTouched()
  })

  it.each([
    ['no domain', 'client@'],
    ['no at sign', 'client.example.test'],
    ['spaces inside', 'cli ent@example.test'],
    ['header injection', 'client@example.test\nBcc: x@example.test'],
    ['blank', '   '],
    ['too long', `${'a'.repeat(250)}@example.test`],
  ])('rejects an invalid email (%s)', async (_label, email) => {
    await expect(createClientUser(valid({ email }))).rejects.toThrow(/Invalid client account \(email\)/)
    nothingTouched()
  })

  it.each([
    ['blank', '   '],
    ['one character', 'A'],
    ['punctuation only', '-- !!'],
    ['control character', 'Sharma\u0007Builders'],
    ['too long', 'B'.repeat(121)],
  ])('rejects an invalid name (%s)', async (_label, name) => {
    await expect(createClientUser(valid({ name }))).rejects.toThrow(/Invalid client account \(name\)/)
    nothingTouched()
  })

  it.each([
    ['letters', 'call-me-maybe'],
    ['too few digits', '12345'],
    ['too many digits', '1234567890123456'],
    ['script', '<script>1234567</script>'],
    ['overlong', `+${'1 '.repeat(20)}`],
  ])('rejects an invalid phone (%s)', async (_label, phone) => {
    await expect(createClientUser(valid({ phone }))).rejects.toThrow(/Invalid client account \(phone\)/)
    nothingTouched()
  })

  it.each([
    ['role', 'COMPANY_ADMIN'],
    ['companyId', 'company_2'],
    ['isActive', 'false'],
    ['passwordHash', '$2a$12$forged'],
    ['userId', 'admin_1'],
    ['__proto__', 'x'],
  ])('rejects an unknown or forged field (%s)', async (key, value) => {
    const data = valid()
    data.append(key, value)
    await expect(createClientUser(data)).rejects.toThrow(/Invalid client account: .* is not an accepted field/)
    nothingTouched()
  })

  it('rejects repeated scalar fields and file uploads', async () => {
    const repeated = valid()
    repeated.append('email', 'attacker@example.test')
    await expect(createClientUser(repeated)).rejects.toThrow(/email must be a single value/)

    await expect(createClientUser(valid({ name: new Blob(['Sharma']) }))).rejects.toThrow(/name must be text/)
    nothingTouched()
  })

  it('rejects malformed or duplicated site selections before any lookup', async () => {
    await expect(createClientUser(valid({ siteIds: ['site_1', 'site_1'] }))).rejects.toThrow(/Invalid client account \(siteIds\)/)
    await expect(createClientUser(valid({ siteIds: ['site 1; drop'] }))).rejects.toThrow(/Invalid client account \(siteIds/)
    await expect(createClientUser(valid({ siteIds: [''] }))).rejects.toThrow(/select at least one/i)
    const none = valid()
    none.delete('siteIds')
    await expect(createClientUser(none)).rejects.toThrow(/select at least one/i)
    nothingTouched()
  })

  it.each([
    ['another tenant', 'site_other'],
    ['deleted', 'site_deleted'],
    ['not active', 'site_on_hold'],
    ['nonexistent', 'site_missing'],
  ])('rejects a %s site with no identity write', async (_label, siteId) => {
    await expect(createClientUser(valid({ siteIds: ['site_1', siteId] }))).rejects.toThrow(/unavailable in your company/)

    expect(mocks.prisma.site.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['site_1', siteId] }, companyId, deletedAt: null, status: 'ACTIVE' },
    }))
    expect(mocks.prisma.user.findFirst).not.toHaveBeenCalled()
    expect(mocks.hash).not.toHaveBeenCalled()
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(store).toEqual(initialStore())
  })

  it('rejects an email already in use case-insensitively', async () => {
    mocks.prisma.user.findFirst.mockResolvedValue({ id: 'legacy' })
    await expect(createClientUser(valid({ email: 'Client@Example.Test' }))).rejects.toThrow('NEXT_REDIRECT:/client-accounts?error=Email+already+in+use')
    expect(mocks.prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: { equals: 'client@example.test', mode: 'insensitive' } },
    }))
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rolls back the user, membership and site assignment when the audit write fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit store down'))

    await expect(createClientUser(valid())).rejects.toThrow(/audit store down/)

    expect(mocks.tx.user.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.companyMember.create).toHaveBeenCalledTimes(1)
    expect(store).toEqual(initialStore())
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    noBareWrites()
  })

  it('rolls back when the created membership does not match the client login', async () => {
    mocks.tx.companyMember.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      ({ id: 'member_new', ...data, companyId: 'company_2' }))

    await expect(createClientUser(valid())).rejects.toThrow(/membership did not match/)
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expect(store).toEqual(initialStore())
  })

  it('creates a normalized client with exact site access and a secure audit record', async () => {
    const data = valid({
      name: '  Sharma\t  Builders   Pvt  ',
      email: '  Client.Owner@Example.TEST ',
      phone: ' +91 98765-43210 ',
      siteIds: ['site_2', 'site_1'],
    })

    await expect(createClientUser(data)).rejects.toThrow('NEXT_REDIRECT:/client-accounts')

    expect(mocks.requirePermission).toHaveBeenCalledWith('company.manage')
    expect(mocks.hash).toHaveBeenCalledWith(PASSWORD, 12)
    expect(store.users).toEqual([{
      id: 'client_new',
      name: 'Sharma Builders Pvt',
      email: 'client.owner@example.test',
      phone: '+919876543210',
      passwordHash: `hashed:${PASSWORD}`,
      role: 'CLIENT',
    }])
    expect(store.members).toEqual([{
      id: 'member_new', userId: 'client_new', companyId, role: 'CLIENT', siteIds: ['site_2', 'site_1'], isActive: true,
    }])
    expect(store.sites.site_1.clientUserId).toBe('client_new')
    expect(store.sites.site_2.clientUserId).toBe('client_new')
    expect(store.sites.site_other.clientUserId).toBeNull()

    expect(store.audit).toEqual([expect.objectContaining({
      companyId, userId: 'admin_1', action: 'CREATE', module: 'USER', recordId: 'client_new',
      after: expect.objectContaining({
        name: 'Sharma Builders Pvt',
        email: 'client.owner@example.test',
        phone: '+919876543210',
        role: 'CLIENT',
        memberId: 'member_new',
        siteIds: ['site_2', 'site_1'],
      }),
    })])
    const audited = JSON.stringify(store.audit)
    expect(audited).not.toContain(PASSWORD)
    expect(audited).not.toContain('hashed:')
    expect(audited).not.toMatch(/password/i)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/client-accounts')
    noBareWrites()
  })

  it('accepts the form without the optional phone', async () => {
    const data = valid({ phone: '' })
    await expect(createClientUser(data)).rejects.toThrow('NEXT_REDIRECT:/client-accounts')
    expect(store.users[0]).toMatchObject({ phone: undefined })
    expect(store.audit[0]).toMatchObject({ after: expect.objectContaining({ phone: null }) })
  })

  it('keeps the company.manage gate ahead of parsing', async () => {
    mocks.requirePermission.mockRejectedValue(new Error('FORBIDDEN: Missing required permission "company.manage"'))
    await expect(createClientUser(valid({ role: 'SUPER_ADMIN' }))).rejects.toThrow(/FORBIDDEN/)
    nothingTouched()
  })
})
