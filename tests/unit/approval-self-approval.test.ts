import { beforeEach, describe, expect, it, vi } from 'vitest'
import { matchesWhere } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'

/**
 * Separation of duties on the transitions that confer a benefit on the requester.
 *
 * Every role that may approve an entity type — COMPANY_ADMIN for any, PURCHASE_MANAGER for
 * purchase orders and material requests, PROJECT_MANAGER for DPRs, documents and purchase
 * orders — is refused approving its own request, and every role that may disburse
 * (COMPANY_ADMIN, ACCOUNTANT) is refused marking its own request paid, while an
 * independent approver of the same role on the same row succeeds.
 *
 * The refusal is enforced twice: on the row loaded before the transaction, and as
 * `requestedById: { not: actor }` on the guarded transition write. A concurrent writer
 * that makes the actor the requester after the load (a stale read) is therefore still
 * refused by the write itself, with no timeline, linked entity or audit change.
 *
 * The delegates evaluate the real `where` over an in-memory store, and `$transaction`
 * rolls the store back when its callback throws. `@/lib/permissions`, the site-binding
 * helpers and `auditLogData` are real; only the principal, the module gate, revalidation
 * and the budget sync are mocked.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  logActivity: vi.fn(),
  syncSiteBudget: vi.fn(),
  prisma: {} as Record<string, unknown>,
}))

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/approvals/module-gate', () => ({ requireApprovalsModule: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('@/lib/budget', () => ({ syncSiteBudget: mocks.syncSiteBudget }))

const { approveApprovalAction, markApprovalPaidAction, rejectApprovalAction } = await import('@/actions/approvals')

const COMPANY = 'company_1'
const SITES: Row[] = [{ id: 'site_1', companyId: COMPANY, deletedAt: null }]

type Store = {
  approvals: Row[]
  expenses: Row[]
  linked: Record<'purchaseOrder' | 'material' | 'dailyProgressReport' | 'document', Row[]>
  timeline: Row[]
  audit: Row[]
}

function seed(): Store {
  return {
    approvals: [],
    expenses: [{ id: 'expense_1', companyId: COMPANY, siteId: 'site_1', deletedAt: null, approvalStatus: 'PENDING' }],
    linked: {
      purchaseOrder: [{ id: 'po_1', companyId: COMPANY, siteId: null }],
      material: [{ id: 'material_1', companyId: COMPANY, siteId: 'site_1' }],
      dailyProgressReport: [{ id: 'dpr_1', companyId: COMPANY, siteId: 'site_1' }],
      document: [{ id: 'document_1', companyId: COMPANY, siteId: 'site_1' }],
    },
    timeline: [],
    audit: [],
  }
}

let store: Store = seed()
/** A concurrent writer that commits after the action's read and before its transaction. */
let interleave: (() => void) | null = null

const relations: RelationResolver = (row, key) => {
  if (key === 'site') return row.siteId ? SITES.find((site) => site.id === row.siteId) ?? null : null
  return undefined
}

function apply(rows: Row[], where: Row, data: Row) {
  const matched = rows.filter((row) => matchesWhere(row, where, relations))
  for (const row of matched) Object.assign(row, data)
  return { count: matched.length }
}

const find = (rows: () => Row[]) => vi.fn(async (args: { where: Row }) => {
  const row = rows().find((candidate) => matchesWhere(candidate, args.where, relations))
  return row ? { id: row.id } : null
})

const tx = {
  approval: {
    updateMany: vi.fn(async (args: { where: Row; data: Row }) => apply(store.approvals, args.where, args.data)),
  },
  approvalTimeline: { create: vi.fn(async (args: { data: Row }) => (store.timeline.push(args.data), args.data)) },
  expense: {
    findFirst: find(() => store.expenses),
    updateMany: vi.fn(async (args: { where: Row; data: Row }) => apply(store.expenses, args.where, args.data)),
  },
  salaryRun: { findFirst: vi.fn(async () => null), updateMany: vi.fn(async () => ({ count: 0 })) },
  purchaseOrder: { findFirst: find(() => store.linked.purchaseOrder) },
  material: { findFirst: find(() => store.linked.material) },
  dailyProgressReport: { findFirst: find(() => store.linked.dailyProgressReport) },
  document: { findFirst: find(() => store.linked.document) },
  auditLog: { create: vi.fn(async (args: { data: Row }) => (store.audit.push(args.data), args.data)) },
}

