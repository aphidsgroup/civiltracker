import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for `raiseInvoice` (src/actions/invoices.ts) validating loosely and writing a
 * receivable with no audit trail.
 *
 * The amount went through `Number()`, so exponent forms, sub-paisa fractions and values
 * past the `Decimal(14, 2)` column were accepted; the due date was any `Date` parse, so
 * `2026-02-30` rolled into March; the milestone was unbounded; a field role holding
 * `payments.manage` could invoice a site it is not assigned to or a company-level invoice;
 * and the invoice plus receivable increment carried no audit record.
 *
 * Now every field is parsed strictly before any read, the site must be a live site of the
 * live company in the principal's assigned scope that is linked to the client (a field role
 * must name one), and the invoice, the receivable write guarded on the balance read and the
 * immutable financial audit share one transaction: an audit failure rolls all of it back.
 *
 * The transaction mock stages writes issued on `tx` and commits them only when the
 * callback resolves. `@/lib/auth/site-mutation` and `@/lib/audit-data` are real; the
 * permission matrix is widened for field roles so the assigned-site policy is exercised.
 */
const mocks = vi.hoisted(() => {
  const tx = {
    site: { findFirst: vi.fn() },
    client: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    invoice: { count: vi.fn(), create: vi.fn() },
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
      site: { findFirst: vi.fn() },
      client: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
      invoice: { count: vi.fn(), create: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/permissions')>()
  return {
    ...actual,
    hasPermission: (role: string, permission: string) =>
      (role === 'SITE_ENGINEER' && permission === 'payments.manage') || actual.hasPermission(role as never, permission as never),
  }
})
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))

const { raiseInvoice } = await import('@/actions/invoices')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', clientId: 'client_1', deletedAt: null, assignedEngineerId: 'user_site_engineer', engineerId: null },
  { id: 'site_linked_by_client', companyId: 'company_1', clientId: null, deletedAt: null, assignedEngineerId: null, engineerId: null },
  { id: 'site_unassigned', companyId: 'company_1', clientId: 'client_1', deletedAt: null, assignedEngineerId: 'someone_else', engineerId: null },
  { id: 'site_other_client', companyId: 'company_1', clientId: 'client_2', deletedAt: null, assignedEngineerId: 'user_site_engineer', engineerId: null },
  { id: 'site_dead', companyId: 'company_1', clientId: 'client_1', deletedAt: new Date('2026-01-01'), assignedEngineerId: 'user_site_engineer', engineerId: null },
  { id: 'site_foreign', companyId: 'company_2', clientId: 'client_1', deletedAt: null, assignedEngineerId: 'user_site_engineer', engineerId: null },
]

const CLIENTS: Row[] = [
  { id: 'client_1', companyId: 'company_1', name: 'Anand Homes', siteId: 'site_linked_by_client', amountDue: 1000.25 },
  { id: 'client_2', companyId: 'company_1', name: 'Other Buyer', siteId: 'site_other_client', amountDue: 0 },
  { id: 'client_foreign', companyId: 'company_2', name: 'Rival Buyer', siteId: 'site_foreign', amountDue: 0 },
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
  form({ clientId: 'client_1', siteId: 'site_1', amount: '5000.50', milestone: 'Slab casting', dueDate: '2026-10-01', notes: '', ...overrides })

let committed: Array<[string, Row]>
let staged: Array<[string, Row]>

beforeEach(() => {
  vi.clearAllMocks()
  committed = []
  staged = []
  mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))
  mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['CLIENTS'], status: 'ACTIVE' })
  mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: [] })

  const sites = inMemoryDelegate(SITES)
  const clients = inMemoryDelegate(CLIENTS)
  for (const delegate of [mocks.prisma.site, mocks.tx.site]) delegate.findFirst.mockImplementation(sites.findFirst)
  for (const delegate of [mocks.prisma.client, mocks.tx.client]) delegate.findFirst.mockImplementation(clients.findFirst)
  mocks.tx.client.updateMany.mockImplementation(async (args: { where: Row; data: Row }) => {
    const result = await clients.updateMany(args)
    if (result.count) staged.push(['client.updateMany', args.data])
    return result
  })
  mocks.tx.invoice.count.mockResolvedValue(6)
  mocks.tx.invoice.create.mockImplementation(async (args: { data: Row }) => {
    staged.push(['invoice.create', args.data])
    return { id: 'inv_new', ...args.data }
  })
  mocks.tx.auditLog.create.mockImplementation(async (args: { data: Row }) => {
    staged.push(['auditLog.create', args.data])
    return { id: 'audit_1' }
  })
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => {
    staged = []
    const result = await fn(mocks.tx)
    committed.push(...staged)
    return result
  })
})

