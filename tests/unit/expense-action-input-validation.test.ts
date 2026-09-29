import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression for `createExpenseAction` (src/actions/expense.ts) trusting its typed input.
 *
 * The action is a Server Action, so its TypeScript parameter type is not a boundary: a
 * direct POST could send a negative, zero, `NaN`-coerced or absurd amount, a category or
 * payment mode outside the enum, an `Invalid Date`, unbounded or non-string text, or any
 * extra key, and it reached the site read, the expense and approval writes, the audit
 * record and the bill-attachment linkage unchecked.
 *
 * Now the whole payload is parsed by the central expense schema right after the live
 * principal is resolved and before any module, site, media or transaction access.
 *
 * The transaction mock stages every write issued on `tx` and commits it only when the
 * callback resolves, so `committed` is what a real database would still hold.
 */
const mocks = vi.hoisted(() => {
  const committed: Array<{ model: string; data: Record<string, unknown> }> = []
  let staged: typeof committed = []

  const prisma = {
    $transaction: vi.fn(),
    company: { findUnique: vi.fn(async () => ({ modulesJson: ['EXPENSES', 'BILLS'], status: 'ACTIVE' })) },
    site: { findFirst: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    expense: { create: vi.fn() },
    billAttachment: { create: vi.fn() },
    approval: { create: vi.fn() },
    approvalTimeline: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  }

  const tx = {
    mediaAsset: { findFirst: vi.fn(), updateMany: vi.fn() },
    billAttachment: { findFirst: vi.fn() },
    expense: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const { billAttachments, ...fields } = data as { billAttachments?: { create: Record<string, unknown> } }
        const row = { id: 'expense_1', ...fields }
        staged.push({ model: 'expense', data: row })
        if (billAttachments) staged.push({ model: 'billAttachment', data: { expenseId: row.id, ...billAttachments.create } })
        return row
      }),
    },
    approval: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: 'approval_1', ...data }
        staged.push({ model: 'approval', data: row })
        return row
      }),
    },
    approvalTimeline: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: 'timeline_1', ...data }
        staged.push({ model: 'approvalTimeline', data: row })
        return row
      }),
    },
  }

  async function runTransaction(run: (client: typeof tx) => unknown) {
    staged = []
    try {
      const result = await run(tx)
      committed.push(...staged)
      return result
    } finally {
      staged = []
    }
  }

  return {
    requireUser: vi.fn(),
    hasPermission: vi.fn(),
    revalidatePath: vi.fn(),
    logActivity: vi.fn(),
    prisma,
    tx,
    committed,
    runTransaction,
  }
})

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/permissions', () => ({ hasPermission: mocks.hasPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { createExpenseAction } = await import('@/actions/expense')

const ADMIN = { id: 'admin_1', name: 'Admin', email: 'admin@acme.test', role: 'COMPANY_ADMIN', companyId: 'company_1' }

const INPUT = {
  siteId: 'site_1',
  amount: 1250,
  category: 'MATERIAL',
  paymentMode: 'CASH',
  paidTo: 'Supplier',
  notes: 'Cement bags',
}

type ActionInput = Parameters<typeof createExpenseAction>[0]

function call(input: unknown) {
  return createExpenseAction(input as ActionInput)
}