Object.assign(mocks.prisma, {
  approval: {
    // The transition's pre-transaction load, with its site binding included.
    findFirst: vi.fn(async (args: { where: Row }) => {
      const row = store.approvals.find((candidate) => matchesWhere(candidate, args.where, relations))
      return row ? { ...structuredClone(row), site: relations(row, 'site') } : null
    }),
  },
  $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => {
    const concurrent = interleave
    interleave = null
    concurrent?.()
    const snapshot = structuredClone(store)
    try {
      return await fn(tx)
    } catch (error) {
      store = snapshot
      throw error
    }
  }),
})

const $transaction = mocks.prisma.$transaction as ReturnType<typeof vi.fn>

function as(id: string, role: string) {
  mocks.requireUser.mockResolvedValue({ id, name: role, email: `${id}@acme.test`, role, companyId: COMPANY })
}

const ENTITY: Record<string, { entityId: string; siteId: string | null }> = {
  EXPENSE: { entityId: 'expense_1', siteId: 'site_1' },
  PURCHASE_ORDER: { entityId: 'po_1', siteId: null },
  MATERIAL_REQUEST: { entityId: 'material_1', siteId: 'site_1' },
  DPR: { entityId: 'dpr_1', siteId: 'site_1' },
  DOCUMENT: { entityId: 'document_1', siteId: 'site_1' },
}

function addApproval(entityType: string, requestedById: string, currentStatus = 'PENDING') {
  const row = {
    id: 'approval_1',
    companyId: COMPANY,
    deletedAt: null,
    entityType,
    ...ENTITY[entityType],
    title: `${entityType} request`,
    currentStatus,
    requestedById,
    approvedById: null,
  }
  store.approvals.push(row)
  return row
}

const approval = () => store.approvals[0]

function snapshot() {
  return JSON.stringify(store)
}

function expectNothingWritten(before: string) {
  expect(snapshot()).toBe(before)
  expect(store.timeline).toEqual([])
  expect(store.audit).toEqual([])
  expect(mocks.logActivity).not.toHaveBeenCalled()
  expect(mocks.revalidatePath).not.toHaveBeenCalled()
  expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
}

const SELF = /cannot approve or disburse your own approval request/

beforeEach(() => {
  vi.clearAllMocks()
  store = seed()
  interleave = null
})

/** Every (role, entity type) the live role may approve. */
const APPROVE_CASES: Array<[string, string]> = [
  ['COMPANY_ADMIN', 'EXPENSE'],
  ['PURCHASE_MANAGER', 'PURCHASE_ORDER'],
  ['PURCHASE_MANAGER', 'MATERIAL_REQUEST'],
  ['PROJECT_MANAGER', 'DPR'],
  ['PROJECT_MANAGER', 'DOCUMENT'],
  ['PROJECT_MANAGER', 'PURCHASE_ORDER'],
]

