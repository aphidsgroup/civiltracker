import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Row } from './support/prisma-where'
import { isClaim, mediaAssetTable } from './support/media-asset-table'
import type { Journal, MediaAssetUpdate } from './support/media-asset-table'

/**
 * Regression for `POST /api/expenses` parsing its body with a permissive local schema.
 *
 * The route accepted any string as category or payment mode (cast straight into the
 * Prisma enum), any positive float as amount, any string as bill date (`new Date('x')`
 * wrote an Invalid Date), unbounded text, silently dropped unknown keys, and threw a 500
 * on a malformed JSON body. It now parses with the canonical expense policy
 * (`parseExpenseApiInput` → `parseExpenseActionInput`) before any site, media or
 * transaction access, and a bill is attached only from the caller's own MediaAsset.
 *
 * The transaction mock stages every write issued on `tx` and commits it only when the
 * callback resolves, so `committed` is what a real database would still hold. The upload
 * is claimed once by a guarded `updateMany` on the MediaAsset row; the table here honours
 * that guard (`{ count: 1 }` unclaimed, `{ count: 0 }` consumed) and each transaction
 * journals its own claim, so a failed or losing transaction rolls back only itself.
 */
const mocks = vi.hoisted(() => {
  type Data = Record<string, unknown>
  const committed: Array<{ model: string; data: Data }> = []

  const prisma = {
    $transaction: vi.fn(),
    site: { findFirst: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    mediaAsset: { findFirst: vi.fn() },
    expense: { create: vi.fn() },
    approval: { create: vi.fn() },
    approvalTimeline: { create: vi.fn() },
  }

  // Shared spies for assertions; `runTransaction` wraps them per transaction.
  const tx = {
    mediaAsset: { findFirst: vi.fn(), updateMany: vi.fn() },
    billAttachment: { findFirst: vi.fn() },
    expense: { create: vi.fn(async ({ data }: { data: Data }) => ({ id: 'expense_1', ...data })) },
    approval: { create: vi.fn(async ({ data }: { data: Data }) => ({ id: 'approval_1', ...data })) },
    approvalTimeline: { create: vi.fn(async ({ data }: { data: Data }) => ({ id: 'timeline_1', ...data })) },
  }

  // Each transaction stages its own writes and journals its own claim writes: a callback
  // that throws commits nothing and undoes only its own claim, never a concurrent one's.
  async function runTransaction(run: (client: unknown) => unknown) {
    const staged: typeof committed = []
    const journal: Array<() => void> = []
    const client = {
      ...tx,
      mediaAsset: { ...tx.mediaAsset, updateMany: (args: unknown) => tx.mediaAsset.updateMany(args, journal) },
      expense: {
        create: async (args: { data: Data }) => {
          const { billAttachments, ...row } = (await tx.expense.create(args)) as Data & { billAttachments?: { create: Data } }
          staged.push({ model: 'expense', data: row })
          if (billAttachments) staged.push({ model: 'billAttachment', data: { expenseId: row.id, ...billAttachments.create } })
          return row
        },
      },
      approval: {
        create: async (args: { data: Data }) => {
          const row = await tx.approval.create(args)
          staged.push({ model: 'approval', data: row })
          return row
        },
      },
      approvalTimeline: {
        create: async (args: { data: Data }) => {
          const row = await tx.approvalTimeline.create(args)
          staged.push({ model: 'approvalTimeline', data: row })
          return row
        },
      },
    }
    try {
      const result = await run(client)
      committed.push(...staged)
      return result
    } catch (error) {
      for (const undo of journal.reverse()) undo()
      throw error
    }
  }

  return {
    requireUser: vi.fn(),
    requireModuleEnabled: vi.fn(),
    hasPermission: vi.fn(),
    revalidatePath: vi.fn(),
    prisma,
    tx,
    committed,
    runTransaction,
  }
})

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/auth/require-module', () => ({ requireModuleEnabled: mocks.requireModuleEnabled }))
vi.mock('@/lib/permissions', () => ({ hasPermission: mocks.hasPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { POST: createExpense } = await import('@/app/api/expenses/route')

const SITE_ENGINEER = {
  id: 'engineer_1',
  name: 'Engineer',
  email: 'engineer@acme.test',
  role: 'SITE_ENGINEER',
  companyId: 'company_1',
}

const VALID_BODY = {
  siteId: 'site_1',
  category: 'MATERIAL',
  description: 'Cement bags',
  amount: 1250.5,
  paymentMode: 'UPI',
}

const MEDIA_ASSET = {
  cloudinaryPublicId: 'civiltracker/company_1/bills/abc',
  secureUrl: 'https://res.cloudinary.com/demo/image/upload/abc.jpg',
  format: 'jpg',
  bytes: 2048,
  width: 800,
  height: 600,
  originalName: 'bill.jpg',
}

// The engineer's own BILL upload for site_1, and one an earlier bill already claimed.
const ASSET_ROWS: Row[] = [
  { id: 'asset_1', companyId: 'company_1', siteId: 'site_1', module: 'BILL', uploadedById: 'engineer_1', ...MEDIA_ASSET },
  {
    id: 'asset_claimed',
    companyId: 'company_1',
    siteId: 'site_1',
    module: 'BILL',
    uploadedById: 'engineer_1',
    ...MEDIA_ASSET,
    cloudinaryPublicId: 'civiltracker/company_1/bills/claimed',
    consumedAt: new Date('2026-09-01'),
    consumedBy: 'EXPENSE_BILL',
    consumedRecordId: 'expense_0',
  },
]

let assets: ReturnType<typeof mediaAssetTable>

function asset(id: string) {
  return assets.rows.find((row) => row.id === id)!
}

function claimCalls() {
  return mocks.tx.mediaAsset.updateMany.mock.calls.map(([args]) => args as MediaAssetUpdate).filter(isClaim)
}

function postRaw(raw: string) {
  return new Request('http://localhost/api/expenses', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw,
  })
}

function postRequest(body: unknown) {
  return postRaw(JSON.stringify(body))
}

function grantOnly(...permissions: string[]) {
  mocks.hasPermission.mockImplementation((_role: string, permission: string) => permissions.includes(permission))
}

/** A refused body touches nothing: no site, media or membership read and no write. */
function expectNoReadsOrWrites() {
  expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.mediaAsset.findFirst).not.toHaveBeenCalled()
  expectNoWrites()
}

function expectNoWrites() {
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  expect(mocks.tx.expense.create).not.toHaveBeenCalled()
  expect(mocks.tx.approval.create).not.toHaveBeenCalled()
  expect(mocks.tx.approvalTimeline.create).not.toHaveBeenCalled()
  expect(mocks.prisma.expense.create).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.create).not.toHaveBeenCalled()
  expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
  expect(mocks.committed).toEqual([])
}

async function expectBadRequest(response: Response) {
  expect(response.status).toBe(400)
  const body = await response.json()
  expect(typeof body.error).toBe('string')
  expect(body.error).toMatch(/^Invalid expense/)
  expectNoReadsOrWrites()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.committed.length = 0
  mocks.requireUser.mockResolvedValue(SITE_ENGINEER)
  mocks.requireModuleEnabled.mockResolvedValue(undefined)
  grantOnly('expenses.create', 'bills.upload')
  mocks.prisma.$transaction.mockImplementation(mocks.runTransaction)
  mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: ['site_1'] })
  // A live company_1 site, reachable only when the engineer's assignment covers it.
  mocks.prisma.site.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => {
    const { id, deletedAt, companyId, OR } = args.where as {
      id: string
      deletedAt: unknown
      companyId: string
      OR?: Array<{ id?: { in: string[] } }>
    }
    const assigned = !OR || OR.some((clause) => clause.id?.in.includes(id))
    return id === 'site_1' && deletedAt === null && companyId === 'company_1' && assigned
      ? { id: 'site_1', companyId: 'company_1', name: 'Tower A' }
      : null
  })
  assets = mediaAssetTable(ASSET_ROWS)
  // Found only by id, company, site, BILL module and uploader together.
  mocks.tx.mediaAsset.findFirst.mockImplementation(assets.findFirst)
  mocks.tx.mediaAsset.updateMany.mockImplementation((args: MediaAssetUpdate, journal?: Journal) => assets.updateMany(args, journal))
  mocks.tx.billAttachment.findFirst.mockResolvedValue(null)
})

