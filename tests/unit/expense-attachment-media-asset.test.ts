import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for bill attachment injection through `createExpenseAction`.
 *
 * The mobile add-expense / upload-bill Server Action persisted whatever `secureUrl`,
 * `cloudinaryPublicId`, `format` and `bytes` the browser sent as the expense's bill
 * attachment, so a caller could attach any URL — another tenant's bill, a phishing link,
 * or a local `blob:` preview — to an expense and its BILL approval.
 *
 * Now the attachment is named only by the MediaAsset id `/api/upload` returned. The asset
 * must be a BILL upload by the same user for exactly the expense's live site and company,
 * not yet attached to another expense, and every stored attachment field is copied from
 * it. Any client-sent attachment field is refused before any read; an unusable asset is
 * refused before the expense is written. `@/lib/permissions` is real.
 */
const mocks = vi.hoisted(() => {
  const committed: Array<{ model: string; data: Record<string, unknown> }> = []
  let staged: typeof committed = []

  const tx = {
    mediaAsset: { findFirst: vi.fn() },
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
        staged.push({ model: 'approval', data })
        return { id: 'approval_1', ...data }
      }),
    },
    approvalTimeline: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        staged.push({ model: 'approvalTimeline', data })
        return { id: 'timeline_1', ...data }
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
    revalidatePath: vi.fn(),
    logActivity: vi.fn(),
    prisma: {
      $transaction: vi.fn(),
      site: { findFirst: vi.fn() },
      mediaAsset: { findFirst: vi.fn(), findUnique: vi.fn() },
      expense: { create: vi.fn() },
      billAttachment: { create: vi.fn() },
    },
    tx,
    committed,
    runTransaction,
  }
})

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

const { createExpenseAction } = await import('@/actions/expense')

const ENGINEER = { id: 'engineer_1', name: 'Engineer', email: 'engineer@acme.test', role: 'SITE_ENGINEER', companyId: 'company_1' }

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', name: 'Tower A', deletedAt: null },
  { id: 'site_2', companyId: 'company_1', name: 'Tower B', deletedAt: null },
]

const ASSET = {
  companyId: 'company_1',
  siteId: 'site_1',
  module: 'BILL',
  uploadedById: 'engineer_1',
  secureUrl: 'https://res.cloudinary.test/acme/site_1/bill/abc.jpg',
  format: 'jpg',
  bytes: 4096,
  width: 800,
  height: 600,
  originalName: 'invoice.jpg',
}

const ASSETS: Row[] = [
  { ...ASSET, id: 'asset_ok', cloudinaryPublicId: 'acme/site_1/bill/abc' },
  { ...ASSET, id: 'asset_bound', cloudinaryPublicId: 'acme/site_1/bill/used' },
  { ...ASSET, id: 'asset_other_company', companyId: 'company_2', cloudinaryPublicId: 'other/bill/x' },
  { ...ASSET, id: 'asset_other_site', siteId: 'site_2', cloudinaryPublicId: 'acme/site_2/bill/y' },
  { ...ASSET, id: 'asset_no_site', siteId: null, cloudinaryPublicId: 'acme/general/bill/z' },
  { ...ASSET, id: 'asset_other_uploader', uploadedById: 'engineer_2', cloudinaryPublicId: 'acme/site_1/bill/theirs' },
  { ...ASSET, id: 'asset_photo', module: 'SITE_PHOTO', cloudinaryPublicId: 'acme/site_1/photo/p' },
  { ...ASSET, id: 'asset_document', module: 'DOCUMENT', cloudinaryPublicId: 'acme/site_1/doc/d' },
]

const ATTACHMENTS: Row[] = [{ id: 'att_existing', expenseId: 'expense_0', cloudinaryPublicId: 'acme/site_1/bill/used' }]

const INPUT = {
  siteId: 'site_1',
  amount: 1250,
  category: 'MATERIAL' as const,
  paymentMode: 'CASH' as const,
  notes: 'Cement bags',
}

function expectNothingWritten() {
  expect(mocks.tx.expense.create).not.toHaveBeenCalled()
  expect(mocks.tx.approval.create).not.toHaveBeenCalled()
  expect(mocks.tx.approvalTimeline.create).not.toHaveBeenCalled()
  expect(mocks.prisma.expense.create).not.toHaveBeenCalled()
  expect(mocks.prisma.billAttachment.create).not.toHaveBeenCalled()
  expect(mocks.committed).toEqual([])
  expect(mocks.logActivity).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.committed.length = 0
  mocks.requireUser.mockResolvedValue(ENGINEER)
  mocks.prisma.$transaction.mockImplementation(mocks.runTransaction)
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)
  mocks.tx.mediaAsset.findFirst.mockImplementation(inMemoryDelegate(ASSETS).findFirst)
  mocks.tx.billAttachment.findFirst.mockImplementation(inMemoryDelegate(ATTACHMENTS).findFirst)
})

