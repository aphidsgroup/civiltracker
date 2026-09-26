import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate, matchesWhere } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for the cross-bound approval found at f3c09f6.
 *
 * `Approval.companyId` and `Approval.siteId` are independent columns. A legacy row can be
 * stamped company_1 while pinned to `site_other`, a perfectly live site of company_2, and
 * its linked expense can carry the same (company_1, site_other) pair. The main approval
 * paths only asked "is the site live?", never "is it the approval company's site?", so
 * that row was listed, counted, detailed, commented on, approved, rejected and paid.
 *
 * Every non-PURCHASE_ORDER approval must now sit on a live site whose companyId equals
 * approval.companyId before it is returned, counted, commented or transitioned — for a
 * tenant principal and for a SUPER_ADMIN whose reads span every company. A denial must
 * leave no timeline entry, no comment, no audit record, no entity write and no budget
 * sync behind it.
 *
 * `@/lib/permissions` is NOT mocked. The Prisma delegates run on an in-memory `where`
 * evaluator and hand back rows with their `site` relation embedded, the way a Prisma
 * `include`/`select` of the site would.
 */
const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    site: { findFirst: vi.fn() },
    approval: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    approvalTimeline: { create: vi.fn() },
    approvalComment: { create: vi.fn() },
    expense: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    salaryRun: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    dailyProgressReport: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    material: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    document: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    purchaseOrder: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  }

  const forward = (target: { findFirst: (a: unknown) => unknown; updateMany: (a: unknown) => unknown }) => ({
    findFirst: vi.fn((args: unknown) => target.findFirst(args)),
    updateMany: vi.fn((args: unknown) => target.updateMany(args)),
  })

  const tx = {
    approval: { updateMany: vi.fn((args: unknown) => prisma.approval.updateMany(args)) },
    approvalTimeline: { create: vi.fn((args: unknown) => prisma.approvalTimeline.create(args)) },
    expense: forward(prisma.expense),
    salaryRun: forward(prisma.salaryRun),
    dailyProgressReport: forward(prisma.dailyProgressReport),
    material: forward(prisma.material),
    document: forward(prisma.document),
    purchaseOrder: forward(prisma.purchaseOrder),
  }

  return {
    requireUser: vi.fn(),
    requireModuleEnabled: vi.fn(),
    revalidatePath: vi.fn(),
    logActivity: vi.fn(),
    syncSiteBudget: vi.fn(),
    prisma,
    tx,
  }
})

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/auth/require-module', () => ({ requireModuleEnabled: mocks.requireModuleEnabled }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('@/lib/budget', () => ({ syncSiteBudget: mocks.syncSiteBudget }))

const {
  getApprovalsAction,
  getApprovalStatsAction,
  getApprovalByIdAction,
  approveApprovalAction,
  rejectApprovalAction,
  markApprovalPaidAction,
  addApprovalCommentAction,
} = await import('@/actions/approvals')
const { APPROVAL_DETAIL_NOT_FOUND } = await import('@/lib/approvals/detail')
const { approvalSiteScopeFilter, hasExactApprovalSiteBinding } = await import('@/lib/approvals/site-binding')
const { countValidApprovals } = await import('@/lib/approvals/valid-reads')
const { GET: listApprovalsRoute } = await import('@/app/api/approvals/route')
const { GET: detailApprovalRoute } = await import('@/app/api/approvals/[id]/route')
const { POST: approveApprovalRoute } = await import('@/app/api/approvals/[id]/approve/route')
const { POST: rejectApprovalRoute } = await import('@/app/api/approvals/[id]/reject/route')

// ---------------------------------------------------------------------------------------
// Fixture world: company_1 owns site_1, company_2 owns site_other.
// ---------------------------------------------------------------------------------------

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', deletedAt: null },
  { id: 'site_other', companyId: 'company_2', deletedAt: null },
]

