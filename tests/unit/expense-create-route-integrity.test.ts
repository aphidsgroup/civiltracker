import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Route-level cover for `POST /api/expenses`, the mobile "add expense" endpoint.
 *
 * The handler used to create the Expense on the global client and then issue a bare
 * `prisma.approval.create` of its own. That skipped the live-site rule (a soft-deleted
 * site was accepted), wrote no approval timeline, and — because the two writes were not
 * in one transaction — a failed approval write left a PENDING expense with no approval
 * pointing at it.
 *
 * The transaction mock below stages every write issued on `tx` and only commits it when
 * the callback resolves, so "committed" is what a real database would still hold.
 */
const mocks = vi.hoisted(() => {
  const committed: Array<{ model: string; data: Record<string, unknown> }> = []
  let staged: typeof committed = []

  const prisma = {
    $transaction: vi.fn(),
    site: { findFirst: vi.fn(), findUnique: vi.fn() },
    expense: { create: vi.fn(), findFirst: vi.fn() },
    approval: { create: vi.fn() },
    approvalTimeline: { create: vi.fn() },
  }

  const tx = {
    expense: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: 'expense_1', ...data }
        staged.push({ model: 'expense', data: row })
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
  amount: 1250,
  paymentMode: 'CASH',
  notes: 'Paid at gate',
}

function postRequest(body: unknown = VALID_BODY) {
  return new Request('http://localhost/api/expenses', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function grantOnly(...permissions: string[]) {
  mocks.hasPermission.mockImplementation((_role: string, permission: string) => permissions.includes(permission))
}

/** Nothing may reach the database: no expense, no approval, no timeline. */
function expectNoWrites() {
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  expect(mocks.tx.expense.create).not.toHaveBeenCalled()
  expect(mocks.tx.approval.create).not.toHaveBeenCalled()
  expect(mocks.tx.approvalTimeline.create).not.toHaveBeenCalled()
  expectNoGlobalWrites()
  expect(mocks.committed).toEqual([])
}

/** The raw, non-transactional writes on the global client are what the bypass was. */
function expectNoGlobalWrites() {
  expect(mocks.prisma.expense.create).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.create).not.toHaveBeenCalled()
  expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.committed.length = 0
  mocks.requireUser.mockResolvedValue(SITE_ENGINEER)
  mocks.requireModuleEnabled.mockResolvedValue(undefined)
  grantOnly('expenses.create', 'bills.upload')
  mocks.prisma.$transaction.mockImplementation(mocks.runTransaction)
  mocks.prisma.site.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) =>
    args.where.id === 'site_1' && args.where.deletedAt === null
      ? { id: 'site_1', companyId: 'company_1' }
      : null
  )
})

describe('POST /api/expenses authorizes before any read', () => {
  it('refuses a principal without expenses.create before any site or entity read', async () => {
    grantOnly()

    const response = await createExpense(postRequest())

    expect(response.status).toBe(403)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.site.findUnique).not.toHaveBeenCalled()
    expect(mocks.prisma.expense.findFirst).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('refuses a principal who may create expenses but may not raise a BILL approval', async () => {
    grantOnly('expenses.create')

    const response = await createExpense(postRequest())

    expect(response.status).toBe(403)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.site.findUnique).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('refuses a stale principal before touching the database', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Account is inactive'))

    const response = await createExpense(postRequest())

    expect(response.status).toBe(401)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expectNoWrites()
  })
})

describe('POST /api/expenses binds to a live site in the caller company', () => {
  it('refuses a soft-deleted site before any expense or approval write', async () => {
    // The row exists but is soft deleted: only a lookup that ignores deletedAt finds it.
    mocks.prisma.site.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) =>
      args.where.deletedAt === null ? null : { id: 'site_1', companyId: 'company_1', deletedAt: new Date() }
    )

    const response = await createExpense(postRequest())

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden: Site not found or access denied' })
    expect(mocks.prisma.site.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'site_1', companyId: 'company_1', deletedAt: null }),
      })
    )
    expectNoWrites()
  })

  it('refuses a site of another company before any write', async () => {
    const response = await createExpense(postRequest({ ...VALID_BODY, siteId: 'site_of_another_company' }))

    expect(response.status).toBe(404)
    expectNoWrites()
  })
})

describe('POST /api/expenses writes expense, approval and timeline atomically', () => {
  it('creates all three rows inside one transaction and keeps the response contract', async () => {
    const response = await createExpense(postRequest())

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ success: true, expense: expect.objectContaining({ id: 'expense_1' }) })

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.expense.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.approval.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.approvalTimeline.create).toHaveBeenCalledTimes(1)
    expect(mocks.committed.map((row) => row.model)).toEqual(['expense', 'approval', 'approvalTimeline'])
    expectNoGlobalWrites()
  })

  it('binds the expense and approval to the exact company, site and linked expense', async () => {
    await createExpense(postRequest())

    expect(mocks.tx.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company_1',
        siteId: 'site_1',
        approvalStatus: 'PENDING',
        createdById: 'engineer_1',
      }),
    })
    expect(mocks.tx.approval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company_1',
        siteId: 'site_1',
        entityType: 'BILL',
        entityId: 'expense_1',
        title: 'Expense for MATERIAL',
        amount: 1250,
        description: 'Paid at gate',
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

  it('binds a SUPER_ADMIN request to the company that owns the site', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root_1', name: 'Root', email: 'root@x.test', role: 'SUPER_ADMIN' })
    mocks.prisma.site.findFirst.mockResolvedValue({ id: 'site_9', companyId: 'company_9' })

    const response = await createExpense(postRequest({ ...VALID_BODY, siteId: 'site_9' }))

    expect(response.status).toBe(200)
    expect(mocks.prisma.site.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'site_9', deletedAt: null }) })
    )
    expect(mocks.tx.approval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: 'company_9', siteId: 'site_9', entityId: 'expense_1' }),
    })
    expect(mocks.tx.approvalTimeline.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: 'company_9' }),
    })
  })

  it('rolls back the expense when the approval write fails, leaving no orphan', async () => {
    mocks.tx.approval.create.mockRejectedValueOnce(new Error('connection reset: approval insert failed'))

    const response = await createExpense(postRequest())

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(JSON.stringify(body)).not.toContain('connection reset')
    expect(mocks.tx.approvalTimeline.create).not.toHaveBeenCalled()
    expect(mocks.committed).toEqual([])
    expectNoGlobalWrites()
  })

  it('rolls back the expense and approval when the timeline write fails', async () => {
    mocks.tx.approvalTimeline.create.mockRejectedValueOnce(new Error('timeline insert failed'))

    const response = await createExpense(postRequest())

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(JSON.stringify(body)).not.toContain('timeline insert failed')
    expect(mocks.tx.expense.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.approval.create).toHaveBeenCalledTimes(1)
    expect(mocks.committed).toEqual([])
    expectNoGlobalWrites()
  })

  it('still rejects an invalid payload before any write', async () => {
    const response = await createExpense(postRequest({ ...VALID_BODY, amount: -5 }))

    expect(response.status).toBe(400)
    expectNoWrites()
  })
})
