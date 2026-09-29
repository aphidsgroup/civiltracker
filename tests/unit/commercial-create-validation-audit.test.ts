import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'

/**
 * Regression for the client, purchase-order, BOQ and material creation actions
 * (`src/actions/{clients,purchase,boq,materials}.ts`) writing loosely checked input with
 * no audit trail.
 *
 * Amounts went through `Number(text)`, so exponent forms (`1e5`), hex (`0x10`),
 * sub-paisa or sub-gram fractions and values beyond the `Decimal` columns reached the
 * database; BOQ totals were multiplied in floating point. Every other form key was
 * silently ignored, text was unbounded and unnormalized, the site was bound on the root
 * client outside the write, and nothing wrote an audit record.
 *
 * Now each action runs the live gate, then parses an allowlisted form strictly (text
 * bounded and NFC-normalized, amounts as exact decimal text within their column
 * precision, BOQ totals derived server-side in `Decimal`), all before any business read.
 * The site and vendor bindings (exact live company, principal's assigned scope), the
 * create and its immutable audit record share one transaction: an audit failure leaves
 * nothing behind.
 *
 * The transaction mock stages every write issued on `tx` and commits it only when the
 * callback resolves. `@/lib/permissions`, `@/lib/auth/require-module`,
 * `@/lib/auth/site-mutation`, `@/lib/validation/commercial-records` and `@/lib/audit-data`
 * are real.
 */
const mocks = vi.hoisted(() => {
  const delegates = () => ({
    site: { findFirst: vi.fn() },
    vendor: { findFirst: vi.fn() },
    client: { create: vi.fn() },
    purchaseOrder: { create: vi.fn() },
    bOQItem: { create: vi.fn() },
    material: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  })
  return {
    requireUser: vi.fn(),
    redirect: vi.fn(),
    logActivity: vi.fn(),
    tx: delegates(),
    prisma: {
      ...delegates(),
      company: { findUnique: vi.fn() },
      companyMember: { findFirst: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))

const { createClientAction } = await import('@/actions/clients')
const { createPurchaseOrderAction } = await import('@/actions/purchase')
const { createBoqItemAction } = await import('@/actions/boq')
const { createMaterialAction } = await import('@/actions/materials')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', deletedAt: null, name: 'Tower A' },
  { id: 'site_2', companyId: 'company_1', deletedAt: null, name: 'Tower B', engineerId: 'user_site_engineer' },
  { id: 'site_deleted', companyId: 'company_1', deletedAt: new Date('2026-01-01'), name: 'Old' },
  { id: 'site_foreign', companyId: 'company_2', deletedAt: null, name: 'Rival' },
]

const siteOf: RelationResolver = (row, key) => {
  if (key !== 'site') return undefined
  return SITES.find((site) => site.id === row.siteId) ?? null
}

const VENDORS: Row[] = [
  { id: 'vendor_1', companyId: 'company_1', siteId: null, isActive: true, name: 'Sri Ram Traders' },
  { id: 'vendor_site', companyId: 'company_1', siteId: 'site_1', isActive: true, name: 'Site Vendor' },
  { id: 'vendor_inactive', companyId: 'company_1', siteId: null, isActive: false, name: 'Gone' },
  { id: 'vendor_deleted_site', companyId: 'company_1', siteId: 'site_deleted', isActive: true, name: 'Old' },
  { id: 'vendor_cross_site', companyId: 'company_1', siteId: 'site_foreign', isActive: true, name: 'Crossed' },
  { id: 'vendor_foreign', companyId: 'company_2', siteId: null, isActive: true, name: 'Rival' },
]

const MEMBERS: Row[] = [
  { userId: 'user_site_engineer', companyId: 'company_1', isActive: true, siteIds: [] },
]

let committed: Array<[string, Row]>
let staged: Array<[string, Row]>

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

/** A written row with every `Decimal` rendered as its exact decimal text. */
function plain(row: Row): Row {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Prisma.Decimal.isDecimal(value) ? `D:${value.toString()}` : value]))
}