describe('POST /api/expenses refuses a malformed body with a safe 400', () => {
  it.each([
    ['truncated JSON', '{"siteId": "site_1",'],
    ['non-JSON text', 'amount=5'],
    ['empty body', ''],
  ])('refuses %s', async (_label, raw) => {
    await expectBadRequest(await createExpense(postRaw(raw)))
  })

  it.each([
    ['null', null],
    ['an array', [VALID_BODY]],
    ['a string', 'MATERIAL'],
    ['a number', 42],
  ])('refuses a JSON body that is %s', async (_label, body) => {
    await expectBadRequest(await createExpense(postRequest(body)))
  })

  it('does not echo parser internals for malformed JSON', async () => {
    const response = await createExpense(postRaw('{"siteId": '))
    await expect(response.json()).resolves.toEqual({ error: 'Invalid expense: body must be valid JSON' })
  })
})

describe('POST /api/expenses allows only expense fields', () => {
  it.each([
    ['companyId', 'company_2'],
    ['approvalStatus', 'APPROVED'],
    ['createdById', 'someone_else'],
    ['approvedById', 'engineer_1'],
    ['subcategory', 'x'],
    ['deletedAt', null],
  ])('refuses the unknown key %s deterministically', async (key, value) => {
    const response = await createExpense(postRequest({ ...VALID_BODY, [key]: value }))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: `Invalid expense: ${key} is not an expense field` })
    expectNoReadsOrWrites()
  })

  it('refuses an own __proto__ key', async () => {
    await expectBadRequest(await createExpense(postRaw(`{"siteId":"site_1","category":"MATERIAL","amount":5,"paymentMode":"CASH","__proto__":{"x":1}}`)))
  })

  it.each(['secureUrl', 'cloudinaryPublicId', 'format', 'bytes'])(
    'refuses the client-sent attachment field %s',
    async (field) => {
      await expectBadRequest(await createExpense(postRequest({ ...VALID_BODY, [field]: 'x' })))
    }
  )
})

