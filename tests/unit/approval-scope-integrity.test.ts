import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regressions for four gaps found at f3bdc02:
 *
 *  1. createApprovalAction was public behind `requireUser` alone, so any active member —
 *     VENDOR, CLIENT, SUBCONTRACTOR, SUPERVISOR — could raise approval requests directly.
 *  2. addApprovalCommentAction carried no read permission and no entity-bound integrity,
 *     so a caller without `approvals.view` could probe approval existence and write into
 *     the thread of an approval whose linked entity is missing or cross-bound.
 *  3. The list and stats reads returned and counted well-formed rows whose linked entity
 *     is missing, owned by another company or sitting on another site.
 *  4. No approval path checked that the approval Site is still live, so an approval bound
 *     to a soft-deleted site stayed readable and actionable.
 *
 * `@/lib/permissions` is deliberately NOT mocked: the real role → permission matrix is
 * under test. The Prisma delegates are backed by an in-memory `where` evaluator, so a row
 * disappears only when the query that production code composes really excludes it.
 */
const mocks = vi.hoisted(() => {
  const delegate = () => ({
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  })

  const prisma = {
    $transaction: vi.fn(),
    site: { findFirst: vi.fn() },
    approval: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    approvalTimeline: { create: vi.fn() },
    approvalComment: { create: vi.fn() },
    expense: delegate(),
    salaryRun: delegate(),
    dailyProgressReport: delegate(),
    material: delegate(),
    document: delegate(),
    purchaseOrder: delegate(),
  }

  const forward = (target: { findFirst: (a: unknown) => unknown; updateMany: (a: unknown) => unknown }) => ({
    findFirst: vi.fn((args: unknown) => target.findFirst(args)),
    updateMany: vi.fn((args: unknown) => target.updateMany(args)),
  })

  const tx = {
    site: { findFirst: vi.fn((args: unknown) => prisma.site.findFirst(args)) },
    approval: {
      findFirst: vi.fn((args: unknown) => prisma.approval.findFirst(args)),
      updateMany: vi.fn((args: unknown) => prisma.approval.updateMany(args)),
    },
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
  createApprovalAction,
  getApprovalsAction,
  getApprovalStatsAction,
  getApprovalByIdAction,
  approveApprovalAction,
  rejectApprovalAction,
  markApprovalPaidAction,
  addApprovalCommentAction,
} = await import('@/actions/approvals')
const { APPROVAL_DETAIL_NOT_FOUND } = await import('@/lib/approvals/detail')
const { GET: listApprovals, POST: createApproval } = await import('@/app/api/approvals/route')
const { GET: detailApproval } = await import('@/app/api/approvals/[id]/route')
const { POST: approveApproval } = await import('@/app/api/approvals/[id]/approve/route')
const { POST: rejectApproval } = await import('@/app/api/approvals/[id]/reject/route')

// ---------------------------------------------------------------------------------------
// Fixture world
// ---------------------------------------------------------------------------------------

const DELETED_AT = new Date('2026-09-01T00:00:00Z')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', deletedAt: null },
  { id: 'site_2', companyId: 'company_1', deletedAt: null },
  { id: 'site_dead', companyId: 'company_1', deletedAt: DELETED_AT },
  { id: 'site_other', companyId: 'company_2', deletedAt: null },
]

const ENTITIES: Record<string, Row[]> = {
  expense: [
    { id: 'expense_1', companyId: 'company_1', siteId: 'site_1', deletedAt: null, billAttachments: [] },
    { id: 'expense_site2', companyId: 'company_1', siteId: 'site_2', deletedAt: null, billAttachments: [] },
    { id: 'expense_other', companyId: 'company_2', siteId: 'site_other', deletedAt: null, billAttachments: [] },
    { id: 'expense_deleted', companyId: 'company_1', siteId: 'site_1', deletedAt: DELETED_AT, billAttachments: [] },
    { id: 'expense_dead', companyId: 'company_1', siteId: 'site_dead', deletedAt: null, billAttachments: [] },
  ],
  dailyProgressReport: [{ id: 'dpr_1', companyId: 'company_1', siteId: 'site_1' }],
  salaryRun: [{ id: 'salary_1', companyId: 'company_1', siteId: 'site_1', items: [] }],
  material: [{ id: 'material_1', companyId: 'company_1', siteId: 'site_1' }],
  document: [{ id: 'document_1', companyId: 'company_1', siteId: 'site_1' }],
  purchaseOrder: [
    { id: 'po_1', companyId: 'company_1' },
    { id: 'po_other', companyId: 'company_2' },
  ],
}

function approval(id: string, overrides: Row = {}): Row {
  return {
    id,
    companyId: 'company_1',
    siteId: 'site_1',
    entityType: 'EXPENSE',
    entityId: 'expense_1',
    currentStatus: 'PENDING',
    priority: 'NORMAL',
    amount: 0,
    title: id,
    approvedAt: null,
    submittedAt: new Date('2026-09-20T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  }
}

const NOW = new Date()

const APPROVALS: Row[] = [
  // Valid rows — these must survive every read.
  approval('a_valid_expense', { amount: 100, priority: 'URGENT' }),
  approval('a_valid_po', { entityType: 'PURCHASE_ORDER', entityId: 'po_1', siteId: null, amount: 200 }),
  approval('a_valid_dpr_approved', {
    entityType: 'DPR',
    entityId: 'dpr_1',
    currentStatus: 'APPROVED',
    approvedAt: NOW,
    amount: 50,
  }),
  // Broken entity links — well-formed site binding, unreachable entity.
  approval('a_missing', { entityId: 'expense_missing', amount: 1000, priority: 'URGENT' }),
  approval('a_cross_company', { entityId: 'expense_other', amount: 2000 }),
  approval('a_wrong_site', { entityId: 'expense_site2', amount: 3000 }),
  approval('a_deleted_entity', { entityId: 'expense_deleted', amount: 4000 }),
  approval('a_po_other', { entityType: 'PURCHASE_ORDER', entityId: 'po_other', siteId: null, amount: 5000 }),
  approval('a_broken_approved', {
    entityType: 'DPR',
    entityId: 'dpr_missing',
    currentStatus: 'APPROVED',
    approvedAt: NOW,
  }),
  // Bound to a soft-deleted site.
  approval('a_dead_site', { siteId: 'site_dead', entityId: 'expense_dead', amount: 6000, priority: 'URGENT' }),
  approval('a_dead_site_po', { entityType: 'PURCHASE_ORDER', entityId: 'po_1', siteId: 'site_dead', amount: 7000 }),
  approval('a_dead_site_approved', {
    siteId: 'site_dead',
    entityId: 'expense_dead',
    currentStatus: 'APPROVED',
    approvedAt: NOW,
  }),
  // Another tenant's perfectly valid row.
  approval('a_other_tenant', { companyId: 'company_2', siteId: 'site_other', entityId: 'expense_other', amount: 9000 }),
]

const siteRelation = (row: Row, key: string) => {
  if (key !== 'site') return undefined
  return SITES.find((site) => site.id === row.siteId) ?? null
}

const VALID_COMPANY_1_IDS = ['a_valid_expense', 'a_valid_po', 'a_valid_dpr_approved']

function principal(role: string, companyId: string | undefined = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

const ROLES_WITHOUT_APPROVAL_ACCESS = ['VENDOR', 'CLIENT', 'SUBCONTRACTOR', 'SUPERVISOR'] as const

function postRequest(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

const ENTITY_DELEGATES = [
  'expense',
  'salaryRun',
  'dailyProgressReport',
  'material',
  'document',
  'purchaseOrder',
] as const

function expectNoReads() {
  expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.findMany).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.findUnique).not.toHaveBeenCalled()
  for (const name of ENTITY_DELEGATES) {
    expect(mocks.prisma[name].findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma[name].findMany).not.toHaveBeenCalled()
    expect(mocks.prisma[name].findUnique).not.toHaveBeenCalled()
  }
}

function expectNoWrites() {
  expect(mocks.prisma.approval.create).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.update).not.toHaveBeenCalled()
  expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
  expect(mocks.prisma.approvalComment.create).not.toHaveBeenCalled()
  expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.salaryRun.updateMany).not.toHaveBeenCalled()
  expect(mocks.logActivity).not.toHaveBeenCalled()
  expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
}

function ids(rows: Array<{ id: string }>) {
  return rows.map((row) => row.id).sort()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.requireModuleEnabled.mockResolvedValue(undefined)
  mocks.prisma.$transaction.mockImplementation(async (run: (client: typeof mocks.tx) => unknown) => run(mocks.tx))

  const approvals = inMemoryDelegate(APPROVALS, siteRelation)
  mocks.prisma.approval.findFirst.mockImplementation(approvals.findFirst)
  mocks.prisma.approval.findMany.mockImplementation(approvals.findMany)
  mocks.prisma.approval.count.mockImplementation(approvals.count)
  mocks.prisma.approval.updateMany.mockImplementation(approvals.updateMany)
  mocks.prisma.approval.create.mockResolvedValue({ id: 'approval_new' })
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)
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
// 1. createApprovalAction requires a live create permission
// ---------------------------------------------------------------------------------------

describe('createApprovalAction requires a live submit permission', () => {
  const EXPENSE_REQUEST = { siteId: 'site_1', entityType: 'EXPENSE', entityId: 'expense_1', title: 'Expense' } as const
  const PO_REQUEST = { entityType: 'PURCHASE_ORDER', entityId: 'po_1', title: 'Purchase order' } as const

  it.each(ROLES_WITHOUT_APPROVAL_ACCESS)(
    'denies an active same-company %s before any site, entity or approval read',
    async (role) => {
      mocks.requireUser.mockResolvedValue(principal(role))

      await expect(createApprovalAction(EXPENSE_REQUEST)).rejects.toThrow(/^Forbidden: .*approvals\.view/)
      await expect(createApprovalAction(PO_REQUEST)).rejects.toThrow(/^Forbidden: .*approvals\.view/)

      expectNoReads()
      expectNoWrites()
    }
  )

  it.each([
    ['ACCOUNTANT', 'EXPENSE', 'expense_1', 'expenses.create'],
    ['ACCOUNTANT', 'DPR', 'dpr_1', 'dpr.create'],
    ['PURCHASE_MANAGER', 'DPR', 'dpr_1', 'dpr.create'],
    ['SITE_ENGINEER', 'SALARY_RUN', 'salary_1', 'salary.generate'],
    ['SITE_ENGINEER', 'PURCHASE_ORDER', 'po_1', 'purchase.approve'],
    ['PROJECT_MANAGER', 'SALARY_RUN', 'salary_1', 'salary.generate'],
  ] as const)(
    'denies %s a %s request it has no authority to originate, before any read',
    async (role, entityType, entityId, permission) => {
      mocks.requireUser.mockResolvedValue(principal(role))

      await expect(
        createApprovalAction({ siteId: entityType === 'PURCHASE_ORDER' ? null : 'site_1', entityType, entityId, title: 'Request' })
      ).rejects.toThrow(new RegExp(`^Forbidden: .*${permission.replace('.', '\\.')}`))

      expectNoReads()
      expectNoWrites()
    }
  )

  it.each([
    ['SITE_ENGINEER', 'site_1', 'EXPENSE', 'expense_1'],
    ['SITE_ENGINEER', 'site_1', 'DPR', 'dpr_1'],
    ['PROJECT_MANAGER', 'site_1', 'MATERIAL_REQUEST', 'material_1'],
    ['PROJECT_MANAGER', 'site_1', 'DOCUMENT', 'document_1'],
    ['ACCOUNTANT', 'site_1', 'SALARY_RUN', 'salary_1'],
    ['PURCHASE_MANAGER', null, 'PURCHASE_ORDER', 'po_1'],
    ['COMPANY_ADMIN', 'site_1', 'BILL', 'expense_1'],
  ] as const)('lets an authorized %s raise a %s request bound to the resolved tenant', async (role, siteId, entityType, entityId) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    await createApprovalAction({ siteId, entityType, entityId, title: 'Request' })

    expect(mocks.prisma.approval.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 'company_1', siteId, entityType, entityId, requestedById: principal(role).id }),
      })
    )
    expect(mocks.prisma.approvalTimeline.create).toHaveBeenCalledTimes(1)
  })

  it('keeps the tenant/site entity binding for an authorized submitter', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    await expect(
      createApprovalAction({ siteId: 'site_1', entityType: 'EXPENSE', entityId: 'expense_site2', title: 'Wrong site' })
    ).rejects.toThrow(/entity not found or access denied/i)
    await expect(
      createApprovalAction({ siteId: 'site_1', entityType: 'EXPENSE', entityId: 'expense_other', title: 'Other tenant' })
    ).rejects.toThrow(/entity not found or access denied/i)
    await expect(
      createApprovalAction({ siteId: 'site_other', entityType: 'EXPENSE', entityId: 'expense_other', title: 'Other site' })
    ).rejects.toThrow(/site not found or access denied/i)

    expectNoWrites()
  })

  it.each(ROLES_WITHOUT_APPROVAL_ACCESS)('POST /api/approvals denies %s before any read', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    const response = await createApproval(postRequest('http://localhost/api/approvals', EXPENSE_REQUEST))

    expect(response.status).toBe(403)
    expectNoReads()
    expectNoWrites()
  })

  it('POST /api/approvals applies the entity-specific submit permission of the action', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))

    const response = await createApproval(postRequest('http://localhost/api/approvals', EXPENSE_REQUEST))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: expect.stringMatching(/expenses\.create/) })
    expectNoReads()
    expectNoWrites()
  })

  it('POST /api/approvals still creates for an authorized submitter', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    const response = await createApproval(postRequest('http://localhost/api/approvals', EXPENSE_REQUEST))

    expect(response.status).toBe(200)
    expect(mocks.prisma.approval.create).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------------------
// 2. addApprovalCommentAction requires approvals.view and an entity-bound approval
// ---------------------------------------------------------------------------------------

describe('addApprovalCommentAction requires read access and an entity-bound approval', () => {
  it.each(ROLES_WITHOUT_APPROVAL_ACCESS)(
    'denies %s before any approval query, identically for existing and missing approvals',
    async (role) => {
      mocks.requireUser.mockResolvedValue(principal(role))

      const existing = await addApprovalCommentAction('a_valid_expense', 'Probe').catch((error: Error) => error.message)
      const missing = await addApprovalCommentAction('no_such_approval', 'Probe').catch((error: Error) => error.message)

      expect(existing).toMatch(/approvals\.view/)
      expect(existing).toBe(missing)
      expectNoReads()
      expectNoWrites()
    }
  )

  it.each(['a_missing', 'a_cross_company', 'a_wrong_site', 'a_deleted_entity', 'a_po_other'])(
    'refuses %s generically, exactly like a missing approval, without writing a comment',
    async (approvalId) => {
      mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

      await expect(addApprovalCommentAction(approvalId, 'Note')).rejects.toThrow(APPROVAL_DETAIL_NOT_FOUND)
      await expect(addApprovalCommentAction('no_such_approval', 'Note')).rejects.toThrow(APPROVAL_DETAIL_NOT_FOUND)

      expectNoWrites()
      expect(mocks.revalidatePath).not.toHaveBeenCalled()
    }
  )

  it('refuses another tenant approval generically', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    await expect(addApprovalCommentAction('a_other_tenant', 'Note')).rejects.toThrow(APPROVAL_DETAIL_NOT_FOUND)

    expectNoWrites()
  })

  it.each([
    ['a_valid_expense', 'SITE_ENGINEER'],
    ['a_valid_po', 'PURCHASE_MANAGER'],
  ])('still comments on the entity-bound approval %s for an authorized %s', async (approvalId, role) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    const created = await addApprovalCommentAction(approvalId, '  Looks right  ')

    expect(created).toEqual({ id: 'comment_1' })
    expect(mocks.prisma.approvalComment.create).toHaveBeenCalledWith({
      data: { companyId: 'company_1', approvalId, userId: principal(role).id, comment: 'Looks right' },
    })
  })
})

