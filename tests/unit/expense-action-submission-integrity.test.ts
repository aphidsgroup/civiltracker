import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Direct-action cover for `createExpenseAction`, the mobile add-expense / upload-bill
 * Server Action.
 *
 * The action used to create the Expense (and its bill attachment) on the global client
 * and only then raise the approval through `createApprovalAction`. A failure in the
 * approval or its timeline left a PENDING expense with no approval pointing at it. For a
 * SUPER_ADMIN, `assertCanAccessSite` returned before checking anything and the follow-on
 * `findUnique` ignored `deletedAt`, so an expense could be written onto a deleted site
 * before the approval submit refused it.
 *
 * The transaction mock stages every write issued on `tx` and only commits it when the
 * callback resolves, so "committed" is what a real database would still hold.
 */
const mocks = vi.hoisted(() => {
  const committed: Array<{ model: string; data: Record<string, unknown> }> = []
  let staged: typeof committed = []

  const prisma = {
    $transaction: vi.fn(),
    site: { findFirst: vi.fn(), findUnique: vi.fn() },
    expense: { create: vi.fn(), findFirst: vi.fn() },
    billAttachment: { create: vi.fn() },
    approval: { create: vi.fn() },
    approvalTimeline: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  }

  const tx = {
    expense: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const { billAttachments, ...fields } = data as { billAttachments?: { create: Record<string, unknown> } }
        const row = { id: 'expense_1', ...fields }
        staged.push({ model: 'expense', data: row })
        if (billAttachments) {
          staged.push({ model: 'billAttachment', data: { expenseId: row.id, ...billAttachments.create } })
        }
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

const SITE_ENGINEER = {
  id: 'engineer_1',
  name: 'Engineer',
  email: 'engineer@acme.test',
  role: 'SITE_ENGINEER',
  companyId: 'company_1',
}

const SUPER_ADMIN = { id: 'root_1', name: 'Root', email: 'root@x.test', role: 'SUPER_ADMIN', companyId: null }

const EXPENSE_INPUT = {
  siteId: 'site_1',
  amount: 1250,
  category: 'MATERIAL' as const,
  paymentMode: 'CASH' as const,
  paidTo: 'Supplier',
  notes: 'Cement bags',
}

const BILL_INPUT = {
  ...EXPENSE_INPUT,
  billNumber: 'INV-7',
  cloudinaryPublicId: 'bills/inv7',
  secureUrl: 'https://res.cloudinary.test/bills/inv7.jpg',
  format: 'jpg',
  bytes: 2048,
}

function grantOnly(...permissions: string[]) {
  mocks.hasPermission.mockImplementation((_role: string, permission: string) => permissions.includes(permission))
}

function expectNoReads() {
  expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.site.findUnique).not.toHaveBeenCalled()
  expect(mocks.prisma.expense.findFirst).not.toHaveBeenCalled()
}

/** The raw, non-transactional writes on the global client are what the orphan was. */
function expectNoGlobalWrites() {
  expect(mocks.prisma.expense.create).not.toHaveBeenCalled()
  expect(mocks.prisma.billAttachment.create).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.create).not.toHaveBeenCalled()
  expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
}

function expectNoWrites() {
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  expect(mocks.tx.expense.create).not.toHaveBeenCalled()
  expect(mocks.tx.approval.create).not.toHaveBeenCalled()
  expect(mocks.tx.approvalTimeline.create).not.toHaveBeenCalled()
  expectNoGlobalWrites()
  expect(mocks.committed).toEqual([])
  expect(mocks.logActivity).not.toHaveBeenCalled()
}

/** Live site lookup: only a query that pins `deletedAt: null` finds the row. */
function liveSites(sites: Record<string, { companyId: string; deleted?: boolean }>) {
  mocks.prisma.site.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => {
    const site = sites[args.where.id as string]
    if (!site) return null
    if (args.where.companyId !== undefined && args.where.companyId !== site.companyId) return null
    if (args.where.deletedAt !== null && site.deleted) return { id: args.where.id, companyId: site.companyId }
    if (site.deleted) return null
    return { id: args.where.id, companyId: site.companyId, name: `Site ${args.where.id}` }
  })
  // A lookup that ignores `deletedAt` would find the deleted row — that was the bypass.
  mocks.prisma.site.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
    const site = sites[args.where.id]
    return site ? { id: args.where.id, companyId: site.companyId, name: `Site ${args.where.id}` } : null
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.committed.length = 0
  mocks.requireUser.mockResolvedValue(SITE_ENGINEER)
  grantOnly('expenses.create', 'bills.upload', 'approvals.view')
  mocks.prisma.$transaction.mockImplementation(mocks.runTransaction)
  liveSites({ site_1: { companyId: 'company_1' } })
})

describe('createExpenseAction authorizes before any read or write', () => {
  it('refuses an unauthenticated or stale principal before touching the database', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Account is inactive'))

    await expect(createExpenseAction(EXPENSE_INPUT)).rejects.toThrow(/UNAUTHORIZED/)
    expectNoReads()
    expectNoWrites()
  })

  it('refuses a principal without expenses.create before any read', async () => {
    grantOnly('bills.upload', 'approvals.view')

    await expect(createExpenseAction(EXPENSE_INPUT)).rejects.toThrow(/expenses\.create/)
    expectNoReads()
    expectNoWrites()
  })

  it('refuses a bill upload by a principal without bills.upload before any read', async () => {
    grantOnly('expenses.create', 'approvals.view')

    await expect(createExpenseAction(BILL_INPUT)).rejects.toThrow(/bills\.upload/)
    expectNoReads()
    expectNoWrites()
  })

  it('refuses a principal outside the approval workflow before any read', async () => {
    grantOnly('expenses.create', 'bills.upload')

    await expect(createExpenseAction(EXPENSE_INPUT)).rejects.toThrow(/approvals\.view/)
    expectNoReads()
    expectNoWrites()
  })

  it('refuses a non-super-admin with no company context before any read', async () => {
    mocks.requireUser.mockResolvedValue({ ...SITE_ENGINEER, companyId: null })

    await expect(createExpenseAction(EXPENSE_INPUT)).rejects.toThrow(/company context/i)
    expectNoReads()
    expectNoWrites()
  })
})

