import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for `raiseInvoice` and `createClientAdvance` authorizing from JWT claims alone.
 *
 * Both only checked that the token carried a company id: any role (a SITE_ENGINEER, a
 * revoked member) could raise invoices or record advances, the CLIENTS module was ignored,
 * `raiseInvoice` wrote an invoice against any client id and then incremented that client's
 * `amountDue` by bare id (cross-tenant), an invoice could name another client's or another
 * tenant's site, `createClientAdvance` accepted deleted sites and trusted a site's
 * `clientId` without checking the client's company, and every multi-step write was
 * unguarded so a failure half-way left an invoice without its receivable (or a generic
 * client without its advance).
 *
 * Now both require live `payments.manage` + CLIENTS before any read, bind the client and
 * site to exactly the live company (the site to the client, and not soft deleted), and do
 * every write in one transaction with counted guarded updates.
 *
 * `@/lib/permissions`, `@/lib/auth/require-permission`, `@/lib/auth/require-module` and
 * `@/lib/auth/site-mutation` are real.
 */
const mocks = vi.hoisted(() => {
  const tx = {
    site: { findFirst: vi.fn(), updateMany: vi.fn() },
    client: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    invoice: { count: vi.fn(), create: vi.fn() },
    payment: { create: vi.fn() },
  }
  return {
    requireUser: vi.fn(),
    auth: vi.fn(),
    revalidatePath: vi.fn(),
    logActivity: vi.fn(),
    tx,
    prisma: {
      company: { findUnique: vi.fn() },
      site: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      client: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      invoice: { count: vi.fn(), create: vi.fn() },
      payment: { create: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))

const { raiseInvoice } = await import('@/actions/invoices')
const { createClientAdvance } = await import('@/actions/client-advance')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', name: 'Tower A', clientId: 'client_1', deletedAt: null },
  { id: 'site_unlinked', companyId: 'company_1', name: 'Tower B', clientId: null, deletedAt: null },
  { id: 'site_other_client', companyId: 'company_1', name: 'Tower C', clientId: 'client_2', deletedAt: null },
  { id: 'site_foreign_client', companyId: 'company_1', name: 'Tower D', clientId: 'client_foreign', deletedAt: null },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', clientId: 'client_1', deletedAt: new Date('2026-01-01') },
  { id: 'site_foreign', companyId: 'company_2', name: 'Other', clientId: 'client_foreign', deletedAt: null },
]

const CLIENTS: Row[] = [
  { id: 'client_1', companyId: 'company_1', siteId: 'site_1' },
  { id: 'client_2', companyId: 'company_1', siteId: 'site_other_client' },
  { id: 'client_foreign', companyId: 'company_2', siteId: 'site_foreign' },
]

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.append(key, value)
  return fd
}

const invoiceForm = (overrides: Record<string, string> = {}) =>
  form({ clientId: 'client_1', siteId: 'site_1', amount: '5000', milestone: 'Slab', dueDate: '2026-10-01', notes: '', ...overrides })

const advance = (overrides: Partial<{ siteId: string; amount: number; purpose: string; receivedAt: string }> = {}) =>
  ({ siteId: 'site_1', amount: 2500, purpose: 'Foundation advance', receivedAt: '2026-09-20', ...overrides })

let modules: unknown
/** Writes that survived a committed transaction; a rolled-back callback leaves nothing here. */
let committed: Array<[string, Row]>
let staged: Array<[string, Row]>

function stage(name: string, result: (data: Row) => unknown) {
  return async (args: { data: Row }) => {
    staged.push([name, args.data])
    return result(args.data)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['CLIENTS', 'SITES']
  committed = []
  staged = []
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  // A stale JWT still claiming admin: the actions must never trust it.
  mocks.auth.mockResolvedValue({ user: principal('COMPANY_ADMIN') })
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))

  const sites = inMemoryDelegate(SITES)
  const clients = inMemoryDelegate(CLIENTS)
  for (const delegate of [mocks.prisma.site, mocks.tx.site]) delegate.findFirst.mockImplementation(sites.findFirst)
  for (const delegate of [mocks.prisma.client, mocks.tx.client]) delegate.findFirst.mockImplementation(clients.findFirst)
  mocks.tx.site.updateMany.mockImplementation(async (args: { where: Row; data: Row }) => {
    const result = await sites.updateMany(args)
    if (result.count) staged.push(['site.updateMany', args.data])
    return result
  })
  mocks.tx.client.updateMany.mockImplementation(async (args: { where: Row; data: Row }) => {
    const result = await clients.updateMany(args)
    if (result.count) staged.push(['client.updateMany', args.data])
    return result
  })
  mocks.tx.client.create.mockImplementation(stage('client.create', (data) => ({ id: 'client_new', ...data })))
  mocks.tx.invoice.count.mockResolvedValue(6)
  mocks.tx.invoice.create.mockImplementation(stage('invoice.create', (data) => ({ id: 'inv_new', ...data })))
  mocks.tx.payment.create.mockImplementation(stage('payment.create', (data) => ({ id: 'pay_new', ...data })))

  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => {
    staged = []
    const result = await fn(mocks.tx)
    committed.push(...staged)
    return result
  })
})

