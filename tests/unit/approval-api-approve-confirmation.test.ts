import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Route-level cover for the approve confirmation on `POST /api/approvals/[id]/approve`
 * and the legacy `POST /api/expenses/[id]/approve`.
 *
 * Both handlers used to inject the `APPROVE` token themselves, so any authorized POST —
 * even one with no body — satisfied the action's confirmation check. The routes must now
 * refuse a request that does not carry its own string `confirmationText` before the action
 * runs, and pass a supplied value through verbatim so the action stays the authority on
 * whether it matches.
 *
 * `approveApprovalAction` is wrapped in a spy that delegates to the real implementation,
 * so the call itself can be asserted while the hardened action still decides the outcome.
 */
const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    site: { findFirst: vi.fn() },
    approval: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    approvalTimeline: { create: vi.fn() },
    expense: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    salaryRun: { findFirst: vi.fn(), updateMany: vi.fn() },
    dailyProgressReport: { findFirst: vi.fn() },
    material: { findFirst: vi.fn() },
    document: { findFirst: vi.fn() },
    purchaseOrder: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  }

  // The interactive transaction client forwards to the shared delegates, so every write
  // lands on a delegate the no-write assertions inspect.
  const tx = {
    approval: {
      update: vi.fn((args: unknown) => prisma.approval.update(args)),
      updateMany: vi.fn((args: unknown) => prisma.approval.updateMany(args)),
    },
    approvalTimeline: { create: vi.fn((args: unknown) => prisma.approvalTimeline.create(args)) },
    expense: {
      findFirst: vi.fn((args: unknown) => prisma.expense.findFirst(args)),
      updateMany: vi.fn((args: unknown) => prisma.expense.updateMany(args)),
    },
    salaryRun: {
      findFirst: vi.fn((args: unknown) => prisma.salaryRun.findFirst(args)),
      updateMany: vi.fn((args: unknown) => prisma.salaryRun.updateMany(args)),
    },
    dailyProgressReport: { findFirst: vi.fn((args: unknown) => prisma.dailyProgressReport.findFirst(args)) },
    material: { findFirst: vi.fn((args: unknown) => prisma.material.findFirst(args)) },
    document: { findFirst: vi.fn((args: unknown) => prisma.document.findFirst(args)) },
    purchaseOrder: { findFirst: vi.fn((args: unknown) => prisma.purchaseOrder.findFirst(args)) },
    auditLog: { create: vi.fn((args: unknown) => prisma.auditLog.create(args)) },
  }

  return {
    auth: vi.fn(),
    requireUser: vi.fn(),
    requireModuleEnabled: vi.fn(),
    hasPermission: vi.fn(),
    revalidatePath: vi.fn(),
    logActivity: vi.fn(),
    syncSiteBudget: vi.fn(),
    approveApprovalAction: vi.fn(),
    prisma,
    tx,
  }
})

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/auth/require-module', () => ({ requireModuleEnabled: mocks.requireModuleEnabled }))
vi.mock('@/lib/permissions', () => ({ hasPermission: mocks.hasPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('@/lib/budget', () => ({ syncSiteBudget: mocks.syncSiteBudget }))
vi.mock('@/actions/approvals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/actions/approvals')>()
  mocks.approveApprovalAction.mockImplementation(actual.approveApprovalAction)
  return { ...actual, approveApprovalAction: mocks.approveApprovalAction }
})

const { POST: approveApproval } = await import('@/app/api/approvals/[id]/approve/route')
const { POST: approveExpense } = await import('@/app/api/expenses/[id]/approve/route')
const actualApprovals = await vi.importActual<typeof import('@/actions/approvals')>('@/actions/approvals')

const COMPANY_ADMIN = {
  id: 'admin_1',
  name: 'Admin',
  email: 'admin@acme.test',
  role: 'COMPANY_ADMIN',
  companyId: 'company_1',
}

const SAFE_REFUSAL = { error: 'Approval confirmation is required' }

type Route = {
  name: string
  handler: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>
  url: string
  id: string
  approvalId: string
}

const ROUTES: Route[] = [
  {
    name: 'POST /api/approvals/[id]/approve',
    handler: approveApproval,
    url: 'http://localhost/api/approvals/approval_1/approve',
    id: 'approval_1',
    approvalId: 'approval_1',
  },
  {
    name: 'POST /api/expenses/[id]/approve',
    handler: approveExpense,
    url: 'http://localhost/api/expenses/expense_1/approve',
    id: 'expense_1',
    approvalId: 'approval_1',
  },
]

/** A POST with a raw body string, or with no body at all when `raw` is undefined. */
function rawRequest(url: string, raw?: string) {
  if (raw === undefined) return new Request(url, { method: 'POST' })
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw })
}

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

