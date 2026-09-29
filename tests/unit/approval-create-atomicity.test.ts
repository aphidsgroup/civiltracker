import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Atomicity cover for the generic approval request path.
 *
 * `createApprovalAction` — and the REST POST that delegates to it — wrote the approval
 * row and its initial SUBMITTED timeline entry as two independent statements on the
 * global client. A timeline failure after the approval insert left a PENDING approval
 * with no history behind it: listed, counted and actionable, but never submitted as far
 * as the audit trail is concerned.
 *
 * The transaction client here is a distinct object that does NOT forward to the global
 * delegates, and the `$transaction` double stages writes and only commits them when the
 * callback resolves. A write that escapes the transaction therefore shows up on the
 * global spies, and a rolled-back write never reaches `committed`.
 *
 * `@/lib/permissions` is deliberately not mocked: the real matrix decides who may submit.
 */
const mocks = vi.hoisted(() => {
  const state = {
    staged: [] as Array<{ model: string; data: unknown }>,
    committed: [] as Array<{ model: string; data: unknown }>,
  }

  const prisma = {
    $transaction: vi.fn(),
    site: { findFirst: vi.fn() },
    approval: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    approvalTimeline: { create: vi.fn() },
    expense: { findFirst: vi.fn() },
    dailyProgressReport: { findFirst: vi.fn() },
    material: { findFirst: vi.fn() },
    salaryRun: { findFirst: vi.fn() },
    document: { findFirst: vi.fn() },
    purchaseOrder: { findFirst: vi.fn() },
  }

  // Only the two delegates an approval submission writes exist on the transaction
  // client, and neither carries `$transaction`: a nested transaction cannot be opened.
  const tx = {
    approval: { create: vi.fn() },
    approvalTimeline: { create: vi.fn() },
  }

  return {
    requireUser: vi.fn(),
    requireModuleEnabled: vi.fn(),
    revalidatePath: vi.fn(),
    logActivity: vi.fn(),
    syncSiteBudget: vi.fn(),
    prisma,
    tx,
    state,
  }
})

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/auth/require-module', () => ({ requireModuleEnabled: mocks.requireModuleEnabled }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('@/lib/budget', () => ({ syncSiteBudget: mocks.syncSiteBudget }))

const { createApprovalAction } = await import('@/actions/approvals')
const { createApprovalRequestRecord } = await import('@/lib/approvals/submit')
const { POST: createApprovalRoute } = await import('@/app/api/approvals/route')

const COMPANY_ADMIN = {
  id: 'admin_1',
  name: 'Admin',
  email: 'admin@acme.test',
  role: 'COMPANY_ADMIN',
  companyId: 'company_1',
}

const EXPENSE_REQUEST = {
  siteId: 'site_1',
  entityType: 'EXPENSE' as const,
  entityId: 'expense_1',
  title: 'Cement purchase',
  amount: 1200,
}

function postRequest(body: unknown) {
  return new Request('http://localhost/api/approvals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.staged = []
  mocks.state.committed = []

  mocks.requireUser.mockResolvedValue(COMPANY_ADMIN)
  mocks.requireModuleEnabled.mockResolvedValue(undefined)
  mocks.prisma.site.findFirst.mockResolvedValue({ id: 'site_1', companyId: 'company_1', name: 'Tower A' })
  mocks.prisma.expense.findFirst.mockResolvedValue({ id: 'expense_1', billAttachments: [] })

  // Interactive transaction double: writes are staged and only committed when the
  // callback resolves; a throw discards everything written inside it.
  mocks.prisma.$transaction.mockImplementation(async (run: (client: typeof mocks.tx) => unknown) => {
    mocks.state.staged = []
    const result = await run(mocks.tx)
    mocks.state.committed.push(...mocks.state.staged)
    mocks.state.staged = []
    return result
  })

  mocks.tx.approval.create.mockImplementation(async (args: { data: unknown }) => {
    mocks.state.staged.push({ model: 'approval', data: args.data })
    return { id: 'approval_new', ...(args.data as object) }
  })
  mocks.tx.approvalTimeline.create.mockImplementation(async (args: { data: unknown }) => {
    mocks.state.staged.push({ model: 'approvalTimeline', data: args.data })
    return { id: 'timeline_1' }
  })
})