describe.each(APPROVE_CASES)('approveApprovalAction: %s on a %s request', (role, entityType) => {
  it('refuses the requester before opening a transaction', async () => {
    addApproval(entityType, 'actor_1')
    as('actor_1', role)
    const before = snapshot()

    await expect(approveApprovalAction('approval_1', undefined, 'APPROVE')).rejects.toThrow(SELF)

    expect($transaction).not.toHaveBeenCalled()
    expect(tx.approval.updateMany).not.toHaveBeenCalled()
    expect(approval()).toMatchObject({ currentStatus: 'PENDING', approvedById: null })
    expectNothingWritten(before)
  })

  it('lets an independent approver of the same role approve the same row', async () => {
    addApproval(entityType, 'requester_1')
    as('approver_1', role)

    await expect(approveApprovalAction('approval_1', undefined, 'APPROVE'))
      .resolves.toEqual({ id: 'approval_1', currentStatus: 'APPROVED' })

    expect(approval()).toMatchObject({ currentStatus: 'APPROVED', approvedById: 'approver_1', requestedById: 'requester_1' })
    expect(store.timeline).toEqual([expect.objectContaining({ action: 'APPROVED', actorUserId: 'approver_1' })])
    expect(store.audit).toEqual([expect.objectContaining({ action: 'APPROVE', userId: 'approver_1', recordId: ENTITY[entityType].entityId })])
    expect(tx.approval.updateMany.mock.calls[0][0].where).toMatchObject({ requestedById: { not: 'approver_1' } })
  })

  it('refuses at the guarded write when the actor became the requester after the load', async () => {
    addApproval(entityType, 'requester_1')
    as('approver_1', role)
    // Committed between the pre-transaction read (which saw another requester) and the
    // transition: the stale read passes the early check, the write predicate does not.
    interleave = () => { approval().requestedById = 'approver_1' }

    await expect(approveApprovalAction('approval_1', undefined, 'APPROVE')).rejects.toThrow(/no longer processable/)

    expect(tx.approval.updateMany).toHaveBeenCalledTimes(1)
    expect(approval()).toMatchObject({ currentStatus: 'PENDING', approvedById: null, requestedById: 'approver_1' })
    expect(store.timeline).toEqual([])
    expect(store.audit).toEqual([])
    expect(store.expenses[0]).toMatchObject({ approvalStatus: 'PENDING' })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe('approveApprovalAction: the separation-of-duties check is not the only guard', () => {
  it('an approval already taken by a concurrent approver is not approved twice', async () => {
    addApproval('EXPENSE', 'requester_1')
    as('approver_1', 'COMPANY_ADMIN')
    interleave = () => Object.assign(approval(), { currentStatus: 'APPROVED', approvedById: 'approver_2' })

    await expect(approveApprovalAction('approval_1', undefined, 'APPROVE')).rejects.toThrow(/no longer processable/)

    expect(approval()).toMatchObject({ currentStatus: 'APPROVED', approvedById: 'approver_2' })
    expect(store.timeline).toEqual([])
    expect(store.audit).toEqual([])
    expect(store.expenses[0]).toMatchObject({ approvalStatus: 'PENDING' })
  })

  it('still lets the requester withdraw their own request by rejecting it', async () => {
    addApproval('EXPENSE', 'actor_1')
    as('actor_1', 'COMPANY_ADMIN')

    await expect(rejectApprovalAction('approval_1', 'Raised in error')).resolves.toEqual({ id: 'approval_1', currentStatus: 'REJECTED' })
    expect(approval()).toMatchObject({ currentStatus: 'REJECTED', approvedById: null })
  })
})

/** Every role that may disburse an expense. */
const DISBURSERS = ['COMPANY_ADMIN', 'ACCOUNTANT']

describe.each(DISBURSERS)('markApprovalPaidAction: %s on an approved expense', (role) => {
  it('refuses the requester before opening a transaction', async () => {
    addApproval('EXPENSE', 'actor_1', 'APPROVED')
    store.expenses[0].approvalStatus = 'APPROVED'
    as('actor_1', role)
    const before = snapshot()

    await expect(markApprovalPaidAction('approval_1', undefined, 'PAID')).rejects.toThrow(SELF)

    expect($transaction).not.toHaveBeenCalled()
    expect(approval()).toMatchObject({ currentStatus: 'APPROVED' })
    expect(store.expenses[0]).toMatchObject({ approvalStatus: 'APPROVED' })
    expectNothingWritten(before)
  })

  it('lets an independent disburser mark the same row paid', async () => {
    addApproval('EXPENSE', 'requester_1', 'APPROVED')
    store.expenses[0].approvalStatus = 'APPROVED'
    as('payer_1', role)

    await expect(markApprovalPaidAction('approval_1', undefined, 'PAID')).resolves.toEqual({ id: 'approval_1' })

    expect(approval()).toMatchObject({ currentStatus: 'PAID' })
    expect(store.expenses[0]).toMatchObject({ approvalStatus: 'PAID' })
    expect(store.audit).toEqual([expect.objectContaining({ action: 'PAID', userId: 'payer_1', recordId: 'expense_1' })])
    expect(tx.approval.updateMany.mock.calls[0][0].where).toMatchObject({ requestedById: { not: 'payer_1' } })
  })

  it('refuses at the guarded write when the actor became the requester after the load', async () => {
    addApproval('EXPENSE', 'requester_1', 'APPROVED')
    store.expenses[0].approvalStatus = 'APPROVED'
    as('payer_1', role)
    interleave = () => { approval().requestedById = 'payer_1' }

    await expect(markApprovalPaidAction('approval_1', undefined, 'PAID')).rejects.toThrow(/no longer approved/)

    expect(tx.approval.updateMany).toHaveBeenCalledTimes(1)
    expect(approval()).toMatchObject({ currentStatus: 'APPROVED', requestedById: 'payer_1' })
    expect(store.expenses[0]).toMatchObject({ approvalStatus: 'APPROVED' })
    expect(store.timeline).toEqual([])
    expect(store.audit).toEqual([])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe('markApprovalPaidAction: approving roles without a disbursement grant', () => {
  it.each(['PURCHASE_MANAGER', 'PROJECT_MANAGER'])('%s cannot disburse at all, own request or not', async (role) => {
    addApproval('PURCHASE_ORDER', 'requester_1', 'APPROVED')
    as('actor_1', role)

    await expect(markApprovalPaidAction('approval_1', undefined, 'PAID')).rejects.toThrow(/not authorized to disburse/)
    expect(mocks.prisma.approval.findFirst as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
  })
})
