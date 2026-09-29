import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'

/**
 * Regression for `markVendorPaidAction` (src/actions/vendors.ts) zeroing a vendor payable
 * on one click with no trail.
 *
 * Any `payments.manage` caller could post a vendor id and the balance was set to 0 by a
 * bare `updateMany`: no confirmation, no reason, no record of the amount that was
 * settled, inactive vendors included, and nothing to tie the write to the balance the
 * caller actually saw.
 *
 * Now the caller must type the vendor name back, give a reason and send the balance it is
 * settling. Inside one transaction the action re-reads exactly an active vendor of the
 * live company (company-wide or on a live site), refuses a changed or empty balance,
 * zeroes it with a write guarded on that balance, and writes an immutable audit record of
 * the before/after balance and reason. An audit failure rolls the settlement back. There
 * is no vendor payment model, so the audit record is the settlement record.
 *
 * The transaction mock stages every write issued on `tx` and commits it only when the
 * callback resolves. `@/lib/permissions`, `@/lib/auth/require-module`,
 * `@/lib/auth/site-mutation` and `@/lib/audit-data` are real.
 */
const mocks = vi.hoisted(() => {
  const tx = {
    vendor: { findFirst: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    requireUser: vi.fn(),
    revalidatePath: vi.fn(),
    logActivity: vi.fn(),
    tx,
    prisma: {
      company: { findUnique: vi.fn() },
      vendor: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))

const { markVendorPaidAction } = await import('@/actions/vendors')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', deletedAt: null },
  { id: 'site_deleted', companyId: 'company_1', deletedAt: new Date('2026-01-01') },
  { id: 'site_foreign', companyId: 'company_2', deletedAt: null },
]

const siteOf: RelationResolver = (row, key) => {
  if (key !== 'site') return undefined
  return SITES.find((site) => site.id === row.siteId) ?? null
}

let VENDORS: Row[]

function vendors(): Row[] {
  return [
    { id: 'vendor_1', companyId: 'company_1', siteId: null, isActive: true, name: 'Sri Ram Traders', category: 'Cement', amountPayable: 12500.5 },
    { id: 'vendor_site', companyId: 'company_1', siteId: 'site_1', isActive: true, name: 'Site Vendor', category: null, amountPayable: 800 },
    { id: 'vendor_settled', companyId: 'company_1', siteId: null, isActive: true, name: 'Settled Co', category: null, amountPayable: 0 },
    { id: 'vendor_inactive', companyId: 'company_1', siteId: null, isActive: false, name: 'Gone', category: null, amountPayable: 300 },
    { id: 'vendor_deleted_site', companyId: 'company_1', siteId: 'site_deleted', isActive: true, name: 'Old', category: null, amountPayable: 300 },
    { id: 'vendor_foreign_site', companyId: 'company_1', siteId: 'site_foreign', isActive: true, name: 'Crossed', category: null, amountPayable: 300 },
    { id: 'vendor_foreign', companyId: 'company_2', siteId: null, isActive: true, name: 'Rival', category: null, amountPayable: 300 },
  ]
}

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

const settle = (overrides: Record<string, string> = {}) =>
  form({ id: 'vendor_1', dangerConfirmText: 'Sri Ram Traders', reason: 'Paid by NEFT UTR 4471', amount: '12500.5', ...overrides })

beforeEach(() => {
  vi.clearAllMocks()
  VENDORS = vendors()
  committed = []
  staged = []
  mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))
  mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['MATERIALS'], status: 'ACTIVE' })

  const delegate = inMemoryDelegate(VENDORS, siteOf)
  for (const client of [mocks.prisma.vendor, mocks.tx.vendor]) client.findFirst.mockImplementation(delegate.findFirst)
  mocks.tx.vendor.updateMany.mockImplementation(async (args: { where: Row; data: Row }) => {
    const result = await delegate.updateMany(args)
    if (result.count) staged.push(['vendor.updateMany', args.data])
    return result
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

function expectNothingCommitted() {
  expect(committed).toEqual([])
  expect(mocks.prisma.vendor.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.vendor.update).not.toHaveBeenCalled()
  expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
  expect(mocks.logActivity).not.toHaveBeenCalled()
}

describe('markVendorPaidAction: gate', () => {
  it.each(['PURCHASE_MANAGER', 'PROJECT_MANAGER', 'SITE_ENGINEER', 'CLIENT'])('refuses live %s without payments.manage before any read', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(markVendorPaidAction(settle())).rejects.toThrow(/payments\.manage/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.tx.vendor.findFirst).not.toHaveBeenCalled()
    expectNothingCommitted()
  })

  it('refuses when the MATERIALS module is disabled', async () => {
    mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['CLIENTS'], status: 'ACTIVE' })
    await expect(markVendorPaidAction(settle())).rejects.toThrow(/Module MATERIALS is not enabled/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNothingCommitted()
  })
})