describe('POST /api/expenses enforces canonical enums, amounts, dates and text', () => {
  it.each([
    ['unknown category', { category: 'BRIBE' }],
    ['lower-case category', { category: 'material' }],
    ['missing category', { category: undefined }],
    ['unknown payment mode', { paymentMode: 'CRYPTO' }],
    ['missing payment mode', { paymentMode: undefined }],
    ['numeric payment mode', { paymentMode: 1 }],
  ])('refuses %s', async (_label, patch) => {
    await expectBadRequest(await createExpense(postRequest({ ...VALID_BODY, ...patch })))
  })

  it.each([
    ['three decimals', 10.123],
    ['zero', 0],
    ['negative', -5],
    ['over the Decimal(14,2) bound', 1_000_000_000_000],
    ['exponent form', 1e21],
    ['a numeric string', '1250'],
    ['null (NaN serialized)', null],
    ['missing', undefined],
  ])('refuses an amount that is %s', async (_label, amount) => {
    await expectBadRequest(await createExpense(postRequest({ ...VALID_BODY, amount })))
  })

  it.each([
    ['an impossible day', '2026-02-30'],
    ['an impossible month', '2026-13-01'],
    ['free text', 'yesterday'],
    ['a datetime', '2026-01-05T10:00:00Z'],
    ['a timestamp', 1767225600000],
    ['out of range', '1800-01-01'],
    ['an empty string', ''],
  ])('refuses a bill date that is %s', async (_label, billDate) => {
    await expectBadRequest(await createExpense(postRequest({ ...VALID_BODY, billDate })))
  })

  it.each([
    ['over-long paidTo', { paidTo: 'p'.repeat(201) }],
    ['over-long billNumber', { billNumber: 'b'.repeat(101) }],
    ['over-long notes', { notes: 'n'.repeat(2001) }],
    ['over-long description', { description: 'd'.repeat(1001) }],
    ['non-string description', { description: 123 }],
    ['object notes', { notes: { text: 'x' } }],
    ['blank siteId', { siteId: '   ' }],
    ['over-long siteId', { siteId: 's'.repeat(65) }],
    ['numeric siteId', { siteId: 1 }],
  ])('refuses %s', async (_label, patch) => {
    await expectBadRequest(await createExpense(postRequest({ ...VALID_BODY, ...patch })))
  })
})