/** No module, site, media or transaction access, and nothing written or logged. */
function expectRefusedBeforeAnyRead() {
  expect(mocks.prisma.company.findUnique).not.toHaveBeenCalled()
  expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
  expect(mocks.tx.mediaAsset.findFirst).not.toHaveBeenCalled()
  expect(mocks.tx.billAttachment.findFirst).not.toHaveBeenCalled()
  expect(mocks.tx.mediaAsset.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  expect(mocks.tx.expense.create).not.toHaveBeenCalled()
  expect(mocks.tx.approval.create).not.toHaveBeenCalled()
  expect(mocks.tx.approvalTimeline.create).not.toHaveBeenCalled()
  expect(mocks.prisma.expense.create).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.create).not.toHaveBeenCalled()
  expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
  expect(mocks.committed).toEqual([])
  expect(mocks.logActivity).not.toHaveBeenCalled()
  expect(mocks.revalidatePath).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.committed.length = 0
  mocks.requireUser.mockResolvedValue(ADMIN)
  mocks.hasPermission.mockReturnValue(true)
  mocks.prisma.$transaction.mockImplementation(mocks.runTransaction)
  mocks.prisma.site.findFirst.mockResolvedValue({ id: 'site_1', companyId: 'company_1', name: 'Tower A' })
  mocks.tx.mediaAsset.findFirst.mockResolvedValue({
    cloudinaryPublicId: 'bills/inv7',
    secureUrl: 'https://res.cloudinary.test/bills/inv7.jpg',
    format: 'jpg',
    bytes: 2048,
    width: null,
    height: null,
    originalName: 'inv7.jpg',
  })
  mocks.tx.billAttachment.findFirst.mockResolvedValue(null)
  // The one-time claim and its owner binding each match the single unconsumed upload.
  mocks.tx.mediaAsset.updateMany.mockResolvedValue({ count: 1 })
})

describe('createExpenseAction refuses an invalid amount before any read or write', () => {
  it.each([
    ['a negative amount', -1],
    ['a zero amount', 0],
    ['a negative zero amount', -0],
    ['a NaN amount', NaN],
    ['an infinite amount', Infinity],
    ['an amount beyond the Decimal(14, 2) column', 1e12],
    ['an amount with sub-paisa precision', 10.005],
    ['a string amount', '1250'],
    ['a null amount', null],
    ['a missing amount', undefined],
  ])('refuses %s', async (_label, amount) => {
    await expect(call({ ...INPUT, amount })).rejects.toThrow(/Invalid expense: amount/)
    expectRefusedBeforeAnyRead()
  })

  it('refuses a negative amount even with an otherwise valid bill attachment', async () => {
    await expect(call({ ...INPUT, amount: -500, mediaAssetId: 'asset_inv7' })).rejects.toThrow(/Invalid expense: amount/)
    expectRefusedBeforeAnyRead()
  })
})

describe('createExpenseAction refuses values outside the allowed sets', () => {
  it.each([
    ['an unknown category', { category: 'BRIBES' }],
    ['a lower-case category', { category: 'material' }],
    ['a missing category', { category: undefined }],
    ['an unknown payment mode', { paymentMode: 'CRYPTO' }],
    ['a non-string payment mode', { paymentMode: 1 }],
  ])('refuses %s', async (_label, overrides) => {
    await expect(call({ ...INPUT, ...overrides })).rejects.toThrow(/Invalid expense: (category|paymentMode)/)
    expectRefusedBeforeAnyRead()
  })
})

describe('createExpenseAction refuses an invalid bill date', () => {
  it.each([
    ['an Invalid Date', new Date('not a date')],
    ['a date string', '2026-09-20'],
    ['a timestamp', 1767225600000],
    ['a year out of range', new Date('1800-01-01T00:00:00.000Z')],
    ['a far-future date', new Date('9999-01-01T00:00:00.000Z')],
  ])('refuses %s', async (_label, billDate) => {
    await expect(call({ ...INPUT, billDate })).rejects.toThrow(/Invalid expense: billDate/)
    expectRefusedBeforeAnyRead()
  })
})