describe('markVendorPaidAction: explicit confirmation', () => {
  it.each([
    ['missing', { dangerConfirmText: '' }],
    ['wrong', { dangerConfirmText: 'Sri Ram' }],
    ["another vendor's", { dangerConfirmText: 'Site Vendor' }],
    ['case-altered', { dangerConfirmText: 'sri ram traders' }],
  ])('refuses a %s confirmation and commits nothing', async (_label, overrides) => {
    await expect(markVendorPaidAction(settle(overrides))).rejects.toThrow(/confirmation text did not match the vendor name/)
    expectNothingCommitted()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses when the confirmation field is absent', async () => {
    const fd = settle()
    fd.delete('dangerConfirmText')
    await expect(markVendorPaidAction(fd)).rejects.toThrow(/confirmation text did not match/)
    expectNothingCommitted()
  })

  it('accepts surrounding whitespace around the exact name', async () => {
    await expect(markVendorPaidAction(settle({ dangerConfirmText: '  Sri Ram Traders ' }))).resolves.toBeUndefined()
    expect(committed.map(([name]) => name)).toEqual(['vendor.updateMany', 'auditLog.create'])
  })

  it.each([['blank', '   '], ['over-long', 'x'.repeat(501)]])('refuses a %s reason before any read', async (_label, reason) => {
    await expect(markVendorPaidAction(settle({ reason }))).rejects.toThrow(/reason/i)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNothingCommitted()
  })

  it.each(['', 'abc', '-1', 'Infinity', '12500.505', '1e3'])('refuses settled amount %j before any read', async (amount) => {
    await expect(markVendorPaidAction(settle({ amount }))).rejects.toThrow(/settled amount/i)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNothingCommitted()
  })

  it('refuses when the balance changed since the caller saw it', async () => {
    await expect(markVendorPaidAction(settle({ amount: '12000' }))).rejects.toThrow(/payable changed/)
    expectNothingCommitted()
  })

  it('refuses a vendor with nothing payable', async () => {
    await expect(markVendorPaidAction(settle({ id: 'vendor_settled', dangerConfirmText: 'Settled Co', amount: '0' }))).rejects.toThrow(/no payable balance/)
    expectNothingCommitted()
  })
})

describe('markVendorPaidAction: vendor binding', () => {
  it.each([
    ['another tenant', 'vendor_foreign', 'Rival'],
    ['a vendor on a soft-deleted site', 'vendor_deleted_site', 'Old'],
    ["a vendor on another tenant's site", 'vendor_foreign_site', 'Crossed'],
    ['an inactive vendor', 'vendor_inactive', 'Gone'],
    ['a missing vendor', 'vendor_missing', 'Rival'],
  ])('refuses %s', async (_label, id, name) => {
    await expect(markVendorPaidAction(settle({ id, dangerConfirmText: name, amount: '300' }))).rejects.toThrow(/Vendor not found or access denied/)
    expect(mocks.tx.vendor.updateMany).not.toHaveBeenCalled()
    expectNothingCommitted()
  })

  it('re-reads the vendor inside the transaction, never on the root client', async () => {
    await markVendorPaidAction(settle())
    expect(mocks.prisma.vendor.findFirst).not.toHaveBeenCalled()
    expect(mocks.tx.vendor.findFirst).toHaveBeenCalledTimes(1)
  })

  it('rolls back when the guarded write matches no row (balance raced)', async () => {
    mocks.tx.vendor.updateMany.mockResolvedValue({ count: 0 })
    await expect(markVendorPaidAction(settle())).rejects.toThrow(/payable changed/)
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expectNothingCommitted()
  })
})

describe('markVendorPaidAction: audited settlement', () => {
  it('rolls the settlement back when the required audit write fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit store down'))
    await expect(markVendorPaidAction(settle())).rejects.toThrow(/audit store down/)
    expect(mocks.tx.vendor.updateMany).toHaveBeenCalledTimes(1)
    expectNothingCommitted()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('zeroes exactly the bound balance and records before/after balance and reason as the live principal', async () => {
    await expect(markVendorPaidAction(settle())).resolves.toBeUndefined()

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.vendor.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'vendor_1', companyId: 'company_1', isActive: true, amountPayable: 12500.5,
        OR: [{ siteId: null }, { site: { companyId: 'company_1', deletedAt: null } }],
      },
      data: { amountPayable: 0 },
    })
    expect(committed.map(([name]) => name)).toEqual(['vendor.updateMany', 'auditLog.create'])

    const [, audit] = committed[1]
    expect(audit).toEqual({
      userId: 'user_accountant',
      companyId: 'company_1',
      action: 'PAID',
      module: 'VENDOR',
      recordId: 'vendor_1',
      before: { name: 'Sri Ram Traders', siteId: null, isActive: true, amountPayable: 12500.5 },
      after: {
        name: 'Sri Ram Traders',
        siteId: null,
        isActive: true,
        amountPayable: 0,
        settledAmount: 12500.5,
        reason: 'Paid by NEFT UTR 4471',
        _description: 'ACCOUNTANT settled ₹12,500.5 payable to vendor "Sri Ram Traders": Paid by NEFT UTR 4471',
      },
    })
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/vendors')
  })

  it('settles a vendor bound to a live site of the company', async () => {
    await markVendorPaidAction(settle({ id: 'vendor_site', dangerConfirmText: 'Site Vendor', amount: '800.00' }))
    expect(committed[1][1]).toMatchObject({ recordId: 'vendor_site', before: { amountPayable: 800, siteId: 'site_1' }, after: { settledAmount: 800 } })
  })

  it('lets COMPANY_ADMIN settle', async () => {
    mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
    await markVendorPaidAction(settle())
    expect(committed[1][1]).toMatchObject({ userId: 'user_company_admin', companyId: 'company_1' })
  })
})