function stage(name: string, id: string) {
  return async (args: { data: Row }) => {
    staged.push([name, args.data])
    return { id, ...args.data }
  }
}

const CLIENT_FORM = { name: 'John Doe', phone: '', email: '', siteId: '', contractValue: '100000' }
const PO_FORM = { poNumber: 'PO-2026-1001', totalAmount: '5000', vendorId: 'vendor_1', notes: '' }
const BOQ_FORM = { siteId: 'site_1', description: 'Earthwork', category: 'Civil', unit: 'Cum', quantity: '10', rate: '100', gstPercent: '18' }
const MATERIAL_FORM = { siteId: 'site_1', name: 'OPC Cement', brand: '', unit: 'Bags', openingStock: '10', minStock: '2' }

type Family = {
  family: string
  role: string
  valid: Record<string, string>
  run: (data: unknown) => Promise<unknown>
  write: () => ReturnType<typeof vi.fn>
}

const FAMILIES: Family[] = [
  { family: 'client', role: 'ACCOUNTANT', valid: CLIENT_FORM, run: (data) => createClientAction(data as FormData), write: () => mocks.tx.client.create },
  { family: 'purchase order', role: 'PURCHASE_MANAGER', valid: PO_FORM, run: (data) => createPurchaseOrderAction(data as FormData), write: () => mocks.tx.purchaseOrder.create },
  { family: 'BOQ item', role: 'PROJECT_MANAGER', valid: BOQ_FORM, run: (data) => createBoqItemAction(data as FormData), write: () => mocks.tx.bOQItem.create },
  { family: 'material', role: 'PROJECT_MANAGER', valid: MATERIAL_FORM, run: (data) => createMaterialAction(data as FormData), write: () => mocks.tx.material.create },
]

const byFamily = (name: string) => FAMILIES.find((entry) => entry.family === name)!

beforeEach(() => {
  vi.clearAllMocks()
  committed = []
  staged = []
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['CLIENTS', 'MATERIALS', 'BOQ'], status: 'ACTIVE' })
  mocks.prisma.companyMember.findFirst.mockImplementation(inMemoryDelegate(MEMBERS).findFirst)

  const sites = inMemoryDelegate(SITES)
  const vendors = inMemoryDelegate(VENDORS, siteOf)
  for (const client of [mocks.prisma, mocks.tx]) {
    client.site.findFirst.mockImplementation(sites.findFirst)
    client.vendor.findFirst.mockImplementation(vendors.findFirst)
  }
  mocks.tx.client.create.mockImplementation(stage('client.create', 'client_new'))
  mocks.tx.purchaseOrder.create.mockImplementation(stage('purchaseOrder.create', 'po_new'))
  mocks.tx.bOQItem.create.mockImplementation(stage('bOQItem.create', 'boq_new'))
  mocks.tx.material.create.mockImplementation(stage('material.create', 'material_new'))
  mocks.tx.auditLog.create.mockImplementation(stage('auditLog.create', 'audit_1'))
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => {
    staged = []
    const result = await fn(mocks.tx)
    committed.push(...staged)
    return result
  })
})

function expectNothingCommitted() {
  expect(committed).toEqual([])
  for (const write of [
    mocks.prisma.client.create, mocks.prisma.purchaseOrder.create, mocks.prisma.bOQItem.create,
    mocks.prisma.material.create, mocks.prisma.auditLog.create,
  ]) expect(write).not.toHaveBeenCalled()
  expect(mocks.logActivity).not.toHaveBeenCalled()
  expect(mocks.redirect).not.toHaveBeenCalled()
}

function expectNoBusinessRead() {
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  for (const read of [mocks.prisma.site.findFirst, mocks.tx.site.findFirst, mocks.prisma.vendor.findFirst, mocks.tx.vendor.findFirst]) {
    expect(read).not.toHaveBeenCalled()
  }
}