function expectNothingWritten() {
  expect(committed).toEqual([])
  for (const fn of [mocks.prisma.client.updateMany, mocks.prisma.client.update, mocks.prisma.invoice.create, mocks.prisma.auditLog.create, mocks.tx.client.update, mocks.logActivity]) {
    expect(fn).not.toHaveBeenCalled()
  }
  expect(mocks.revalidatePath).not.toHaveBeenCalled()
}

describe('raiseInvoice: strict boundary validation', () => {
  it.each([
    ['exponent', '5e3'],
    ['hex', '0x10'],
    ['sub-paisa', '100.001'],
    ['negative', '-100'],
    ['zero', '0'],
    ['zero with decimals', '0.00'],
    ['over the Decimal(14,2) column', '1000000000000'],
    ['NaN', 'NaN'],
    ['Infinity', 'Infinity'],
    ['grouped', '1,000'],
    ['blank', ''],
  ])('rejects a %s amount before any read', async (_label, amount) => {
    await expect(raiseInvoice(invoiceForm({ amount }))).rejects.toThrow(/Invalid invoice amount/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  it('rejects a missing amount field', async () => {
    const fd = invoiceForm()
    fd.delete('amount')
    await expect(raiseInvoice(fd)).rejects.toThrow(/Invalid invoice amount/)
    expectNothingWritten()
  })

  it.each([
    ['a rolled-over date', '2026-02-30'],
    ['free text', 'next friday'],
    ['a timestamp', '2026-10-01T10:00:00Z'],
    ['an out-of-range year', '0999-01-01'],
  ])('rejects %s as the due date', async (_label, dueDate) => {
    await expect(raiseInvoice(invoiceForm({ dueDate }))).rejects.toThrow(/Invalid due date/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it.each([
    ['a blank milestone', { milestone: '  ' }, /Milestone is required/],
    ['an overlong milestone', { milestone: 'x'.repeat(201) }, /Milestone must be at most 200 characters/],
    ['a blank client', { clientId: '' }, /Client is required/],
    ['an overlong client id', { clientId: 'c'.repeat(65) }, /Invalid client/],
    ['an overlong site id', { siteId: 's'.repeat(65) }, /Invalid site/],
  ])('rejects %s before any read', async (_label, overrides, error) => {
    await expect(raiseInvoice(invoiceForm(overrides))).rejects.toThrow(error)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a payload that is not form data', async () => {
    await expect(raiseInvoice({ clientId: 'client_1', amount: '5' } as unknown as FormData)).rejects.toThrow(/Invalid invoice/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('raiseInvoice: client and site relation', () => {
  it.each(['client_foreign', 'missing'])('refuses client %s that is not of the live company', async (clientId) => {
    await expect(raiseInvoice(invoiceForm({ clientId, siteId: '' }))).rejects.toThrow(/Client not found or access denied/)
    expectNothingWritten()
  })

  it.each([
    ['a foreign-company site linked to the client', 'site_foreign'],
    ['a deleted site', 'site_dead'],
    ["another client's site", 'site_other_client'],
    ['a missing site', 'missing'],
  ])('refuses %s', async (_label, siteId) => {
    await expect(raiseInvoice(invoiceForm({ siteId }))).rejects.toThrow(/Site not found or access denied/)
    expect(mocks.tx.invoice.create).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  it("accepts the client's own linked site", async () => {
    await raiseInvoice(invoiceForm({ siteId: 'site_linked_by_client' }))
    expect(mocks.tx.invoice.create.mock.calls[0][0].data).toMatchObject({ siteId: 'site_linked_by_client' })
  })

  it('a field role invoices only an assigned site linked to the client', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    await expect(raiseInvoice(invoiceForm({ siteId: 'site_unassigned' }))).rejects.toThrow(/Site not found or access denied/)
    await expect(raiseInvoice(invoiceForm({ siteId: '' }))).rejects.toThrow(/Site not found or access denied/)
    expectNothingWritten()

    await expect(raiseInvoice(invoiceForm())).resolves.toEqual({ success: true, invoiceNumber: 'INV-0007' })
    expect(mocks.tx.invoice.create.mock.calls[0][0].data).toMatchObject({ siteId: 'site_1' })
  })

  it('a company role may raise a company-level invoice with no site', async () => {
    await raiseInvoice(invoiceForm({ siteId: '' }))
    expect(mocks.tx.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.tx.invoice.create.mock.calls[0][0].data).toMatchObject({ siteId: null })
  })
})

describe('raiseInvoice: one audited transaction', () => {
  it('creates the invoice, sets the guarded receivable and audits it, all in one transaction', async () => {
    const result = await raiseInvoice(invoiceForm())
    expect(result).toEqual({ success: true, invoiceNumber: 'INV-0007' })
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)

    expect(mocks.tx.invoice.create.mock.calls[0][0].data).toEqual({
      companyId: 'company_1', clientId: 'client_1', siteId: 'site_1', invoiceNumber: 'INV-0007',
      amount: 5000.5, milestone: 'Slab casting', status: 'DUE', dueDate: new Date('2026-10-01'),
    })
    expect(mocks.tx.client.updateMany).toHaveBeenCalledWith({
      where: { id: 'client_1', companyId: 'company_1', amountDue: 1000.25 },
      data: { amountDue: 6000.75 },
    })
    expect(committed.map(([name]) => name)).toEqual(['invoice.create', 'client.updateMany', 'auditLog.create'])

    const audit = mocks.tx.auditLog.create.mock.calls[0][0].data
    expect(audit).toMatchObject({
      userId: 'user_accountant', companyId: 'company_1', action: 'CREATE', module: 'INVOICE', recordId: 'inv_new',
      before: { clientId: 'client_1', amountDue: 1000.25 },
      after: {
        invoiceNumber: 'INV-0007', clientId: 'client_1', siteId: 'site_1', amount: 5000.5,
        milestone: 'Slab casting', dueDate: '2026-10-01', status: 'DUE', amountDue: 6000.75,
      },
    })
    expect(audit.after._description).toMatch(/INV-0007/)
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/clients')
  })

  it('rolls the invoice and receivable back when the audit write fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit down'))
    await expect(raiseInvoice(invoiceForm())).rejects.toThrow('audit down')
    expect(mocks.tx.invoice.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.client.updateMany).toHaveBeenCalledTimes(1)
    expectNothingWritten()
  })

  it('rolls the invoice back when the receivable changed under it', async () => {
    mocks.tx.client.updateMany.mockResolvedValue({ count: 0 })
    await expect(raiseInvoice(invoiceForm())).rejects.toThrow(/Client receivable changed/)
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  it('refuses an invoice that would overflow the receivable column', async () => {
    mocks.tx.client.findFirst.mockResolvedValue({ ...CLIENTS[0], amountDue: 999_999_999_999 })
    await expect(raiseInvoice(invoiceForm({ amount: '1' }))).rejects.toThrow(/exceed/i)
    expect(mocks.tx.invoice.create).not.toHaveBeenCalled()
    expectNothingWritten()
  })
})
