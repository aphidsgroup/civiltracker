import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for `createClientAdvance` (src/actions/client-advance.ts) committing a
 * confirmed client payment unaudited and trusting loosely checked input.
 *
 * The confirmed payment was written in one transaction, then a best-effort `logActivity`
 * ran afterwards inside a `try { } catch { }` that swallowed every failure: a CONFIRMED
 * advance could stand with no audit trail. The payload was only loosely checked, so
 * numeric strings, sub-paisa fractions, amounts beyond the `Decimal(14, 2)` column,
 * rolled-over calendar dates and unknown keys all reached the database.
 *
 * Now the payload is parsed strictly at the server boundary before any read, and the
 * site re-read (a live site of exactly the live company, within the principal's assigned
 * scope), the client binding (the site's client, of exactly the live company), the
 * confirmed payment and an immutable financial audit record share one transaction. An
 * audit failure rolls the payment (and any generated client) back.
 *
 * The transaction mock stages every write issued on `tx` and commits it only when the
 * callback resolves. `@/lib/permissions`, `@/lib/auth/require-module`,
 * `@/lib/auth/site-mutation`, `@/lib/validation/client-advances` and `@/lib/audit-data`
 * are real.
 */
const mocks = vi.hoisted(() => {
  const tx = {
    site: { findFirst: vi.fn(), updateMany: vi.fn() },
    client: { findFirst: vi.fn(), create: vi.fn() },
    payment: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    requireUser: vi.fn(),
    revalidatePath: vi.fn(),
    logActivity: vi.fn(),
    tx,
    prisma: {
      company: { findUnique: vi.fn() },
      companyMember: { findFirst: vi.fn() },
      site: { findFirst: vi.fn(), updateMany: vi.fn() },
      client: { findFirst: vi.fn(), create: vi.fn() },
      payment: { create: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))

const { createClientAdvance, createClientAdvanceFromFormAction } = await import('@/actions/client-advance')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', name: 'Tower A', clientId: 'client_1', deletedAt: null },
  { id: 'site_unlinked', companyId: 'company_1', name: 'Tower B', clientId: null, deletedAt: null },
  { id: 'site_foreign_client', companyId: 'company_1', name: 'Tower C', clientId: 'client_foreign', deletedAt: null },
  { id: 'site_dangling_client', companyId: 'company_1', name: 'Tower D', clientId: 'client_deleted', deletedAt: null },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', clientId: 'client_1', deletedAt: new Date('2026-01-01') },
  { id: 'site_foreign', companyId: 'company_2', name: 'Rival', clientId: 'client_foreign', deletedAt: null },
]

const CLIENTS: Row[] = [
  { id: 'client_1', companyId: 'company_1' },
  { id: 'client_foreign', companyId: 'company_2' },
]

let committed: Array<[string, Row]>
let staged: Array<[string, Row]>

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const advance = (overrides: Record<string, unknown> = {}) =>
  ({ siteId: 'site_1', amount: 2500.75, purpose: 'Foundation advance', receivedAt: '2026-09-20T10:30', ...overrides })

function stage(name: string, result: (data: Row) => unknown) {
  return async (args: { data: Row }) => {
    staged.push([name, args.data])
    return result(args.data)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  committed = []
  staged = []
  mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))
  mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['CLIENTS'], status: 'ACTIVE' })

  const sites = inMemoryDelegate(SITES)
  const clients = inMemoryDelegate(CLIENTS)
  for (const client of [mocks.prisma.site, mocks.tx.site]) client.findFirst.mockImplementation(sites.findFirst)
  for (const client of [mocks.prisma.client, mocks.tx.client]) client.findFirst.mockImplementation(clients.findFirst)
  mocks.tx.site.updateMany.mockImplementation(async (args: { where: Row; data: Row }) => {
    const result = await sites.updateMany(args)
    if (result.count) staged.push(['site.updateMany', args.data])
    return result
  })
  mocks.tx.client.create.mockImplementation(stage('client.create', (data) => ({ id: 'client_new', ...data })))
  mocks.tx.payment.create.mockImplementation(stage('payment.create', (data) => ({ id: 'pay_new', ...data })))
  mocks.tx.auditLog.create.mockImplementation(stage('auditLog.create', () => ({ id: 'audit_1' })))
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => {
    staged = []
    const result = await fn(mocks.tx)
    committed.push(...staged)
    return result
  })
})

