import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'

/**
 * Regression for `updateVendorAction` (src/actions/vendors.ts) rewriting a vendor's payable
 * balance and status as a side effect of a profile edit.
 *
 * Any `materials.update` caller editing a vendor's name or phone also posted
 * `amountPayable` and `isActive`: a blank payable silently became 0, any number replaced
 * the balance, and the status select deactivated the vendor without the typed
 * confirmation `deactivateVendorAction` asks for. Nothing was audited.
 *
 * Now the profile edit writes only profile fields (plus a reactivation), guarded and
 * audited with before/after in one transaction. A payable that differs from the stored
 * balance, or a deactivation, is refused. A balance change goes through
 * `adjustVendorPayableAction`: live `payments.manage` + MATERIALS, the vendor name typed
 * back, a reason and the balance the caller saw; an active vendor of the live company is
 * re-read, the write is guarded on that balance and the before/after audit shares the
 * transaction, so an audit failure rolls the adjustment back.
 *
 * The transaction mock stages writes issued on `tx` and commits them only when the
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

const { updateVendorAction, adjustVendorPayableAction } = await import('@/actions/vendors')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', deletedAt: null },
  { id: 'site_deleted', companyId: 'company_1', deletedAt: new Date('2026-01-01') },
  { id: 'site_foreign', companyId: 'company_2', deletedAt: null },
]

const siteOf: RelationResolver = (row, key) => {
  if (key !== 'site') return undefined
  return SITES.find((site) => site.id === row.siteId) ?? null
}

const PROFILE = { phone: '98400 11111', email: 'accounts@sriram.test', gst: '33AAAAA0000A1Z5', category: 'Cement', address: 'Chennai', paymentTerms: 'Net 30' }

function vendors(): Row[] {
  return [
    { id: 'vendor_1', companyId: 'company_1', siteId: null, isActive: true, name: 'Sri Ram Traders', ...PROFILE, amountPayable: 12500.5 },
    { id: 'vendor_site', companyId: 'company_1', siteId: 'site_1', isActive: true, name: 'Site Vendor', ...PROFILE, amountPayable: 0 },
    { id: 'vendor_inactive', companyId: 'company_1', siteId: null, isActive: false, name: 'Gone', ...PROFILE, amountPayable: 300 },
    { id: 'vendor_deleted_site', companyId: 'company_1', siteId: 'site_deleted', isActive: true, name: 'Old', ...PROFILE, amountPayable: 300 },
    { id: 'vendor_foreign_site', companyId: 'company_1', siteId: 'site_foreign', isActive: true, name: 'Crossed', ...PROFILE, amountPayable: 300 },
    { id: 'vendor_foreign', companyId: 'company_2', siteId: null, isActive: true, name: 'Rival', ...PROFILE, amountPayable: 300 },
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

const edit = (overrides: Record<string, string> = {}) =>
  form({ id: 'vendor_1', name: 'Sri Ram Traders Pvt Ltd', ...PROFILE, phone: '98400 22222', ...overrides })

const adjust = (overrides: Record<string, string> = {}) =>
  form({ id: 'vendor_1', amount: '14000', expectedAmount: '12500.50', dangerConfirmText: 'Sri Ram Traders', reason: 'Invoice 771 booked late', ...overrides })

beforeEach(() => {
  vi.clearAllMocks()
  committed = []
  staged = []
  mocks.requireUser.mockResolvedValue(principal('PURCHASE_MANAGER'))
  mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['MATERIALS'], status: 'ACTIVE' })

  const delegate = inMemoryDelegate(vendors(), siteOf)
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

describe('updateVendorAction: profile only', () => {
  it('writes only profile fields, guarded on the bound vendor, and audits before/after in the same transaction', async () => {
    await expect(updateVendorAction(edit())).resolves.toBeUndefined()

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.vendor.findFirst).not.toHaveBeenCalled()
    const [{ where, data }] = mocks.tx.vendor.updateMany.mock.calls[0]
    expect(where).toMatchObject({ id: 'vendor_1', companyId: 'company_1', isActive: true })
    expect(data).toEqual({ name: 'Sri Ram Traders Pvt Ltd', ...PROFILE, phone: '98400 22222' })
    expect(data).not.toHaveProperty('amountPayable')
    expect(data).not.toHaveProperty('isActive')

    expect(committed.map(([name]) => name)).toEqual(['vendor.updateMany', 'auditLog.create'])
    expect(committed[1][1]).toEqual({
      userId: 'user_purchase_manager',
      companyId: 'company_1',
      action: 'UPDATE',
      module: 'VENDOR',
      recordId: 'vendor_1',
      before: { name: 'Sri Ram Traders', ...PROFILE, isActive: true },
      after: {
        name: 'Sri Ram Traders Pvt Ltd',
        ...PROFILE,
        phone: '98400 22222',
        isActive: true,
        _description: 'PURCHASE_MANAGER updated vendor "Sri Ram Traders Pvt Ltd"',
      },
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/vendors')
  })

  it('never zeroes the balance when the payable field is absent or blank', async () => {
    await updateVendorAction(edit())
    await updateVendorAction(edit({ amountPayable: '' }))
    for (const [{ data }] of mocks.tx.vendor.updateMany.mock.calls) expect(data).not.toHaveProperty('amountPayable')
  })

  it('tolerates the unchanged balance echoed back by an old form', async () => {
    await expect(updateVendorAction(edit({ amountPayable: '12500.50' }))).resolves.toBeUndefined()
    expect(mocks.tx.vendor.updateMany.mock.calls[0][0].data).not.toHaveProperty('amountPayable')
  })

  it.each(['0', '14000', '12500.49'])('refuses a changed payable %s and commits nothing', async (amountPayable) => {
    await expect(updateVendorAction(edit({ amountPayable }))).rejects.toThrow(/payable.*confirmed adjustment/i)
    expect(mocks.tx.vendor.updateMany).not.toHaveBeenCalled()
    expectNothingCommitted()
  })

  it.each(['-1', 'abc', '1e3', '12500.505', 'Infinity'])('refuses malformed payable %j before any read', async (amountPayable) => {
    await expect(updateVendorAction(edit({ amountPayable }))).rejects.toThrow(/Invalid amount payable/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNothingCommitted()
  })

  it('keeps the status when the field is absent', async () => {
    await updateVendorAction(edit())
    expect(mocks.tx.vendor.updateMany.mock.calls[0][0].data).not.toHaveProperty('isActive')
  })

  it('refuses a deactivation, which needs the confirmed remove action', async () => {
    await expect(updateVendorAction(edit({ isActive: 'false' }))).rejects.toThrow(/Remove Vendor/)
    expectNothingCommitted()
  })

  it('refuses an unknown status before any read', async () => {
    await expect(updateVendorAction(edit({ isActive: 'maybe' }))).rejects.toThrow(/Invalid vendor status/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('reactivates an inactive vendor explicitly and audits the status change', async () => {
    await updateVendorAction(form({ id: 'vendor_inactive', name: 'Gone', ...PROFILE, isActive: 'true' }))
    const [{ where, data }] = mocks.tx.vendor.updateMany.mock.calls[0]
    expect(where).toMatchObject({ id: 'vendor_inactive', isActive: false })
    expect(data).toMatchObject({ isActive: true })
    expect(committed[1][1]).toMatchObject({ before: { isActive: false }, after: { isActive: true } })
  })

  it.each(['vendor_foreign', 'vendor_deleted_site', 'vendor_foreign_site', 'vendor_missing'])('refuses %s', async (id) => {
    await expect(updateVendorAction(edit({ id }))).rejects.toThrow(/Vendor not found or access denied/)
    expectNothingCommitted()
  })

  it('rolls the profile edit back when the audit write fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit store down'))
    await expect(updateVendorAction(edit())).rejects.toThrow(/audit store down/)
    expect(mocks.tx.vendor.updateMany).toHaveBeenCalledTimes(1)
    expectNothingCommitted()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('rolls back when the guarded write matches no row', async () => {
    mocks.tx.vendor.updateMany.mockResolvedValue({ count: 0 })
    await expect(updateVendorAction(edit())).rejects.toThrow(/Vendor changed/)
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expectNothingCommitted()
  })
})

describe('adjustVendorPayableAction', () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))
  })

  it.each(['PURCHASE_MANAGER', 'PROJECT_MANAGER', 'SITE_ENGINEER', 'CLIENT'])('refuses live %s without payments.manage before any read', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(adjustVendorPayableAction(adjust())).rejects.toThrow(/payments\.manage/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNothingCommitted()
  })

  it('refuses when the MATERIALS module is disabled', async () => {
    mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['CLIENTS'], status: 'ACTIVE' })
    await expect(adjustVendorPayableAction(adjust())).rejects.toThrow(/Module MATERIALS is not enabled/)
    expectNothingCommitted()
  })

  it.each([['missing', ''], ['wrong', 'Sri Ram'], ['case-altered', 'sri ram traders']])('refuses a %s confirmation', async (_label, dangerConfirmText) => {
    await expect(adjustVendorPayableAction(adjust({ dangerConfirmText }))).rejects.toThrow(/confirmation text did not match the vendor name/)
    expectNothingCommitted()
  })

  it.each([['blank', '  '], ['over-long', 'x'.repeat(501)]])('refuses a %s reason before any read', async (_label, reason) => {
    await expect(adjustVendorPayableAction(adjust({ reason }))).rejects.toThrow(/reason/i)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it.each(['', '-1', 'abc', '1e3', '14000.001', 'Infinity', '1000000000000'])('refuses new payable %j before any read', async (amount) => {
    await expect(adjustVendorPayableAction(adjust({ amount }))).rejects.toThrow(/Invalid amount payable/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it.each(['', 'abc', '-5'])('refuses seen payable %j before any read', async (expectedAmount) => {
    await expect(adjustVendorPayableAction(adjust({ expectedAmount }))).rejects.toThrow(/Invalid current amount payable/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('refuses a no-op adjustment', async () => {
    await expect(adjustVendorPayableAction(adjust({ amount: '12500.5' }))).rejects.toThrow(/unchanged/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('refuses when the balance changed since the caller saw it', async () => {
    await expect(adjustVendorPayableAction(adjust({ expectedAmount: '12000' }))).rejects.toThrow(/payable changed/)
    expectNothingCommitted()
  })

  it.each([
    ['another tenant', 'vendor_foreign', 'Rival'],
    ['a vendor on a soft-deleted site', 'vendor_deleted_site', 'Old'],
    ["a vendor on another tenant's site", 'vendor_foreign_site', 'Crossed'],
    ['an inactive vendor', 'vendor_inactive', 'Gone'],
  ])('refuses %s', async (_label, id, name) => {
    await expect(adjustVendorPayableAction(adjust({ id, dangerConfirmText: name, expectedAmount: '300' }))).rejects.toThrow(/Vendor not found or access denied/)
    expectNothingCommitted()
  })

  it('rolls the adjustment back when the audit write fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit store down'))
    await expect(adjustVendorPayableAction(adjust())).rejects.toThrow(/audit store down/)
    expect(mocks.tx.vendor.updateMany).toHaveBeenCalledTimes(1)
    expectNothingCommitted()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('rolls back when the guarded write matches no row (balance raced)', async () => {
    mocks.tx.vendor.updateMany.mockResolvedValue({ count: 0 })
    await expect(adjustVendorPayableAction(adjust())).rejects.toThrow(/payable changed/)
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expectNothingCommitted()
  })

  it('sets exactly the bound balance and records before/after, the delta and the reason', async () => {
    await expect(adjustVendorPayableAction(adjust())).resolves.toBeUndefined()

    expect(mocks.tx.vendor.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'vendor_1', companyId: 'company_1', isActive: true, amountPayable: 12500.5,
        OR: [{ siteId: null }, { site: { companyId: 'company_1', deletedAt: null } }],
      },
      data: { amountPayable: 14000 },
    })
    expect(committed.map(([name]) => name)).toEqual(['vendor.updateMany', 'auditLog.create'])
    expect(committed[1][1]).toEqual({
      userId: 'user_accountant',
      companyId: 'company_1',
      action: 'ADJUST',
      module: 'VENDOR',
      recordId: 'vendor_1',
      before: { name: 'Sri Ram Traders', siteId: null, isActive: true, amountPayable: 12500.5 },
      after: {
        name: 'Sri Ram Traders',
        siteId: null,
        isActive: true,
        amountPayable: 14000,
        adjustment: 1499.5,
        reason: 'Invoice 771 booked late',
        _description: 'ACCOUNTANT adjusted payable to vendor "Sri Ram Traders" from ₹12,500.5 to ₹14,000: Invoice 771 booked late',
      },
    })
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/vendors')
  })

  it('adjusts a vendor bound to a live site of the company', async () => {
    await adjustVendorPayableAction(adjust({ id: 'vendor_site', dangerConfirmText: 'Site Vendor', expectedAmount: '0', amount: '250.25' }))
    expect(committed[1][1]).toMatchObject({ recordId: 'vendor_site', before: { amountPayable: 0 }, after: { amountPayable: 250.25, adjustment: 250.25 } })
  })
})