describe('createApprovalAction writes approval and timeline atomically', () => {
  it('writes the approval and its SUBMITTED timeline on one transaction client', async () => {
    const approval = await createApprovalAction(EXPENSE_REQUEST)

    expect(approval).toMatchObject({ id: 'approval_new' })
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.approval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company_1',
        siteId: 'site_1',
        entityType: 'EXPENSE',
        entityId: 'expense_1',
        currentStatus: 'PENDING',
        requestedById: 'admin_1',
      }),
    })
    expect(mocks.tx.approvalTimeline.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company_1',
        approvalId: 'approval_new',
        action: 'SUBMITTED',
        toStatus: 'PENDING',
      }),
    })

    // Nothing escaped the transaction onto the global client.
    expect(mocks.prisma.approval.create).not.toHaveBeenCalled()
    expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
    expect(mocks.state.committed.map((write) => write.model)).toEqual(['approval', 'approvalTimeline'])
  })

  it('rolls the approval back when the timeline write fails', async () => {
    mocks.tx.approvalTimeline.create.mockRejectedValue(new Error('timeline insert failed'))

    await expect(createApprovalAction(EXPENSE_REQUEST)).rejects.toThrow('timeline insert failed')

    expect(mocks.tx.approval.create).toHaveBeenCalledTimes(1)
    expect(mocks.state.committed).toEqual([])
    expect(mocks.prisma.approval.create).not.toHaveBeenCalled()
    // Nothing committed, so nothing may be revalidated as if it had been.
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses a missing linked entity before any transaction is opened', async () => {
    mocks.prisma.expense.findFirst.mockResolvedValue(null)

    await expect(createApprovalAction(EXPENSE_REQUEST)).rejects.toThrow(/^Forbidden: Entity not found/)

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.tx.approval.create).not.toHaveBeenCalled()
  })

  it('refuses a caller without a live submit permission before any transaction is opened', async () => {
    mocks.requireUser.mockResolvedValue({ ...COMPANY_ADMIN, role: 'VENDOR' })

    await expect(createApprovalAction(EXPENSE_REQUEST)).rejects.toThrow(/^Forbidden: .*approvals\.view/)

    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('POST /api/approvals writes approval and timeline atomically', () => {
  it('creates the approval and timeline through one transaction', async () => {
    const response = await createApprovalRoute(postRequest(EXPENSE_REQUEST))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ success: true, data: { id: 'approval_new' } })
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.state.committed.map((write) => write.model)).toEqual(['approval', 'approvalTimeline'])
  })

  it('answers a generic 500 and commits nothing when the timeline write fails', async () => {
    mocks.tx.approvalTimeline.create.mockRejectedValue(new Error('timeline insert failed'))

    const response = await createApprovalRoute(postRequest(EXPENSE_REQUEST))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Approval request could not be processed' })
    expect(mocks.state.committed).toEqual([])
    expect(mocks.prisma.approval.create).not.toHaveBeenCalled()
  })
})

describe('createApprovalRequestRecord never opens a nested transaction', () => {
  it('writes only on the client its caller passes in', async () => {
    const callerTx = {
      approval: { create: vi.fn().mockResolvedValue({ id: 'approval_dpr' }) },
      approvalTimeline: { create: vi.fn().mockResolvedValue({ id: 'timeline_dpr' }) },
    }

    await createApprovalRequestRecord(callerTx as never, COMPANY_ADMIN as never, {
      ...EXPENSE_REQUEST,
      entityType: 'DPR',
      entityId: 'dpr_1',
      companyId: 'company_1',
      siteId: 'site_1',
    })

    expect(callerTx.approval.create).toHaveBeenCalledTimes(1)
    expect(callerTx.approvalTimeline.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ approvalId: 'approval_dpr', action: 'SUBMITTED' }),
    })
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.prisma.approval.create).not.toHaveBeenCalled()
    expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
  })
})