describe('malformed financial values are refused before any read', () => {
  const MALFORMED_DECIMALS = ['-1', '-0', '+5', '1e3', '1E3', '0x10', 'NaN', 'Infinity', '-Infinity', 'abc', '1,000', '.5', '5.', '1 000', '١٢']

  const CASES: Array<[string, string, string[], RegExp]> = [
    ['client', 'contractValue', [...MALFORMED_DECIMALS, '10.005', '1000000000000', '9999999999999.99'], /Invalid contract value/],
    ['purchase order', 'totalAmount', [...MALFORMED_DECIMALS, '', '   ', '0', '0.00', '10.005', '1000000000000'], /Invalid total amount/],
    ['BOQ item', 'quantity', [...MALFORMED_DECIMALS, '', '0', '0.000', '1.0001', '100000000000'], /Invalid quantity/],
    ['BOQ item', 'rate', [...MALFORMED_DECIMALS, '', '0', '0.00', '1.001', '1000000000000'], /Invalid rate/],
    ['BOQ item', 'gstPercent', [...MALFORMED_DECIMALS, '100.01', '101', '18.001', '1000'], /Invalid GST percent/],
    ['material', 'openingStock', [...MALFORMED_DECIMALS, '1.0001', '100000000000'], /Invalid opening stock/],
    ['material', 'minStock', [...MALFORMED_DECIMALS, '1.0001', '100000000000'], /Invalid minimum stock/],
  ]

  const rows = CASES.flatMap(([family, field, values, error]) => values.map((value) => [family, field, value, error] as const))

  it.each(rows)('%s refuses %s %j', async (familyName, field, value, error) => {
    const family = byFamily(familyName)
    mocks.requireUser.mockResolvedValue(principal(family.role))
    await expect(family.run(form({ ...family.valid, [field]: value }))).rejects.toThrow(error)
    expectNoBusinessRead()
    expectNothingCommitted()
  })

  it('refuses a BOQ line whose derived amount overflows Decimal(14, 2)', async () => {
    await expect(createBoqItemAction(form({ ...BOQ_FORM, quantity: '99999999999.999', rate: '999999999999.99' }))).rejects.toThrow(/Invalid BOQ amount/)
    expectNoBusinessRead()
    expectNothingCommitted()
  })

  it('refuses a BOQ line whose total with GST overflows Decimal(14, 2)', async () => {
    await expect(createBoqItemAction(form({ ...BOQ_FORM, quantity: '1', rate: '999999999999.99', gstPercent: '18' }))).rejects.toThrow(/Invalid BOQ amount/)
    expectNoBusinessRead()
    expectNothingCommitted()
  })

  it('refuses a BOQ line whose derived amount rounds to zero', async () => {
    await expect(createBoqItemAction(form({ ...BOQ_FORM, quantity: '0.001', rate: '0.01' }))).rejects.toThrow(/Invalid BOQ amount/)
    expectNoBusinessRead()
    expectNothingCommitted()
  })
})