describe('createExpenseAction refuses malformed text and unknown keys', () => {
  it.each([
    ['a blank site id', { siteId: '   ' }],
    ['a non-string site id', { siteId: { id: 'site_1' } }],
    ['an over-long site id', { siteId: 's'.repeat(65) }],
    ['an over-long payee', { paidTo: 'x'.repeat(201) }],
    ['an over-long bill number', { billNumber: 'x'.repeat(101) }],
    ['over-long notes', { notes: 'x'.repeat(2001) }],
    ['an over-long description', { description: 'x'.repeat(1001) }],
    ['a non-string payee', { paidTo: 42 }],
    ['non-string notes', { notes: ['a', 'b'] }],
    ['a smuggled company', { companyId: 'company_2' }],
    ['a smuggled approval status', { approvalStatus: 'APPROVED' }],
    ['a smuggled creator', { createdById: 'someone_else' }],
    ['a smuggled prototype key', JSON.parse('{"__proto__": {"x": 1}}')],
  ])('refuses %s', async (_label, overrides) => {
    await expect(call({ ...INPUT, ...overrides })).rejects.toThrow(/Invalid expense/)
    expectRefusedBeforeAnyRead()
  })

  it.each([
    ['a null payload', null],
    ['an array payload', [INPUT]],
    ['a string payload', 'expense'],
  ])('refuses %s', async (_label, input) => {
    await expect(call(input)).rejects.toThrow(/Invalid expense/)
    expectRefusedBeforeAnyRead()
  })
})

describe('createExpenseAction keeps strict optional media handling', () => {
  it.each([
    ['a blank id', ''],
    ['a non-string id', 7],
    ['an over-long id', 'a'.repeat(65)],
  ])('refuses %s before any read', async (_label, mediaAssetId) => {
    await expect(call({ ...INPUT, mediaAssetId })).rejects.toThrow(/Uploaded bill not found/)
    expectRefusedBeforeAnyRead()
  })

  it('refuses a client-supplied attachment field before any read', async () => {
    await expect(call({ ...INPUT, mediaAssetId: 'asset_inv7', secureUrl: 'https://evil.test/x.jpg' })).rejects.toThrow(/media asset id/)
    expectRefusedBeforeAnyRead()
  })
})

describe('createExpenseAction normalizes a valid payload', () => {
  it('trims text, drops blanks and writes the expense, approval and timeline together', async () => {
    await expect(call({
      siteId: ' site_1 ',
      amount: 1250.5,
      category: 'DIESEL',
      paymentMode: 'UPI',
      paidTo: '  Fuel Station  ',
      billNumber: '   ',
      notes: '  Generator diesel  ',
      billDate: new Date('2026-09-20T00:00:00.000Z'),
    })).resolves.toEqual({ success: true, expenseId: 'expense_1' })

    expect(mocks.prisma.site.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'site_1' })
    expect(mocks.committed.map((entry) => entry.model)).toEqual(['expense', 'approval', 'approvalTimeline'])
    const expense = mocks.committed[0].data
    expect(expense).toMatchObject({
      companyId: 'company_1',
      siteId: 'site_1',
      amount: 1250.5,
      category: 'DIESEL',
      paymentMode: 'UPI',
      paidTo: 'Fuel Station',
      notes: 'Generator diesel',
      description: 'Generator diesel',
      billDate: new Date('2026-09-20T00:00:00.000Z'),
      createdById: 'admin_1',
    })
    expect(expense.billNumber).toBeUndefined()
    expect(mocks.committed[1].data).toMatchObject({ amount: 1250.5, entityType: 'EXPENSE', entityId: 'expense_1' })
  })

  it('accepts the mobile upload-bill shape with blank optional text and an uploaded asset', async () => {
    await expect(call({
      siteId: 'site_1',
      amount: 999999999999.99,
      category: 'MATERIAL',
      paymentMode: 'CASH',
      paidTo: '',
      billNumber: 'INV-7',
      notes: '',
      mediaAssetId: ' asset_inv7 ',
    })).resolves.toEqual({ success: true, expenseId: 'expense_1' })

    expect(mocks.tx.mediaAsset.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'asset_inv7' })
    expect(mocks.tx.mediaAsset.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'asset_inv7', consumedAt: null })
    expect(mocks.committed.map((entry) => entry.model)).toEqual(['expense', 'billAttachment', 'approval', 'approvalTimeline'])
    expect(mocks.committed[0].data).toMatchObject({ billNumber: 'INV-7', description: 'Expense for MATERIAL' })
    expect(mocks.committed[0].data.paidTo).toBeUndefined()
    expect(mocks.committed[0].data.notes).toBeUndefined()
    expect(mocks.committed[2].data).toMatchObject({ entityType: 'BILL', priority: 'HIGH' })
  })
})