describe('POST /api/expenses keeps authorization ahead of validation', () => {
  it('refuses a principal without expenses.create with 403 even for an invalid body', async () => {
    grantOnly()
    const response = await createExpense(postRaw('{not json'))
    expect(response.status).toBe(403)
    expectNoReadsOrWrites()
  })

  it('refuses a principal without the BILL submit permission with 403 even for an invalid body', async () => {
    grantOnly('expenses.create')
    const response = await createExpense(postRequest({ ...VALID_BODY, companyId: 'company_2' }))
    expect(response.status).toBe(403)
    expectNoReadsOrWrites()
  })
})

describe('POST /api/expenses binds site and media to the caller scope', () => {
  it('refuses a site of another company before any media read or write', async () => {
    const response = await createExpense(postRequest({ ...VALID_BODY, siteId: 'site_other', mediaAssetId: 'asset_1' }))
    expect(response.status).toBe(404)
    expect(mocks.tx.mediaAsset.findFirst).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('refuses an in-company site outside the engineer assignment', async () => {
    mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: ['site_2'] })
    const response = await createExpense(postRequest(VALID_BODY))
    expect(response.status).toBe(404)
    expectNoWrites()
  })

  it.each([
    ['uploaded by another user', 'asset_of_other_user'],
    ['for another site or company', 'asset_other_site'],
  ])('refuses a media asset %s and rolls back', async (_label, mediaAssetId) => {
    const response = await createExpense(postRequest({ ...VALID_BODY, mediaAssetId }))
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden: Uploaded bill not found or access denied' })
    expect(mocks.tx.mediaAsset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mediaAssetId, companyId: 'company_1', siteId: 'site_1', module: 'BILL', uploadedById: 'engineer_1' },
      })
    )
    expect(mocks.tx.expense.create).not.toHaveBeenCalled()
    expect(mocks.tx.approval.create).not.toHaveBeenCalled()
    expect(mocks.committed).toEqual([])
  })

  it('refuses an upload already attached to another bill', async () => {
    mocks.tx.billAttachment.findFirst.mockResolvedValue({ id: 'attachment_9' })
    const response = await createExpense(postRequest({ ...VALID_BODY, mediaAssetId: 'asset_1' }))
    expect(response.status).toBe(403)
    expect(mocks.tx.expense.create).not.toHaveBeenCalled()
    expect(mocks.committed).toEqual([])
    // Attached before claims existed: the claim matched, then rolled back with the refusal.
    expect(asset('asset_1')).toMatchObject({ consumedAt: null, consumedBy: null, consumedRecordId: null })
  })

  it('answers an upload another bill already claimed with a safe 403, not a 500', async () => {
    const response = await createExpense(postRequest({ ...VALID_BODY, mediaAssetId: 'asset_claimed' }))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden: Uploaded bill is already attached' })
    expect(claimCalls()).toHaveLength(1)
    expect(mocks.tx.billAttachment.findFirst).not.toHaveBeenCalled()
    expect(mocks.tx.expense.create).not.toHaveBeenCalled()
    expect(mocks.tx.approval.create).not.toHaveBeenCalled()
    expect(mocks.committed).toEqual([])
    expect(asset('asset_claimed')).toMatchObject({ consumedBy: 'EXPENSE_BILL', consumedRecordId: 'expense_0' })
  })

  it('refuses a second POST of the same upload with 403 once it backs a bill', async () => {
    expect((await createExpense(postRequest({ ...VALID_BODY, mediaAssetId: 'asset_1' }))).status).toBe(200)
    const repeat = await createExpense(postRequest({ ...VALID_BODY, mediaAssetId: 'asset_1' }))

    expect(repeat.status).toBe(403)
    await expect(repeat.json()).resolves.toEqual({ error: 'Forbidden: Uploaded bill is already attached' })
    expect(mocks.tx.expense.create).toHaveBeenCalledTimes(1)
    expect(mocks.committed.filter((row) => row.model === 'billAttachment')).toHaveLength(1)
  })

  it('lets exactly one of two concurrent POSTs for the same upload claim it; the other gets 403', async () => {
    // Both requests read the asset as usable before either claims it: the race a
    // read-then-insert check loses. Only the guarded claim separates them.
    let reads = 0
    let bothRead!: () => void
    const gate = new Promise<void>((resolve) => { bothRead = resolve })
    mocks.tx.mediaAsset.findFirst.mockImplementation(async (args: { where?: Row }) => {
      const row = await assets.findFirst(args)
      if (++reads === 2) bothRead()
      await gate
      return row
    })

    const responses = await Promise.all([
      createExpense(postRequest({ ...VALID_BODY, mediaAssetId: 'asset_1' })),
      createExpense(postRequest({ ...VALID_BODY, mediaAssetId: 'asset_1' })),
    ])

    expect(reads).toBe(2)
    expect(responses.map((response) => response.status).sort()).toEqual([200, 403])
    const loser = responses.find((response) => response.status === 403)!
    await expect(loser.json()).resolves.toEqual({ error: 'Forbidden: Uploaded bill is already attached' })

    expect(claimCalls()).toHaveLength(2)
    expect(mocks.tx.expense.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.approval.create).toHaveBeenCalledTimes(1)
    expect(mocks.committed.map((row) => row.model)).toEqual(['expense', 'billAttachment', 'approval', 'approvalTimeline'])
    // The loser's rollback did not undo the winner's claim.
    expect(asset('asset_1')).toMatchObject({ consumedBy: 'EXPENSE_BILL', consumedRecordId: 'expense_1' })
  })

  it.each([
    ['a number', 7],
    ['a blank string', '   '],
    ['an over-long id', 'a'.repeat(65)],
    ['an object', { id: 'asset_1' }],
  ])('answers a malformed media id (%s) like an unusable upload, before any read', async (_label, mediaAssetId) => {
    const response = await createExpense(postRequest({ ...VALID_BODY, mediaAssetId }))
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden: Uploaded bill not found or access denied' })
    expectNoReadsOrWrites()
  })

  it('requires the BILLS module to attach an upload, before any site read', async () => {
    mocks.requireModuleEnabled.mockImplementation(async (name: string) => {
      if (name === 'BILLS') throw new Error('Forbidden: Module BILLS is not enabled')
    })
    const response = await createExpense(postRequest({ ...VALID_BODY, mediaAssetId: 'asset_1' }))
    expect(response.status).toBe(403)
    expectNoReadsOrWrites()
  })
})