function expectNothingCommitted() {
  expect(committed).toEqual([])
  for (const write of [mocks.prisma.site.updateMany, mocks.prisma.client.create, mocks.prisma.payment.create, mocks.prisma.auditLog.create]) {
    expect(write).not.toHaveBeenCalled()
  }
  expect(mocks.logActivity).not.toHaveBeenCalled()
}

describe('createClientAdvance: strict boundary validation before any read', () => {
  it.each([
    ['a negative amount', { amount: -5 }],
    ['a zero amount', { amount: 0 }],
    ['negative zero', { amount: -0 }],
    ['NaN', { amount: Number.NaN }],
    ['Infinity', { amount: Number.POSITIVE_INFINITY }],
    ['a sub-paisa amount', { amount: 10.005 }],
    ['an amount beyond Decimal(14, 2)', { amount: 1_000_000_000_000 }],
    ['a numeric string amount', { amount: '2500' }],
    ['a missing amount', { amount: undefined }],
    ['a blank purpose', { purpose: '   ' }],
    ['an over-long purpose', { purpose: 'x'.repeat(501) }],
    ['a non-string purpose', { purpose: 42 }],
    ['a blank site', { siteId: '  ' }],
    ['a non-string site', { siteId: ['site_1'] }],
    ['an over-long site id', { siteId: 's'.repeat(65) }],
    ['an unparseable date', { receivedAt: 'yesterday-ish' }],
    ['a rolled-over calendar date', { receivedAt: '2026-02-30' }],
    ['an out-of-range hour', { receivedAt: '2026-09-20T25:00' }],
    ['a timestamp number', { receivedAt: 1758355200000 }],
    ['an absurd year', { receivedAt: '0001-01-01' }],
    ['an unknown key', { companyId: 'company_2' }],
    ['a client-chosen client id', { clientId: 'client_foreign' }],
  ])('rejects %s', async (_label, overrides) => {
    await expect(createClientAdvance(advance(overrides) as never)).rejects.toThrow(/Invalid client advance/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.tx.site.findFirst).not.toHaveBeenCalled()
    expectNothingCommitted()
  })

  it.each([null, undefined, 'site_1', ['site_1']])('rejects a non-object payload %j', async (payload) => {
    await expect(createClientAdvance(payload as never)).rejects.toThrow(/Invalid client advance/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNothingCommitted()
  })

  it.each(['-5', '0', '1e3', '0x10', '10.005', '', ' ', 'abc', 'Infinity'])('the form entry point rejects amount %j', async (amount) => {
    await expect(createClientAdvanceFromFormAction(form({ siteId: 'site_1', amount, purpose: 'Mobilisation', receivedAt: '2026-09-01T10:00' })))
      .rejects.toThrow(/Invalid client advance/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNothingCommitted()
  })

  it('runs the live permission gate before validation', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    await expect(createClientAdvance(advance({ amount: -1 }))).rejects.toThrow(/payments\.manage/)
    expect(mocks.prisma.company.findUnique).not.toHaveBeenCalled()
    expectNothingCommitted()
  })

  it('refuses when the CLIENTS module is disabled', async () => {
    mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['SITES'], status: 'ACTIVE' })
    await expect(createClientAdvance(advance())).rejects.toThrow(/Module CLIENTS is not enabled/)
    expectNothingCommitted()
  })
})

describe('createClientAdvance: exact tenant site and client', () => {
  it.each([
    ["another tenant's site", 'site_foreign'],
    ['a soft-deleted site', 'site_dead'],
    ['a missing site', 'site_missing'],
  ])('refuses %s', async (_label, siteId) => {
    await expect(createClientAdvance(advance({ siteId }))).rejects.toThrow(/Site not found or access denied/)
    expect(mocks.tx.payment.create).not.toHaveBeenCalled()
    expectNothingCommitted()
  })

  it.each([
    ["another tenant's client", 'site_foreign_client'],
    ['a deleted client', 'site_dangling_client'],
  ])('refuses a site linked to %s', async (_label, siteId) => {
    await expect(createClientAdvance(advance({ siteId }))).rejects.toThrow(/Client not found or access denied/)
    expect(mocks.tx.client.create).not.toHaveBeenCalled()
    expect(mocks.tx.payment.create).not.toHaveBeenCalled()
    expectNothingCommitted()
  })

  it('binds the site and the client inside the transaction, never on the root client', async () => {
    await createClientAdvance(advance())
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.client.findFirst).not.toHaveBeenCalled()
    expect(mocks.tx.site.findFirst.mock.calls[0][0].where).toEqual({ id: 'site_1', companyId: 'company_1', deletedAt: null })
    expect(mocks.tx.client.findFirst.mock.calls[0][0].where).toEqual({ id: 'client_1', companyId: 'company_1' })
  })
})