/** Writes issued outside a transaction; none are allowed. */
function bareWrites() {
  return [
    mocks.prisma.site.update, mocks.prisma.site.updateMany,
    mocks.prisma.client.create, mocks.prisma.client.update, mocks.prisma.client.updateMany,
    mocks.prisma.invoice.create, mocks.prisma.payment.create, mocks.tx.client.update,
  ].reduce((sum, fn) => sum + fn.mock.calls.length, 0)
}

const ACTIONS = [
  { name: 'raiseInvoice', run: () => raiseInvoice(invoiceForm()) },
  { name: 'createClientAdvance', run: () => createClientAdvance(advance()) },
]

describe('finance actions: live principal, permission and module before any read', () => {
  it.each(ACTIONS)('$name refuses a revoked principal even with a valid-looking JWT', async ({ run }) => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))
    await expect(run()).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.client.findFirst).not.toHaveBeenCalled()
    expect(committed).toEqual([])
  })

  it.each(ACTIONS.flatMap((action) => ['PROJECT_MANAGER', 'SITE_ENGINEER', 'SUPERVISOR', 'PURCHASE_MANAGER', 'CLIENT', 'VENDOR', 'SUBCONTRACTOR'].map((role) => ({ ...action, role }))))(
    '$name refuses live $role without payments.manage before any read',
    async ({ run, role }) => {
      mocks.requireUser.mockResolvedValue(principal(role))
      await expect(run()).rejects.toThrow(/payments\.manage/)
      expect(mocks.prisma.company.findUnique).not.toHaveBeenCalled()
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
      expect(committed).toEqual([])
    },
  )

  it.each(ACTIONS)('$name lets a live ACCOUNTANT through', async ({ run }) => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))
    await expect(run()).resolves.toMatchObject({ success: true })
  })

  it.each(ACTIONS)('$name refuses SUPER_ADMIN, which has no tenant context', async ({ run }) => {
    mocks.requireUser.mockResolvedValue({ id: 'root', role: 'SUPER_ADMIN', email: 'root@x', name: 'Root' })
    await expect(run()).rejects.toThrow(/Tenant context required/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it.each(ACTIONS)('$name refuses when the CLIENTS module is disabled', async ({ run }) => {
    modules = ['SITES']
    await expect(run()).rejects.toThrow(/Module CLIENTS is not enabled/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(committed).toEqual([])
  })
})

describe('raiseInvoice', () => {
  it.each(['client_foreign', 'missing', ''])('refuses client %j that is not of the live company', async (clientId) => {
    await expect(raiseInvoice(invoiceForm({ clientId, siteId: '' }))).rejects.toThrow(/Client not found or access denied|Invalid invoice/)
    expect(committed).toEqual([])
    expect(bareWrites()).toBe(0)
  })

  it.each([
    ['a foreign site', 'site_foreign'],
    ['a deleted site', 'site_dead'],
    ["another client's site", 'site_other_client'],
    ['a missing site', 'missing'],
  ])('refuses %s', async (_label, siteId) => {
    await expect(raiseInvoice(invoiceForm({ siteId }))).rejects.toThrow(/Site not found or access denied/)
    expect(mocks.tx.invoice.create).not.toHaveBeenCalled()
    expect(committed).toEqual([])
  })

  it.each(['0', '-10', 'abc', 'Infinity', ''])('rejects amount %j before any write', async (amount) => {
    await expect(raiseInvoice(invoiceForm({ amount }))).rejects.toThrow(/invalid/i)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects an unparseable due date', async () => {
    await expect(raiseInvoice(invoiceForm({ dueDate: 'not-a-date' }))).rejects.toThrow(/Invalid due date/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('creates the invoice and increments the receivable of exactly the tenant client in one transaction', async () => {
    const result = await raiseInvoice(invoiceForm())
    expect(result).toEqual({ success: true, invoiceNumber: 'INV-0007' })
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.invoice.count).toHaveBeenCalledWith({ where: { companyId: 'company_1' } })
    expect(mocks.tx.invoice.create.mock.calls[0][0].data).toMatchObject({
      companyId: 'company_1', clientId: 'client_1', siteId: 'site_1', invoiceNumber: 'INV-0007', amount: 5000, status: 'DUE',
    })
    expect(mocks.tx.client.updateMany).toHaveBeenCalledWith({
      where: { id: 'client_1', companyId: 'company_1' },
      data: { amountDue: { increment: 5000 } },
    })
    expect(committed.map(([name]) => name)).toEqual(['invoice.create', 'client.updateMany'])
    expect(bareWrites()).toBe(0)
  })

  it('allows an invoice with no site', async () => {
    await raiseInvoice(invoiceForm({ siteId: '' }))
    expect(mocks.tx.invoice.create.mock.calls[0][0].data).toMatchObject({ siteId: null })
  })

  it('rolls the invoice back when the receivable update matches no row', async () => {
    mocks.tx.client.updateMany.mockResolvedValue({ count: 0 })
    await expect(raiseInvoice(invoiceForm())).rejects.toThrow(/Client not found or access denied/)
    expect(mocks.tx.invoice.create).toHaveBeenCalledTimes(1)
    expect(committed).toEqual([])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe('createClientAdvance', () => {
  it.each([
    ['a foreign site', 'site_foreign'],
    ['a deleted site', 'site_dead'],
    ['a missing site', 'missing'],
  ])('refuses %s', async (_label, siteId) => {
    await expect(createClientAdvance(advance({ siteId }))).rejects.toThrow(/Site not found or access denied/)
    expect(committed).toEqual([])
    expect(bareWrites()).toBe(0)
  })

  it("refuses a site whose client link points at another tenant's client", async () => {
    await expect(createClientAdvance(advance({ siteId: 'site_foreign_client' }))).rejects.toThrow(/Client not found or access denied/)
    expect(mocks.tx.payment.create).not.toHaveBeenCalled()
    expect(committed).toEqual([])
  })

  it.each([
    ['a zero amount', { amount: 0 }],
    ['a negative amount', { amount: -5 }],
    ['a non-finite amount', { amount: Number.POSITIVE_INFINITY }],
    ['a blank purpose', { purpose: '  ' }],
    ['an invalid received date', { receivedAt: 'yesterday-ish' }],
    ['no site', { siteId: '' }],
  ])('rejects %s before any write', async (_label, overrides) => {
    await expect(createClientAdvance(advance(overrides))).rejects.toThrow()
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('records the advance against the site client of the live company', async () => {
    await expect(createClientAdvance(advance())).resolves.toEqual({ success: true, id: 'pay_new' })
    expect(mocks.tx.client.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'client_1', companyId: 'company_1' } }))
    expect(mocks.tx.payment.create.mock.calls[0][0].data).toMatchObject({
      companyId: 'company_1', clientId: 'client_1', siteId: 'site_1', amount: 2500, type: 'ADVANCE', status: 'CONFIRMED',
    })
    expect(mocks.tx.client.create).not.toHaveBeenCalled()
    expect(committed.map(([name]) => name)).toEqual(['payment.create'])
    expect(bareWrites()).toBe(0)
    expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user_company_admin', companyId: 'company_1' }))
  })

  it('creates and links a client for an unlinked site atomically with the advance', async () => {
    await createClientAdvance(advance({ siteId: 'site_unlinked' }))
    expect(mocks.tx.site.updateMany).toHaveBeenCalledWith({
      where: { id: 'site_unlinked', companyId: 'company_1', deletedAt: null, clientId: null },
      data: { clientId: 'client_new' },
    })
    expect(committed.map(([name]) => name)).toEqual(['client.create', 'site.updateMany', 'payment.create'])
  })

  it('rolls back the generated client when the site link races', async () => {
    mocks.tx.site.updateMany.mockResolvedValue({ count: 0 })
    await expect(createClientAdvance(advance({ siteId: 'site_unlinked' }))).rejects.toThrow()
    expect(mocks.tx.client.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.payment.create).not.toHaveBeenCalled()
    expect(committed).toEqual([])
  })

  it('rolls everything back when the payment write fails', async () => {
    mocks.tx.payment.create.mockRejectedValue(new Error('db down'))
    await expect(createClientAdvance(advance({ siteId: 'site_unlinked' }))).rejects.toThrow(/db down/)
    expect(committed).toEqual([])
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })
})