describe('createExpenseAction binds to a live site in scope', () => {
  it('refuses a soft-deleted site for a company user before any write', async () => {
    liveSites({ site_1: { companyId: 'company_1', deleted: true } })

    await expect(createExpenseAction(EXPENSE_INPUT)).rejects.toThrow(/site not found or access denied/i)
    expect(mocks.prisma.site.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'site_1', companyId: 'company_1', deletedAt: null }),
      })
    )
    expectNoWrites()
  })

  it('refuses a soft-deleted site for a SUPER_ADMIN before any write', async () => {
    mocks.requireUser.mockResolvedValue(SUPER_ADMIN)
    liveSites({ site_9: { companyId: 'company_9', deleted: true } })

    await expect(createExpenseAction({ ...EXPENSE_INPUT, siteId: 'site_9' })).rejects.toThrow(
      /site not found or access denied/i
    )
    expect(mocks.prisma.site.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'site_9', deletedAt: null }) })
    )
    expectNoWrites()
  })

  it('refuses a site of another company before any write', async () => {
    liveSites({ site_1: { companyId: 'company_1' }, site_other: { companyId: 'company_2' } })

    await expect(createExpenseAction({ ...EXPENSE_INPUT, siteId: 'site_other' })).rejects.toThrow(
      /site not found or access denied/i
    )
    expectNoWrites()
  })
})

describe('createExpenseAction writes expense, approval and timeline atomically', () => {
  it('creates all three rows inside one transaction and keeps the response contract', async () => {
    await expect(createExpenseAction(EXPENSE_INPUT)).resolves.toEqual({ success: true, expenseId: 'expense_1' })

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.committed.map((row) => row.model)).toEqual(['expense', 'approval', 'approvalTimeline'])
    expectNoGlobalWrites()
    expect(mocks.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'company_1', module: 'EXPENSE', recordId: 'expense_1' })
    )
  })

  it('binds the expense, approval and timeline to the exact company, site and expense', async () => {
    await createExpenseAction(EXPENSE_INPUT)

    expect(mocks.tx.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company_1',
        siteId: 'site_1',
        amount: 1250,
        category: 'MATERIAL',
        createdById: 'engineer_1',
      }),
    })
    expect(mocks.tx.approval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company_1',
        siteId: 'site_1',
        entityType: 'EXPENSE',
        entityId: 'expense_1',
        amount: 1250,
        priority: 'NORMAL',
        approvalType: 'FINANCIAL',
        requestedById: 'engineer_1',
        currentStatus: 'PENDING',
      }),
    })
    expect(mocks.tx.approvalTimeline.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company_1',
        approvalId: 'approval_1',
        actorUserId: 'engineer_1',
        action: 'SUBMITTED',
        toStatus: 'PENDING',
      }),
    })
  })

  it('commits the bill attachment with its BILL approval in the same transaction', async () => {
    await expect(createExpenseAction(BILL_INPUT)).resolves.toEqual({ success: true, expenseId: 'expense_1' })

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.committed.map((row) => row.model)).toEqual([
      'expense',
      'billAttachment',
      'approval',
      'approvalTimeline',
    ])
    expect(mocks.tx.approval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entityType: 'BILL', entityId: 'expense_1', siteId: 'site_1' }),
    })
    expectNoGlobalWrites()
  })

  it('binds a SUPER_ADMIN expense to the company that owns the live site', async () => {
    mocks.requireUser.mockResolvedValue(SUPER_ADMIN)
    liveSites({ site_9: { companyId: 'company_9' } })

    await createExpenseAction({ ...EXPENSE_INPUT, siteId: 'site_9' })

    expect(mocks.tx.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: 'company_9', siteId: 'site_9' }),
    })
    expect(mocks.tx.approval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: 'company_9', siteId: 'site_9', entityId: 'expense_1' }),
    })
    expect(mocks.tx.approvalTimeline.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: 'company_9' }),
    })
  })

  it('rolls back the expense and attachment when the approval write fails', async () => {
    mocks.tx.approval.create.mockRejectedValueOnce(new Error('approval insert failed'))

    await expect(createExpenseAction(BILL_INPUT)).rejects.toThrow('approval insert failed')

    expect(mocks.tx.expense.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.approvalTimeline.create).not.toHaveBeenCalled()
    expect(mocks.committed).toEqual([])
    expectNoGlobalWrites()
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })

  it('rolls back the expense, attachment and approval when the timeline write fails', async () => {
    mocks.tx.approvalTimeline.create.mockRejectedValueOnce(new Error('timeline insert failed'))

    await expect(createExpenseAction(BILL_INPUT)).rejects.toThrow('timeline insert failed')

    expect(mocks.tx.approval.create).toHaveBeenCalledTimes(1)
    expect(mocks.committed).toEqual([])
    expectNoGlobalWrites()
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })
})