// ---------------------------------------------------------------------------------------
// 3. List and stats only return/count approvals with a valid linked entity
// ---------------------------------------------------------------------------------------

describe('getApprovalsAction and getApprovalStatsAction only admit entity-bound approvals', () => {
  it('lists only approvals whose linked entity resolves under the approval company/site', async () => {
    const rows = await getApprovalsAction()

    expect(ids(rows)).toEqual([...VALID_COMPANY_1_IDS].sort())
  })

  it('keeps the filters working over the entity-bound set', async () => {
    const rows = await getApprovalsAction({ status: 'PENDING', entityType: 'EXPENSE', search: 'A_VALID' })

    expect(ids(rows)).toEqual(['a_valid_expense'])
  })

  it('resolves linked entities in one batched query per entity type, never per row', async () => {
    await getApprovalsAction()

    expect(mocks.prisma.expense.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.purchaseOrder.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.dailyProgressReport.findMany).toHaveBeenCalledTimes(1)
    for (const name of ENTITY_DELEGATES) {
      expect(mocks.prisma[name].findFirst).not.toHaveBeenCalled()
    }
  })

  it('checks each approval against its own company for a SUPER_ADMIN', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPER_ADMIN', undefined))

    const rows = await getApprovalsAction()

    expect(ids(rows)).toEqual([...VALID_COMPANY_1_IDS, 'a_other_tenant'].sort())
  })

  it('counts and sums only entity-bound approvals', async () => {
    const stats = await getApprovalStatsAction()

    // Open valid rows: a_valid_expense (100, URGENT) and a_valid_po (200).
    // Approved this week: a_valid_dpr_approved only.
    expect(stats).toEqual({ pending: 2, urgent: 1, approvedWeek: 1, pendingAmount: 300 })
  })

  it('keeps the PURCHASE_ORDER company-level exception explicit', async () => {
    const rows = await getApprovalsAction({ entityType: 'PURCHASE_ORDER' })

    // po_1 resolves company-wide with no site; po_other belongs to another company and a
    // PO pinned to a deleted site is refused.
    expect(ids(rows)).toEqual(['a_valid_po'])
    expect(mocks.prisma.purchaseOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ siteId: expect.anything() }) })
    )
  })

  it('lists and counts nothing extra through GET /api/approvals', async () => {
    const response = await listApprovals(new Request('http://localhost/api/approvals'))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(ids(body.data)).toEqual([...VALID_COMPANY_1_IDS].sort())
  })
})