describe('createExpenseAction refuses client-supplied attachment fields', () => {
  it.each([
    { secureUrl: 'https://evil.test/bill.jpg' },
    { cloudinaryPublicId: 'other/bill/x' },
    { format: 'pdf' },
    { bytes: 1 },
    { secureUrl: 'blob:https://app.test/1234' },
    { mediaAssetId: 'asset_ok', secureUrl: 'https://evil.test/bill.jpg' },
  ])('refuses %o before any read or write', async (extra) => {
    await expect(createExpenseAction({ ...INPUT, ...extra } as never)).rejects.toThrow(/media asset id/)

    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  it.each([
    ['a blank id', ''],
    ['a whitespace id', '   '],
    ['a non-string id', { id: 'asset_ok' }],
    ['an over-long id', 'a'.repeat(65)],
  ])('refuses %s before any read', async (_label, mediaAssetId) => {
    await expect(createExpenseAction({ ...INPUT, mediaAssetId } as never)).rejects.toThrow(/Uploaded bill not found/)

    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expectNothingWritten()
  })
})

describe('createExpenseAction binds the attachment to a server-resolved MediaAsset', () => {
  it('copies every attachment field from the caller\'s own BILL upload for the site', async () => {
    await expect(createExpenseAction({ ...INPUT, mediaAssetId: 'asset_ok' })).resolves.toEqual({ success: true, expenseId: 'expense_1' })

    expect(mocks.tx.mediaAsset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asset_ok', companyId: 'company_1', siteId: 'site_1', module: 'BILL', uploadedById: 'engineer_1' },
      })
    )
    expect(mocks.committed.map((row) => row.model)).toEqual(['expense', 'billAttachment', 'approval', 'approvalTimeline'])
    expect(mocks.committed[1].data).toEqual({
      expenseId: 'expense_1',
      cloudinaryPublicId: 'acme/site_1/bill/abc',
      secureUrl: 'https://res.cloudinary.test/acme/site_1/bill/abc.jpg',
      format: 'jpg',
      bytes: 4096,
      width: 800,
      height: 600,
      originalName: 'invoice.jpg',
      uploadedById: 'engineer_1',
    })
    expect(mocks.tx.approval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entityType: 'BILL', companyId: 'company_1', siteId: 'site_1', entityId: 'expense_1' }),
    })
    expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({ module: 'BILL_UPLOAD' }))
  })

  it.each([
    ['an unknown asset id', 'asset_missing'],
    ['another tenant\'s asset', 'asset_other_company'],
    ['an asset uploaded for another site of the company', 'asset_other_site'],
    ['an asset uploaded with no site', 'asset_no_site'],
    ['an asset another user uploaded', 'asset_other_uploader'],
    ['a site photo upload', 'asset_photo'],
    ['a document upload', 'asset_document'],
  ])('refuses %s before the expense is written', async (_label, mediaAssetId) => {
    await expect(createExpenseAction({ ...INPUT, mediaAssetId })).rejects.toThrow(/Uploaded bill not found or access denied/)
    expect(mocks.tx.billAttachment.findFirst).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  it('refuses an upload that is already attached to another expense', async () => {
    await expect(createExpenseAction({ ...INPUT, mediaAssetId: 'asset_bound' })).rejects.toThrow(/already attached/)
    expectNothingWritten()
  })

  it('never reads the asset on the global client, outside the workflow transaction', async () => {
    await createExpenseAction({ ...INPUT, mediaAssetId: 'asset_ok' })

    expect(mocks.prisma.mediaAsset.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.mediaAsset.findUnique).not.toHaveBeenCalled()
  })

  it('refuses a caller without bills.upload before reading any asset', async () => {
    mocks.requireUser.mockResolvedValue({ ...ENGINEER, role: 'SUPERVISOR' })

    await expect(createExpenseAction({ ...INPUT, mediaAssetId: 'asset_ok' })).rejects.toThrow(/expenses\.create/)
    expect(mocks.tx.mediaAsset.findFirst).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  it('records a plain EXPENSE, with no attachment, when no asset is named', async () => {
    await createExpenseAction(INPUT)

    expect(mocks.tx.mediaAsset.findFirst).not.toHaveBeenCalled()
    expect(mocks.committed.map((row) => row.model)).toEqual(['expense', 'approval', 'approvalTimeline'])
    expect(mocks.tx.approval.create).toHaveBeenCalledWith({ data: expect.objectContaining({ entityType: 'EXPENSE' }) })
  })
})