describe('the form is an allowlist', () => {
  const SERVER_OWNED: Array<[string, string[]]> = [
    ['client', ['companyId', 'amountPaid', 'amountDue', 'portalToken', 'id']],
    ['purchase order', ['companyId', 'status', 'createdById', 'siteId', 'items']],
    ['BOQ item', ['companyId', 'amount', 'totalWithGst', 'clientApproved', 'version']],
    ['material', ['companyId', 'currentStock', 'unitCost', 'isActive', 'totalCost']],
  ]
  const rows = SERVER_OWNED.flatMap(([family, keys]) => keys.map((key) => [family, key] as const))

  it.each(rows)('%s refuses a caller-supplied %s', async (familyName, key) => {
    const family = byFamily(familyName)
    await expect(family.run(form({ ...family.valid, [key]: '1' }))).rejects.toThrow(new RegExp(`${key} is not an accepted field`))
    expectNoBusinessRead()
    expectNothingCommitted()
  })

  it.each(FAMILIES)('$family refuses a repeated field', async (family) => {
    const data = form(family.valid)
    const [first] = Object.keys(family.valid)
    data.append(first, family.valid[first])
    await expect(family.run(data)).rejects.toThrow(/must be a single value/)
    expectNoBusinessRead()
    expectNothingCommitted()
  })

  it.each(FAMILIES)('$family refuses a file value', async (family) => {
    const data = form(family.valid)
    const [first] = Object.keys(family.valid)
    data.set(first, new File(['x'], 'x.txt'))
    await expect(family.run(data)).rejects.toThrow(/must be text/)
    expectNoBusinessRead()
    expectNothingCommitted()
  })

  it.each(FAMILIES)('$family refuses a non-form payload posted directly', async (family) => {
    for (const payload of [family.valid, null, undefined, 'x', [family.valid]]) {
      await expect(family.run(payload)).rejects.toThrow(/payload must be a form/)
    }
    expectNoBusinessRead()
    expectNothingCommitted()
  })

  it.each(FAMILIES)('$family ignores the framework-owned $ACTION_ fields', async (family) => {
    mocks.requireUser.mockResolvedValue(principal(family.role))
    await family.run(form({ ...family.valid, '$ACTION_ID_0123456789abcdef': '', '$ACTION_KEY': 'k1' }))
    expect(family.write()).toHaveBeenCalledTimes(1)
  })
})

describe('text is bounded and normalized', () => {
  const CASES: Array<[string, Record<string, string>, RegExp]> = [
    ['client', { name: '   ' }, /Client name is required/],
    ['client', { name: 'x'.repeat(121) }, /Client name must be at most 120 characters/],
    ['client', { name: 'John\u0000Doe' }, /Client name contains invalid characters/],
    ['client', { name: 'John‮Doe' }, /Client name contains invalid characters/],
    ['client', { name: '---' }, /Client name must contain letters or digits/],
    ['client', { email: 'not-an-email' }, /Invalid email/],
    ['client', { email: `${'a'.repeat(250)}@x.io` }, /Invalid email/],
    ['client', { phone: '12ab34' }, /Invalid phone/],
    ['client', { phone: '123' }, /Invalid phone/],
    ['client', { portalAccess: 'yes' }, /Invalid portal access/],
    ['client', { siteId: 'site 1' }, /Invalid site/],
    ['client', { siteId: 's'.repeat(65) }, /Invalid site/],
    ['purchase order', { poNumber: '' }, /PO number is required/],
    ['purchase order', { poNumber: 'P'.repeat(51) }, /PO number must be at most 50 characters/],
    ['purchase order', { poNumber: 'PO\u0007-1' }, /PO number contains invalid characters/],
    ['purchase order', { notes: 'n'.repeat(2001) }, /Notes must be at most 2000 characters/],
    ['purchase order', { notes: 'ok\u0000' }, /Notes contains invalid characters/],
    ['purchase order', { vendorId: 'vendor;drop' }, /Invalid vendor/],
    ['BOQ item', { description: '  ' }, /Description is required/],
    ['BOQ item', { description: 'd'.repeat(2001) }, /Description must be at most 2000 characters/],
    ['BOQ item', { unit: '' }, /Unit is required/],
    ['BOQ item', { unit: 'u'.repeat(21) }, /Unit must be at most 20 characters/],
    ['BOQ item', { category: 'c'.repeat(61) }, /Category must be at most 60 characters/],
    ['BOQ item', { siteId: '' }, /Invalid site/],
    ['material', { name: '' }, /Material name is required/],
    ['material', { name: 'm'.repeat(121) }, /Material name must be at most 120 characters/],
    ['material', { brand: 'b'.repeat(121) }, /Brand must be at most 120 characters/],
    ['material', { unit: 'Barrels' }, /Invalid unit/],
    ['material', { unit: 'bags' }, /Invalid unit/],
    ['material', { siteId: '../site_1' }, /Invalid site/],
  ]

  it.each(CASES)('%s refuses %j', async (familyName, overrides, error) => {
    const family = byFamily(familyName)
    await expect(family.run(form({ ...family.valid, ...overrides }))).rejects.toThrow(error)
    expectNoBusinessRead()
    expectNothingCommitted()
  })
})