function approval(id: string, overrides: Row = {}): Row {
  const row: Row = {
    id,
    companyId: 'company_1',
    siteId: 'site_1',
    entityType: 'EXPENSE',
    entityId: 'expense_1',
    currentStatus: 'PENDING',
    priority: 'NORMAL',
    amount: 100,
    title: id,
    approvedAt: null,
    submittedAt: new Date('2026-09-20T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  }
  row.site = SITES.find((site) => site.id === row.siteId) ?? null
  return row
}

const NOW = new Date()

/** Every cross-bound row: company_1 on the live site of company_2. */
const CROSS_BOUND: Row[] = [
  approval('x_expense', { siteId: 'site_other', entityId: 'expense_forged', amount: 5000, priority: 'URGENT' }),
  approval('x_bill', { siteId: 'site_other', entityType: 'BILL', entityId: 'expense_forged', amount: 6000 }),
  approval('x_dpr', { siteId: 'site_other', entityType: 'DPR', entityId: 'dpr_forged' }),
  approval('x_salary', { siteId: 'site_other', entityType: 'SALARY_RUN', entityId: 'salary_forged', amount: 7000 }),
  approval('x_material', { siteId: 'site_other', entityType: 'MATERIAL_REQUEST', entityId: 'material_forged' }),
  approval('x_document', { siteId: 'site_other', entityType: 'DOCUMENT', entityId: 'document_forged' }),
  // Even the company-level type may not be pinned to another tenant's site.
  approval('x_po_pinned', { siteId: 'site_other', entityType: 'PURCHASE_ORDER', entityId: 'po_1', amount: 8000 }),
  approval('x_approved', {
    siteId: 'site_other',
    entityId: 'expense_forged',
    currentStatus: 'APPROVED',
    approvedAt: NOW,
    amount: 9000,
  }),
]

const VALID: Row[] = [
  approval('ok_expense', { amount: 100 }),
  approval('ok_po', { siteId: null, entityType: 'PURCHASE_ORDER', entityId: 'po_1', amount: 200 }),
  approval('ok_po_pinned', { siteId: 'site_1', entityType: 'PURCHASE_ORDER', entityId: 'po_1', amount: 300 }),
  approval('ok_approved', { currentStatus: 'APPROVED', approvedAt: NOW, amount: 400 }),
  approval('ok_other_tenant', { companyId: 'company_2', siteId: 'site_other', entityId: 'expense_c2', amount: 500 }),
]

const APPROVALS: Row[] = [...VALID, ...CROSS_BOUND]

// The forged entities agree with the approval on (company_1, site_other), so the entity
// check alone admits them: only the approval → site → company binding can refuse.
const ENTITIES: Record<string, Row[]> = {
  expense: [
    { id: 'expense_1', companyId: 'company_1', siteId: 'site_1', deletedAt: null, billAttachments: [] },
    { id: 'expense_forged', companyId: 'company_1', siteId: 'site_other', deletedAt: null, billAttachments: [] },
    { id: 'expense_c2', companyId: 'company_2', siteId: 'site_other', deletedAt: null, billAttachments: [] },
  ],
  dailyProgressReport: [{ id: 'dpr_forged', companyId: 'company_1', siteId: 'site_other' }],
  salaryRun: [{ id: 'salary_forged', companyId: 'company_1', siteId: 'site_other', items: [] }],
  material: [{ id: 'material_forged', companyId: 'company_1', siteId: 'site_other' }],
  document: [{ id: 'document_forged', companyId: 'company_1', siteId: 'site_other' }],
  purchaseOrder: [{ id: 'po_1', companyId: 'company_1' }],
}

const ENTITY_DELEGATES = ['expense', 'salaryRun', 'dailyProgressReport', 'material', 'document', 'purchaseOrder'] as const

const siteRelation = (row: Row, key: string) => {
  if (key !== 'site') return undefined
  return SITES.find((site) => site.id === row.siteId) ?? null
}

const COMPANY_ADMIN = { id: 'admin_1', name: 'Admin', email: 'admin@acme.test', role: 'COMPANY_ADMIN', companyId: 'company_1' }
const SUPER_ADMIN = { id: 'root_1', name: 'Root', email: 'root@platform.test', role: 'SUPER_ADMIN' }
const PRINCIPALS = [
  ['COMPANY_ADMIN', COMPANY_ADMIN],
  ['SUPER_ADMIN', SUPER_ADMIN],
] as const

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function postRequest(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function ids(rows: Array<{ id: unknown }>) {
  return rows.map((row) => row.id as string).sort()
}

function expectNoMutation() {
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
  expect(mocks.prisma.approvalComment.create).not.toHaveBeenCalled()
  for (const name of ENTITY_DELEGATES) {
    expect(mocks.prisma[name].updateMany).not.toHaveBeenCalled()
  }
  expect(mocks.logActivity).not.toHaveBeenCalled()
  expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
  expect(mocks.revalidatePath).not.toHaveBeenCalled()
}

/** No linked-entity read happens for a row whose own binding is already refused. */
function expectNoEntityReads() {
  for (const name of ENTITY_DELEGATES) {
    expect(mocks.prisma[name].findFirst).not.toHaveBeenCalled()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue(COMPANY_ADMIN)
  mocks.requireModuleEnabled.mockResolvedValue(undefined)
  mocks.prisma.$transaction.mockImplementation(async (run: (client: typeof mocks.tx) => unknown) => run(mocks.tx))

  const approvals = inMemoryDelegate(APPROVALS, siteRelation)
  mocks.prisma.approval.findFirst.mockImplementation(approvals.findFirst)
  mocks.prisma.approval.findMany.mockImplementation(approvals.findMany)
  mocks.prisma.approval.updateMany.mockImplementation(approvals.updateMany)
  mocks.prisma.approvalTimeline.create.mockResolvedValue({ id: 'timeline_1' })
  mocks.prisma.approvalComment.create.mockResolvedValue({ id: 'comment_1' })

  for (const name of ENTITY_DELEGATES) {
    const store = inMemoryDelegate(ENTITIES[name])
    mocks.prisma[name].findFirst.mockImplementation(store.findFirst)
    mocks.prisma[name].findMany.mockImplementation(store.findMany)
    mocks.prisma[name].updateMany.mockImplementation(store.updateMany)
  }
})

// ---------------------------------------------------------------------------------------
// The shared helpers
// ---------------------------------------------------------------------------------------

describe('central approval site binding', () => {
  it('admits a site-bound row only on a loaded, live site of the approval company', () => {
    const base = { id: 'a', companyId: 'company_1', entityType: 'EXPENSE' as const, siteId: 'site_1' }

    expect(hasExactApprovalSiteBinding({ ...base, site: { companyId: 'company_1', deletedAt: null } })).toBe(true)
    expect(hasExactApprovalSiteBinding({ ...base, site: { companyId: 'company_2', deletedAt: null } })).toBe(false)
    expect(hasExactApprovalSiteBinding({ ...base, site: { companyId: 'company_1', deletedAt: new Date() } })).toBe(false)
    expect(hasExactApprovalSiteBinding({ ...base, site: null })).toBe(false)
    // Missing evidence is never a match.
    expect(hasExactApprovalSiteBinding(base)).toBe(false)
    expect(hasExactApprovalSiteBinding({ ...base, siteId: null })).toBe(false)
  })

  it('keeps the company-level PURCHASE_ORDER without a site, and holds a pinned one to the same rule', () => {
    const po = { id: 'p', companyId: 'company_1', entityType: 'PURCHASE_ORDER' as const }

    expect(hasExactApprovalSiteBinding({ ...po, siteId: null })).toBe(true)
    expect(hasExactApprovalSiteBinding({ ...po, siteId: 'site_1', site: { companyId: 'company_1', deletedAt: null } })).toBe(true)
    expect(hasExactApprovalSiteBinding({ ...po, siteId: 'site_other', site: { companyId: 'company_2', deletedAt: null } })).toBe(false)
  })

  it('excludes cross-bound rows at query level once the approval company is known', () => {
    const where = approvalSiteScopeFilter('company_1')
    const admitted = APPROVALS.filter((row) => matchesWhere(row, where, siteRelation))

    expect(ids(admitted)).not.toEqual(expect.arrayContaining(['x_expense']))
    for (const row of CROSS_BOUND) expect(matchesWhere(row, where, siteRelation)).toBe(false)
    for (const id of ['ok_expense', 'ok_po', 'ok_po_pinned', 'ok_approved']) {
      expect(ids(admitted)).toContain(id)
    }
  })
})

// ---------------------------------------------------------------------------------------
// Reads: list, stats, detail, REST
// ---------------------------------------------------------------------------------------

describe('cross-bound approvals are never read or counted', () => {
  it.each(PRINCIPALS)('drops every cross-bound row from the %s list', async (_label, user) => {
    mocks.requireUser.mockResolvedValue(user)

    const rows = await getApprovalsAction()

    for (const row of CROSS_BOUND) expect(ids(rows)).not.toContain(row.id)
    expect(ids(rows)).toEqual(expect.arrayContaining(['ok_expense', 'ok_po', 'ok_po_pinned', 'ok_approved']))
  })

  it('still lists every tenant for a SUPER_ADMIN, bound to each tenant own site', async () => {
    mocks.requireUser.mockResolvedValue(SUPER_ADMIN)

    const rows = await getApprovalsAction()

    expect(ids(rows)).toContain('ok_other_tenant')
  })

  it('scopes the tenant list query to sites of the caller company', async () => {
    await getApprovalsAction()

    const { where } = mocks.prisma.approval.findMany.mock.calls[0][0]
    for (const row of CROSS_BOUND) expect(matchesWhere(row, where, siteRelation)).toBe(false)
  })

  it.each(PRINCIPALS)('keeps cross-bound rows out of every %s stats figure', async (_label, user) => {
    mocks.requireUser.mockResolvedValue(user)

    const stats = await getApprovalStatsAction()

    // Valid company_1 open rows: ok_expense (100), ok_po (200), ok_po_pinned (300);
    // the SUPER_ADMIN also sees ok_other_tenant (500). ok_approved counts this week.
    const expectedPending = user.role === 'SUPER_ADMIN' ? 4 : 3
    const expectedAmount = user.role === 'SUPER_ADMIN' ? 1100 : 600
    expect(stats).toEqual({ pending: expectedPending, urgent: 0, approvedWeek: 1, pendingAmount: expectedAmount })
  })

  it.each(PRINCIPALS)('refuses the %s detail read of a cross-bound approval before any entity read', async (_label, user) => {
    mocks.requireUser.mockResolvedValue(user)

    for (const row of CROSS_BOUND) {
      await expect(getApprovalByIdAction(row.id as string)).rejects.toThrow(APPROVAL_DETAIL_NOT_FOUND)
    }
    expectNoEntityReads()
    expectNoMutation()
  })

  it.each(PRINCIPALS)('still details a valid approval and a company-level PO for %s', async (_label, user) => {
    mocks.requireUser.mockResolvedValue(user)

    await expect(getApprovalByIdAction('ok_expense')).resolves.toMatchObject({ approval: { id: 'ok_expense' } })
    await expect(getApprovalByIdAction('ok_po')).resolves.toMatchObject({ approval: { id: 'ok_po' } })
  })

  it('answers 404 on the REST detail and omits cross-bound rows from the REST list', async () => {
    mocks.requireUser.mockResolvedValue(SUPER_ADMIN)

    const detail = await detailApprovalRoute(new Request('http://test/api/approvals/x_expense'), routeParams('x_expense'))
    expect(detail.status).toBe(404)
    expect(await detail.json()).toEqual({ error: APPROVAL_DETAIL_NOT_FOUND })

    const list = await listApprovalsRoute(new Request('http://test/api/approvals'))
    const body = (await list.json()) as { data: Array<{ id: string }> }
    for (const row of CROSS_BOUND) expect(ids(body.data)).not.toContain(row.id)
    expectNoMutation()
  })

  it('does not count a cross-bound approval in the shared valid-approval count', async () => {
    await expect(countValidApprovals({ currentStatus: 'PENDING' })).resolves.toBe(4)
  })
})

// ---------------------------------------------------------------------------------------
// Writes: comment, approve, reject, pay
// ---------------------------------------------------------------------------------------

describe('cross-bound approvals can never be commented on or transitioned', () => {
  it.each(PRINCIPALS)('refuses a %s comment without writing to the thread', async (_label, user) => {
    mocks.requireUser.mockResolvedValue(user)

    for (const row of CROSS_BOUND) {
      await expect(addApprovalCommentAction(row.id as string, 'hello')).rejects.toThrow(APPROVAL_DETAIL_NOT_FOUND)
    }
    expectNoEntityReads()
    expectNoMutation()
  })

  const OPEN_CROSS_BOUND = CROSS_BOUND.filter((row) => row.currentStatus === 'PENDING').map((row) => row.id as string)

  it.each(PRINCIPALS)('refuses a %s approval of every cross-bound type', async (_label, user) => {
    mocks.requireUser.mockResolvedValue(user)

    for (const id of OPEN_CROSS_BOUND) {
      await expect(approveApprovalAction(id, undefined, 'APPROVE')).rejects.toThrow(/approval not found/i)
    }
    expectNoEntityReads()
    expectNoMutation()
  })

  it.each(PRINCIPALS)('refuses a %s rejection of every cross-bound type', async (_label, user) => {
    mocks.requireUser.mockResolvedValue(user)

    for (const id of OPEN_CROSS_BOUND) {
      await expect(rejectApprovalAction(id, 'not valid')).rejects.toThrow(/approval not found/i)
    }
    expectNoEntityReads()
    expectNoMutation()
  })

  it.each(PRINCIPALS)('refuses a %s disbursement of an approved cross-bound row', async (_label, user) => {
    mocks.requireUser.mockResolvedValue(user)

    await expect(markApprovalPaidAction('x_approved', { mode: 'NEFT' }, 'PAID')).rejects.toThrow(/approval not found/i)
    expectNoEntityReads()
    expectNoMutation()
  })

  it('refuses the REST approve and reject of a cross-bound row', async () => {
    mocks.requireUser.mockResolvedValue(SUPER_ADMIN)

    const approved = await approveApprovalRoute(postRequest('http://test/api/approvals/x_expense/approve', {}), routeParams('x_expense'))
    const rejected = await rejectApprovalRoute(
      postRequest('http://test/api/approvals/x_expense/reject', { reason: 'not valid' }),
      routeParams('x_expense')
    )

    expect(approved.status).toBe(404)
    expect(rejected.status).toBe(404)
    expectNoMutation()
  })

  it('binds the conditional transition itself to a site of the approval company', async () => {
    // The read saw an exact binding, but by the time of the write the stored row is
    // cross-bound: the transition predicate must stop it before any timeline or entity write.
    mocks.prisma.approval.findFirst.mockResolvedValueOnce(
      approval('x_expense', { siteId: 'site_1', entityId: 'expense_1' })
    )
    mocks.prisma.approval.updateMany.mockImplementation(inMemoryDelegate(CROSS_BOUND, siteRelation).updateMany)

    await expect(approveApprovalAction('x_expense', undefined, 'APPROVE')).rejects.toThrow(/no longer processable/i)

    const { where } = mocks.prisma.approval.updateMany.mock.calls[0][0]
    expect(matchesWhere(approval('x_expense', { siteId: 'site_other' }), where, siteRelation)).toBe(false)
    expect(matchesWhere(approval('x_expense', { siteId: 'site_1' }), where, siteRelation)).toBe(true)
    expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
    expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
  })

  it.each(PRINCIPALS)('still lets %s approve a company-level PURCHASE_ORDER', async (_label, user) => {
    mocks.requireUser.mockResolvedValue(user)

    await expect(approveApprovalAction('ok_po', undefined, 'APPROVE')).resolves.toMatchObject({ currentStatus: 'APPROVED' })
    expect(mocks.prisma.approvalTimeline.create).toHaveBeenCalledTimes(1)
  })

  it('still lets a tenant approve a valid expense on its own site', async () => {
    await expect(approveApprovalAction('ok_expense', undefined, 'APPROVE')).resolves.toMatchObject({ currentStatus: 'APPROVED' })

    expect(mocks.prisma.expense.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.syncSiteBudget).toHaveBeenCalledWith('site_1')
  })
})