// ---------------------------------------------------------------------------------------
// 4. Every approval path fails closed on a soft-deleted Site
// ---------------------------------------------------------------------------------------

describe('approvals bound to a soft-deleted site fail closed everywhere', () => {
  const DEAD_IDS = ['a_dead_site', 'a_dead_site_po', 'a_dead_site_approved']

  it('are absent from the list and the stats', async () => {
    const rows = await getApprovalsAction()
    const stats = await getApprovalStatsAction()

    expect(ids(rows)).not.toEqual(expect.arrayContaining([expect.stringMatching(/dead/)]))
    for (const id of DEAD_IDS) expect(ids(rows)).not.toContain(id)
    expect(stats.pendingAmount).toBe(300)
    expect(stats.urgent).toBe(1)
  })

  it.each(DEAD_IDS)('refuses the detail read of %s generically', async (id) => {
    await expect(getApprovalByIdAction(id)).rejects.toThrow(APPROVAL_DETAIL_NOT_FOUND)

    const response = await detailApproval(new Request(`http://localhost/api/approvals/${id}`), routeParams(id))
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: APPROVAL_DETAIL_NOT_FOUND })
  })

  it.each(DEAD_IDS)('refuses a comment on %s without writing', async (id) => {
    await expect(addApprovalCommentAction(id, 'Note')).rejects.toThrow(APPROVAL_DETAIL_NOT_FOUND)

    expectNoWrites()
  })

  it.each(['a_dead_site', 'a_dead_site_po'])('refuses to approve or reject %s with no transition, timeline or audit', async (id) => {
    await expect(approveApprovalAction(id, undefined, 'APPROVE')).rejects.toThrow(/approval not found/i)
    await expect(rejectApprovalAction(id, 'Out of scope')).rejects.toThrow(/approval not found/i)

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.prisma.approval.updateMany).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('refuses to mark an approval on a deleted site paid', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))

    await expect(markApprovalPaidAction('a_dead_site_approved', undefined, 'PAID')).rejects.toThrow(/approval not found/i)

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.prisma.approval.updateMany).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it.each([
    ['approve', () => approveApprovalAction('a_dead_site', undefined, 'APPROVE'), 'PENDING'],
    ['reject', () => rejectApprovalAction('a_dead_site', 'Out of scope'), 'PENDING'],
    ['mark paid', () => markApprovalPaidAction('a_dead_site_approved', undefined, 'PAID'), 'APPROVED'],
  ] as const)(
    'still refuses to %s when the site is deleted between the read and the transition',
    async (_verb, run, status) => {
      mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
      // The pre-transaction read raced ahead of the site deletion; the conditional
      // transition itself must carry the live-site predicate.
      const stale = APPROVALS.find((row) => row.siteId === 'site_dead' && row.currentStatus === status)!
      mocks.prisma.approval.findFirst.mockResolvedValueOnce({ ...stale })

      await expect(run()).rejects.toThrow(/no longer/i)

      expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
      expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
      expect(mocks.logActivity).not.toHaveBeenCalled()
      expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
    }
  )

  it.each(['a_dead_site', 'a_dead_site_po'])('the approve and reject REST delegates refuse %s without writes', async (id) => {
    const approve = await approveApproval(postRequest(`http://localhost/api/approvals/${id}/approve`, {}), routeParams(id))
    const reject = await rejectApproval(
      postRequest(`http://localhost/api/approvals/${id}/reject`, { reason: 'Out of scope' }),
      routeParams(id)
    )

    expect(approve.status).toBe(404)
    expect(reject.status).toBe(404)
    expectNoWrites()
  })

  it('refuses to create an approval on a deleted site, including a site-pinned purchase order', async () => {
    await expect(
      createApprovalAction({ siteId: 'site_dead', entityType: 'EXPENSE', entityId: 'expense_dead', title: 'Dead site' })
    ).rejects.toThrow(/site not found or access denied/i)
    await expect(
      createApprovalAction({ siteId: 'site_dead', entityType: 'PURCHASE_ORDER', entityId: 'po_1', title: 'Dead site PO' })
    ).rejects.toThrow(/site not found or access denied/i)

    const response = await createApproval(
      postRequest('http://localhost/api/approvals', {
        siteId: 'site_dead',
        entityType: 'EXPENSE',
        entityId: 'expense_dead',
        title: 'Dead site',
      })
    )
    expect(response.status).toBe(404)
    expectNoWrites()
  })
})