describe('every submitted id binds to the live tenant inside the transaction', () => {
  it.each(['site_foreign', 'site_deleted', 'site_missing'])('client refuses site %s', async (siteId) => {
    await expect(createClientAction(form({ ...CLIENT_FORM, siteId }))).rejects.toThrow(/Site not found or access denied/)
    expect(mocks.tx.client.create).not.toHaveBeenCalled()
    expectNothingCommitted()
  })

  it.each(['vendor_foreign', 'vendor_inactive', 'vendor_deleted_site', 'vendor_cross_site', 'vendor_missing'])(
    'purchase order refuses vendor %s',
    async (vendorId) => {
      await expect(createPurchaseOrderAction(form({ ...PO_FORM, vendorId }))).rejects.toThrow(/Vendor not found or access denied/)
      expect(mocks.tx.purchaseOrder.create).not.toHaveBeenCalled()
      expectNothingCommitted()
    },
  )

  it.each(['site_foreign', 'site_deleted', 'site_missing'])('BOQ item refuses site %s', async (siteId) => {
    await expect(createBoqItemAction(form({ ...BOQ_FORM, siteId }))).rejects.toThrow(/Site not found or access denied/)
    expect(mocks.tx.bOQItem.create).not.toHaveBeenCalled()
    expectNothingCommitted()
  })

  it.each(['site_foreign', 'site_deleted', 'site_missing'])('material refuses site %s', async (siteId) => {
    await expect(createMaterialAction(form({ ...MATERIAL_FORM, siteId }))).rejects.toThrow(/Site not found or access denied/)
    expect(mocks.tx.material.create).not.toHaveBeenCalled()
    expectNothingCommitted()
  })

  it('a field role creates material only on a site it is assigned to', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    await expect(createMaterialAction(form(MATERIAL_FORM))).rejects.toThrow(/Site not found or access denied/)
    expectNothingCommitted()

    await createMaterialAction(form({ ...MATERIAL_FORM, siteId: 'site_2' }))
    expect(committed[0][1]).toMatchObject({ companyId: 'company_1', siteId: 'site_2' })
  })

  it('binds sites and vendors on the transaction client, never the root client', async () => {
    await createClientAction(form({ ...CLIENT_FORM, siteId: 'site_1' }))
    await createPurchaseOrderAction(form(PO_FORM))
    await createBoqItemAction(form(BOQ_FORM))
    await createMaterialAction(form(MATERIAL_FORM))
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.vendor.findFirst).not.toHaveBeenCalled()
    expect(mocks.tx.site.findFirst).toHaveBeenCalledTimes(3)
    for (const [args] of mocks.tx.site.findFirst.mock.calls) expect(args.where).toMatchObject({ companyId: 'company_1', deletedAt: null })
    expect(mocks.tx.vendor.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'vendor_1', companyId: 'company_1', isActive: true })
  })
})

describe('creation and its required audit record are one transaction', () => {
  it.each(FAMILIES)('$family is rolled back when the audit write fails', async (family) => {
    mocks.requireUser.mockResolvedValue(principal(family.role))
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit store down'))
    await expect(family.run(form(family.valid))).rejects.toThrow(/audit store down/)
    expect(family.write()).toHaveBeenCalledTimes(1)
    expectNothingCommitted()
  })

  it.each(FAMILIES)('$family commits exactly the record and one audit row, then redirects', async (family) => {
    mocks.requireUser.mockResolvedValue(principal(family.role))
    await family.run(form(family.valid))
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(committed.map(([name]) => name)).toEqual([expect.stringMatching(/\.create$/), 'auditLog.create'])
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.redirect).toHaveBeenCalledTimes(1)
  })
})