describe('POST /api/expenses accepts a valid canonical body', () => {
  it('writes the normalized expense, approval and timeline in one transaction', async () => {
    const response = await createExpense(
      postRequest({
        ...VALID_BODY,
        description: '  Cement bags  ',
        paidTo: '  Sri Traders ',
        billNumber: '',
        notes: '   ',
        billDate: '2026-02-28',
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true, expense: expect.objectContaining({ id: 'expense_1' }) })
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.mediaAsset.findFirst).not.toHaveBeenCalled()

    const expenseData = mocks.tx.expense.create.mock.calls[0][0].data
    expect(expenseData).toEqual({
      companyId: 'company_1',
      siteId: 'site_1',
      category: 'MATERIAL',
      description: 'Cement bags',
      amount: 1250.5,
      paymentMode: 'UPI',
      paidTo: 'Sri Traders',
      billNumber: undefined,
      billDate: new Date('2026-02-28T00:00:00.000Z'),
      notes: undefined,
      approvalStatus: 'PENDING',
      createdById: 'engineer_1',
    })
    expect(mocks.tx.approval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company_1',
        siteId: 'site_1',
        entityType: 'BILL',
        entityId: 'expense_1',
        amount: 1250.5,
        requestedById: 'engineer_1',
        currentStatus: 'PENDING',
      }),
    })
    expect(mocks.committed.map((row) => row.model)).toEqual(['expense', 'approval', 'approvalTimeline'])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/approvals')
  })

  it('accepts the mobile form payload with blank optional fields and a null bill date', async () => {
    const response = await createExpense(
      postRequest({ ...VALID_BODY, paidTo: '', billNumber: '', billDate: null, mediaAssetId: null })
    )
    expect(response.status).toBe(200)
    expect(mocks.tx.expense.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ paidTo: undefined, billNumber: undefined, billDate: null })
    )
  })

  it('attaches the caller own upload, copying every stored field from the MediaAsset', async () => {
    const response = await createExpense(postRequest({ ...VALID_BODY, mediaAssetId: ' asset_1 ' }))

    expect(response.status).toBe(200)
    expect(mocks.requireModuleEnabled).toHaveBeenCalledWith('BILLS')
    expect(mocks.tx.billAttachment.findFirst).toHaveBeenCalledWith({
      where: { cloudinaryPublicId: MEDIA_ASSET.cloudinaryPublicId },
      select: { id: true },
    })
    expect(mocks.committed.map((row) => row.model)).toEqual(['expense', 'billAttachment', 'approval', 'approvalTimeline'])
    expect(mocks.committed[1].data).toEqual({ expenseId: 'expense_1', ...MEDIA_ASSET, uploadedById: 'engineer_1' })
    expect(mocks.tx.mediaAsset.updateMany.mock.calls.map(([args]) => args)).toEqual([
      {
        where: { id: 'asset_1', companyId: 'company_1', siteId: 'site_1', module: 'BILL', uploadedById: 'engineer_1', consumedAt: null },
        data: { consumedAt: expect.any(Date), consumedBy: 'EXPENSE_BILL' },
      },
      {
        where: { id: 'asset_1', consumedBy: 'EXPENSE_BILL', consumedRecordId: null },
        data: { consumedRecordId: 'expense_1' },
      },
    ])
    expect(asset('asset_1')).toMatchObject({ consumedBy: 'EXPENSE_BILL', consumedRecordId: 'expense_1' })
  })

  it('rolls back the expense, attachment and claim when the approval write fails', async () => {
    mocks.tx.approval.create.mockRejectedValueOnce(new Error('approval insert failed'))
    const response = await createExpense(postRequest({ ...VALID_BODY, mediaAssetId: 'asset_1' }))
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Failed to create expense' })
    expect(mocks.committed).toEqual([])
    // The claim rolled back with the transaction, so the upload can be filed again.
    expect(asset('asset_1')).toMatchObject({ consumedAt: null, consumedBy: null, consumedRecordId: null })
    expect((await createExpense(postRequest({ ...VALID_BODY, mediaAssetId: 'asset_1' }))).status).toBe(200)
  })
})