describe('createClientAdvance: payment and required audit are one transaction', () => {
  it('rolls the confirmed payment back when the audit write fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit store down'))
    await expect(createClientAdvance(advance())).rejects.toThrow(/audit store down/)
    expect(mocks.tx.payment.create).toHaveBeenCalledTimes(1)
    expectNothingCommitted()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('rolls the generated client, the site link and the payment back when the audit write fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit store down'))
    await expect(createClientAdvance(advance({ siteId: 'site_unlinked' }))).rejects.toThrow(/audit store down/)
    expect(mocks.tx.client.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.site.updateMany).toHaveBeenCalledTimes(1)
    expectNothingCommitted()
  })

  it('never falls back to best-effort activity logging', async () => {
    await createClientAdvance(advance())
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit store down'))
    await expect(createClientAdvance(advance())).rejects.toThrow(/audit store down/)
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
  })

  it('commits the payment and its financial audit record with exact metadata', async () => {
    await expect(createClientAdvance(advance())).resolves.toEqual({ success: true, id: 'pay_new' })

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(committed.map(([name]) => name)).toEqual(['payment.create', 'auditLog.create'])
    const paidAt = new Date('2026-09-20T10:30')
    expect(committed[0][1]).toEqual({
      companyId: 'company_1', clientId: 'client_1', siteId: 'site_1', amount: 2500.75,
      type: 'ADVANCE', mode: 'BANK_TRANSFER', notes: 'Foundation advance', status: 'CONFIRMED', paidAt,
    })
    expect(committed[1][1]).toEqual({
      userId: 'user_accountant',
      companyId: 'company_1',
      action: 'CREATE',
      module: 'CLIENT_ADVANCE',
      recordId: 'pay_new',
      before: undefined,
      after: {
        paymentId: 'pay_new',
        clientId: 'client_1',
        clientCreated: false,
        siteId: 'site_1',
        siteName: 'Tower A',
        amount: 2500.75,
        type: 'ADVANCE',
        mode: 'BANK_TRANSFER',
        status: 'CONFIRMED',
        paidAt: paidAt.toISOString(),
        purpose: 'Foundation advance',
        _description: 'ACCOUNTANT recorded ₹2,500.75 client advance for Tower A: Foundation advance',
      },
    })
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/clients/advances')
  })

  it('audits a generated client for an unlinked site', async () => {
    await createClientAdvance(advance({ siteId: 'site_unlinked', purpose: '  Mobilisation  ' }))
    expect(committed.map(([name]) => name)).toEqual(['client.create', 'site.updateMany', 'payment.create', 'auditLog.create'])
    expect(committed[3][1]).toMatchObject({
      recordId: 'pay_new',
      after: { clientId: 'client_new', clientCreated: true, siteId: 'site_unlinked', siteName: 'Tower B', purpose: 'Mobilisation' },
    })
  })

  it('accepts the form entry point and a date-only receipt', async () => {
    await createClientAdvanceFromFormAction(form({ siteId: 'site_1', amount: '25000.5', purpose: 'Mobilisation', receivedAt: '2026-09-01' }))
    expect(committed[0][1]).toMatchObject({ amount: 25000.5, paidAt: new Date('2026-09-01') })
  })
})

describe('createClientAdvance: assigned-site policy', () => {
  it('binds the site through the principal assigned scope', async () => {
    mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
    await createClientAdvance(advance())
    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
    expect(committed[1][1]).toMatchObject({ userId: 'user_company_admin', companyId: 'company_1' })
  })
})