describe('valid normalized inputs', () => {
  it('client: normalized text, exact contract value, server-owned counters and audit', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))
    await createClientAction(form({
      name: '  Jöhn \t  Doe ', phone: '+91 98765-43210', email: ' John@Example.COM ', siteId: ' site_1 ',
      contractValue: ' 2500000.50 ', portalAccess: 'on',
    }))

    expect(plain(committed[0][1])).toEqual({
      companyId: 'company_1', name: 'Jöhn Doe', phone: '+919876543210', email: 'john@example.com', siteId: 'site_1',
      contractValue: 'D:2500000.5', amountPaid: 'D:0', amountDue: 'D:0', portalAccess: true,
    })
    expect(committed[1][1]).toEqual({
      userId: 'user_accountant', companyId: 'company_1', action: 'CREATE', module: 'CLIENT', recordId: 'client_new', before: undefined,
      after: {
        clientId: 'client_new', name: 'Jöhn Doe', siteId: 'site_1', siteName: 'Tower A', contractValue: '2500000.50',
        amountPaid: '0.00', amountDue: '0.00', portalAccess: true, hasPhone: true, hasEmail: true,
        _description: 'ACCOUNTANT added client Jöhn Doe (contract ₹2500000.50)',
      },
    })
    expect(mocks.redirect).toHaveBeenCalledWith('/clients')
  })

  it('client: blanks stay company-wide with a zero contract value and no portal access', async () => {
    await createClientAction(form({ name: 'Acme', phone: '', email: '', siteId: '', contractValue: '' }))
    expect(mocks.tx.site.findFirst).not.toHaveBeenCalled()
    expect(plain(committed[0][1])).toMatchObject({ siteId: null, phone: null, email: null, contractValue: 'D:0', portalAccess: false })
    expect(committed[1][1]).toMatchObject({ after: { siteId: null, siteName: null, contractValue: '0.00', hasPhone: false, hasEmail: false } })
  })

  it('purchase order: exact total, server-owned status and creator, bound vendor in the audit', async () => {
    mocks.requireUser.mockResolvedValue(principal('PURCHASE_MANAGER'))
    await createPurchaseOrderAction(form({ poNumber: '  PO-2026-1001 ', totalAmount: '5000.5', vendorId: 'vendor_site', notes: ' Deliver\r\nby Friday ' }))

    expect(plain(committed[0][1])).toEqual({
      companyId: 'company_1', vendorId: 'vendor_site', poNumber: 'PO-2026-1001', totalAmount: 'D:5000.5',
      notes: 'Deliver\nby Friday', status: 'DRAFT', createdById: 'user_purchase_manager',
    })
    expect(committed[1][1]).toEqual({
      userId: 'user_purchase_manager', companyId: 'company_1', action: 'CREATE', module: 'PURCHASE_ORDER', recordId: 'po_new', before: undefined,
      after: {
        purchaseOrderId: 'po_new', poNumber: 'PO-2026-1001', vendorId: 'vendor_site', vendorName: 'Site Vendor',
        totalAmount: '5000.50', status: 'DRAFT', hasNotes: true,
        _description: 'PURCHASE_MANAGER drafted purchase order PO-2026-1001 for ₹5000.50',
      },
    })
    expect(mocks.redirect).toHaveBeenCalledWith('/purchase')
  })

  it('purchase order: no vendor stays unbound without a vendor read', async () => {
    await createPurchaseOrderAction(form({ ...PO_FORM, vendorId: '' }))
    expect(mocks.tx.vendor.findFirst).not.toHaveBeenCalled()
    expect(committed[0][1]).toMatchObject({ vendorId: null, notes: null })
    expect(committed[1][1]).toMatchObject({ after: { vendorId: null, vendorName: null, hasNotes: false } })
  })

  it('BOQ item: totals derived server-side in Decimal and rounded half-up to paise', async () => {
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER'))
    await createBoqItemAction(form({
      siteId: 'site_1', description: ' Earthwork in\r\nexcavation ', category: ' Civil ', unit: ' Cum ', quantity: '12.345', rate: '678.90', gstPercent: '18',
    }))

    // 12.345 × 678.90 = 8381.0205 → 8381.02; × 1.18 = 9889.6036 → 9889.60
    expect(plain(committed[0][1])).toEqual({
      companyId: 'company_1', siteId: 'site_1', category: 'Civil', description: 'Earthwork in\nexcavation', unit: 'Cum',
      quantity: 'D:12.345', rate: 'D:678.9', amount: 'D:8381.02', gstPercent: 18, totalWithGst: 'D:9889.6', clientApproved: false,
    })
    expect(committed[1][1]).toEqual({
      userId: 'user_project_manager', companyId: 'company_1', action: 'CREATE', module: 'BOQ', recordId: 'boq_new', before: undefined,
      after: {
        boqItemId: 'boq_new', siteId: 'site_1', siteName: 'Tower A', category: 'Civil', description: 'Earthwork in\nexcavation', unit: 'Cum',
        quantity: '12.345', rate: '678.90', amount: '8381.02', gstPercent: '18.00', totalWithGst: '9889.60', clientApproved: false,
        _description: 'PROJECT_MANAGER added BOQ item to Tower A: 12.345 Cum × ₹678.90 = ₹9889.60 incl. GST',
      },
    })
    expect(mocks.redirect).toHaveBeenCalledWith('/boq')
  })

  it('BOQ item: no floating-point residue, blank category and GST keep their defaults', async () => {
    await createBoqItemAction(form({ ...BOQ_FORM, quantity: '3', rate: '0.10', gstPercent: '', category: '' }))
    expect(plain(committed[0][1])).toMatchObject({ category: 'General', amount: 'D:0.3', gstPercent: 0, totalWithGst: 'D:0.3' })
  })

  it('BOQ item: accepts the largest line that fits', async () => {
    await createBoqItemAction(form({ ...BOQ_FORM, quantity: '1', rate: '999999999999.99', gstPercent: '0' }))
    expect(plain(committed[0][1])).toMatchObject({ amount: 'D:999999999999.99', totalWithGst: 'D:999999999999.99' })
  })

  it('material: normalized text, exact stock quantities, current stock from opening stock', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    await createMaterialAction(form({ siteId: 'site_2', name: ' OPC  Cement 43 ', brand: ' UltraTech ', unit: 'Bags', openingStock: '120.5', minStock: '' }))

    expect(plain(committed[0][1])).toEqual({
      companyId: 'company_1', siteId: 'site_2', name: 'OPC Cement 43', brand: 'UltraTech', unit: 'Bags',
      openingStock: 'D:120.5', currentStock: 'D:120.5', minStock: 'D:0', isActive: true,
    })
    expect(committed[1][1]).toEqual({
      userId: 'user_site_engineer', companyId: 'company_1', action: 'CREATE', module: 'MATERIAL', recordId: 'material_new', before: undefined,
      after: {
        materialId: 'material_new', siteId: 'site_2', siteName: 'Tower B', name: 'OPC Cement 43', brand: 'UltraTech', unit: 'Bags',
        openingStock: '120.500', currentStock: '120.500', minStock: '0.000',
        _description: 'SITE_ENGINEER added material OPC Cement 43 to Tower B with opening stock 120.500 Bags',
      },
    })
    expect(mocks.redirect).toHaveBeenCalledWith('/materials')
  })

  it('material: accepts the largest stock that fits Decimal(14, 3)', async () => {
    await createMaterialAction(form({ ...MATERIAL_FORM, openingStock: '99999999999.999', minStock: '0.001' }))
    expect(plain(committed[0][1])).toMatchObject({ openingStock: 'D:99999999999.999', currentStock: 'D:99999999999.999', minStock: 'D:0.001' })
  })
})

describe('the live gate still runs first', () => {
  it.each(FAMILIES)('$family refuses a principal without the permission before parsing', async (family) => {
    mocks.requireUser.mockResolvedValue(principal('CLIENT'))
    await expect(family.run(form({ ...family.valid, companyId: 'company_2' }))).rejects.toThrow(/FORBIDDEN/)
    expect(mocks.prisma.company.findUnique).not.toHaveBeenCalled()
    expectNoBusinessRead()
    expectNothingCommitted()
  })
})