/** No approval, timeline, linked entity or audit write may happen. */
function expectNoWrites() {
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.update).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
  expect(mocks.prisma.expense.update).not.toHaveBeenCalled()
  expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.salaryRun.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.$executeRaw).not.toHaveBeenCalled()
  expect(mocks.prisma.$executeRawUnsafe).not.toHaveBeenCalled()
  expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
  expect(mocks.logActivity).not.toHaveBeenCalled()
  expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.approveApprovalAction.mockImplementation(actualApprovals.approveApprovalAction)
  mocks.auth.mockResolvedValue({ user: { id: 'admin_1', role: 'COMPANY_ADMIN', companyId: 'company_1' } })
  mocks.requireUser.mockResolvedValue(COMPANY_ADMIN)
  mocks.requireModuleEnabled.mockResolvedValue(undefined)
  mocks.hasPermission.mockReturnValue(true)
  mocks.prisma.$transaction.mockImplementation(
    async (run: (client: typeof mocks.tx) => unknown) => run(mocks.tx)
  )
  mocks.prisma.site.findFirst.mockResolvedValue({ id: 'site_1', companyId: 'company_1' })
  mocks.prisma.expense.findFirst.mockResolvedValue({
    id: 'expense_1',
    companyId: 'company_1',
    siteId: 'site_1',
    billAttachments: [],
  })
  mocks.prisma.expense.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.approval.findMany.mockResolvedValue([{ id: 'approval_1', currentStatus: 'PENDING' }])
  mocks.prisma.approval.findFirst.mockResolvedValue({
    id: 'approval_1',
    companyId: 'company_1',
    siteId: 'site_1',
    currentStatus: 'PENDING',
    entityType: 'EXPENSE',
    entityId: 'expense_1',
    title: 'Site expense',
    site: { companyId: 'company_1', deletedAt: null },
  })
  mocks.prisma.approval.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.approvalTimeline.create.mockResolvedValue({ id: 'timeline_1' })
  mocks.prisma.auditLog.create.mockResolvedValue({ id: 'audit_1' })
})

const REFUSED_BODIES: Array<[string, string | undefined]> = [
  ['no body at all', undefined],
  ['an empty body', ''],
  ['a whitespace-only body', '   '],
  ['malformed JSON', '{"confirmationText": "APPROVE"'],
  ['a JSON array', '["APPROVE"]'],
  ['an array carrying the key', '[{"confirmationText":"APPROVE"}]'],
  ['JSON null', 'null'],
  ['a bare JSON string', '"APPROVE"'],
  ['a bare JSON number', '1'],
  ['an empty object', '{}'],
  ['a note without confirmation', '{"note":"looks fine"}'],
  ['a differently named key', '{"confirmation":"APPROVE"}'],
  ['a null confirmation', '{"confirmationText":null}'],
  ['a boolean confirmation', '{"confirmationText":true}'],
  ['an array confirmation', '{"confirmationText":["APPROVE"]}'],
  ['an object confirmation', '{"confirmationText":{"value":"APPROVE"}}'],
]

describe.each(ROUTES)('$name requires a caller supplied confirmation', (route) => {
  it.each(REFUSED_BODIES)('refuses %s before the approval action runs', async (_label, raw) => {
    const response = await route.handler(rawRequest(route.url, raw), routeParams(route.id))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual(SAFE_REFUSAL)
    expect(mocks.approveApprovalAction).not.toHaveBeenCalled()
    expect(mocks.prisma.approval.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.approval.findMany).not.toHaveBeenCalled()
    expect(mocks.prisma.expense.findFirst).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('still answers an unauthenticated caller with the generic 401, whatever the body', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    const response = await route.handler(rawRequest(route.url), routeParams(route.id))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(mocks.approveApprovalAction).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it.each(['approve', 'Approve', 'YES', 'APPROVED', '', '   '])(
    'passes a wrong confirmation %j to the action, which refuses it without writes',
    async (confirmationText) => {
      const response = await route.handler(
        rawRequest(route.url, JSON.stringify({ confirmationText })),
        routeParams(route.id)
      )

      expect(mocks.approveApprovalAction).toHaveBeenCalledTimes(1)
      expect(mocks.approveApprovalAction).toHaveBeenCalledWith(route.approvalId, undefined, confirmationText)
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: 'Approval confirmation text must exactly match APPROVE',
      })
      expectNoWrites()
    }
  )

  it('passes an explicit APPROVE through verbatim and approves', async () => {
    const response = await route.handler(
      rawRequest(route.url, JSON.stringify({ confirmationText: 'APPROVE', note: 'Checked against bill' })),
      routeParams(route.id)
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ success: true }))
    expect(mocks.approveApprovalAction).toHaveBeenCalledTimes(1)
    expect(mocks.approveApprovalAction).toHaveBeenCalledWith(route.approvalId, 'Checked against bill', 'APPROVE')
    expect(mocks.tx.approval.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.tx.approvalTimeline.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.auditLog.create).toHaveBeenCalledTimes(1)
  })

  it('does not reveal internal details when the action fails unexpectedly', async () => {
    mocks.approveApprovalAction.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'))

    const response = await route.handler(
      rawRequest(route.url, JSON.stringify({ confirmationText: 'APPROVE' })),
      routeParams(route.id)
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Approval request could not be processed' })
  })
})
