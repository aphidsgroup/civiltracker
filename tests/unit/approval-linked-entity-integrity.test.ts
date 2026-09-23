import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Transition integrity for every supported approval entity type.
 *
 * `createApprovalAction` resolves the linked entity inside the approval tenant, but an
 * approval row that was written before that rule — or inserted straight into the
 * database — carries an `entityId` nobody ever checked. Approve, reject and disburse
 * only ever re-resolved EXPENSE/BILL and SALARY_RUN: for DPR, MATERIAL_REQUEST,
 * DOCUMENT and PURCHASE_ORDER the transition, the timeline entry and the audit record
 * were written against an entity that may be missing, owned by another company, or
 * sitting on another site of the same company.
 *
 * These tests require every supported type to be re-resolved on the transaction client,
 * under the approval's exact company and site binding, *before* the conditional
 * transition — so an unresolvable entity leaves no transition, no timeline row, no audit
 * trail and no revalidation. The linked status writes stay where they belong: Expense
 * and SalaryRun keep their own count-gated updates, and the types that carry no approval
 * status are resolved but never written.
 */
const mocks = vi.hoisted(() => {
  const entityDelegate = () => ({ findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() })

  const prisma = {
    $transaction: vi.fn(),
    approval: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    approvalTimeline: { create: vi.fn() },
    expense: entityDelegate(),
    salaryRun: entityDelegate(),
    dailyProgressReport: entityDelegate(),
    material: entityDelegate(),
    document: entityDelegate(),
    purchaseOrder: entityDelegate(),
  }

  // Every delegate on the interactive client forwards to the shared spy, so a read or
  // write issued on the global client instead of `tx` leaves `mocks.tx` untouched and
  // the "inside the transaction" assertions below fail.
  const forward = (delegate: ReturnType<typeof entityDelegate>) => ({
    findFirst: vi.fn((args: unknown) => delegate.findFirst(args)),
    update: vi.fn((args: unknown) => delegate.update(args)),
    updateMany: vi.fn((args: unknown) => delegate.updateMany(args)),
  })

  const tx = {
    approval: {
      update: vi.fn((args: unknown) => prisma.approval.update(args)),
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
    hasPermission: vi.fn(),
    revalidatePath: vi.fn(),
    logActivity: vi.fn(),
    syncSiteBudget: vi.fn(),
    prisma,
    tx,
  }
})

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/permissions', () => ({ hasPermission: mocks.hasPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('@/lib/budget', () => ({ syncSiteBudget: mocks.syncSiteBudget }))

const { approveApprovalAction, rejectApprovalAction, markApprovalPaidAction } = await import(
  '@/actions/approvals'
)

type Delegate = 'expense' | 'salaryRun' | 'dailyProgressReport' | 'material' | 'document' | 'purchaseOrder'

/** Entity types whose records only ever live under a single site. */
const SITE_BOUND_TYPES: ReadonlyArray<readonly [string, Delegate]> = [
  ['DPR', 'dailyProgressReport'],
  ['MATERIAL_REQUEST', 'material'],
  ['DOCUMENT', 'document'],
]

/** Site-bound types that own no approval status field of their own. */
const STATUSLESS_TYPES = SITE_BOUND_TYPES

const ALL_DELEGATES: Delegate[] = [
  'expense',
  'salaryRun',
  'dailyProgressReport',
  'material',
  'document',
  'purchaseOrder',
]

/** The three transitions, each with the confirmation token and status it demands. */
const TRANSITIONS = [
  {
    name: 'approve',
    openStatus: 'PENDING',
    run: (id: string) => approveApprovalAction(id, 'Looks good', 'APPROVE'),
  },
  {
    name: 'reject',
    openStatus: 'PENDING',
    run: (id: string) => rejectApprovalAction(id, 'Not budgeted'),
  },
  {
    name: 'markPaid',
    openStatus: 'APPROVED',
    run: (id: string) => markApprovalPaidAction(id, { mode: 'NEFT', ref: 'REF-1' }, 'PAID'),
  },
] as const

function approvalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'approval_1',
    companyId: 'company_1',
    siteId: 'site_1',
    currentStatus: 'PENDING',
    entityType: 'DPR',
    entityId: 'entity_1',
    title: 'Linked request',
    ...overrides,
  }
}

/** A refused transition may leave nothing at all behind. */
function expectNoTransitionAndNoTrace() {
  expect(mocks.prisma.approval.update).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
  expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.salaryRun.updateMany).not.toHaveBeenCalled()
  expect(mocks.logActivity).not.toHaveBeenCalled()
  expect(mocks.syncSiteBudget).not.toHaveBeenCalled()
  expect(mocks.revalidatePath).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({
    id: 'user_1',
    name: 'Admin',
    email: 'admin@acme.test',
    role: 'COMPANY_ADMIN',
    companyId: 'company_1',
  })
  mocks.hasPermission.mockReturnValue(true)
  mocks.prisma.$transaction.mockImplementation(
    async (run: (client: typeof mocks.tx) => unknown) => run(mocks.tx)
  )
  mocks.prisma.approval.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.approvalTimeline.create.mockResolvedValue({ id: 'timeline_1' })
  mocks.prisma.expense.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.salaryRun.updateMany.mockResolvedValue({ count: 1 })
  // Every delegate resolves by default, so the only thing that can stop a flow below is
  // the assertion under test.
  for (const delegate of ALL_DELEGATES) {
    mocks.prisma[delegate].findFirst.mockResolvedValue({ id: 'entity_1' })
  }
})

describe('every supported entity type is re-resolved inside the transaction', () => {
  for (const transition of TRANSITIONS) {
    describe(`${transition.name}`, () => {
      it.each(SITE_BOUND_TYPES)(
        'resolves a linked %s under the exact approval company and site',
        async (entityType, delegate) => {
          mocks.prisma.approval.findFirst.mockResolvedValue(
            approvalRow({ entityType, currentStatus: transition.openStatus })
          )

          await transition.run('approval_1')

          expect(mocks.tx[delegate].findFirst).toHaveBeenCalledWith({
            where: { id: 'entity_1', companyId: 'company_1', siteId: 'site_1' },
            select: { id: true },
          })
          // The global client must not be the one that resolved it.
          expect(mocks.prisma[delegate].findFirst).toHaveBeenCalledTimes(1)
        }
      )

      it('resolves a linked EXPENSE under company, site and the soft-delete predicate', async () => {
        mocks.prisma.approval.findFirst.mockResolvedValue(
          approvalRow({ entityType: 'EXPENSE', currentStatus: transition.openStatus })
        )

        await transition.run('approval_1')

        expect(mocks.tx.expense.findFirst).toHaveBeenCalledWith({
          where: { id: 'entity_1', companyId: 'company_1', siteId: 'site_1', deletedAt: null },
          select: { id: true },
        })
      })

      it('resolves a company level PURCHASE_ORDER by company and never widens to a site predicate', async () => {
        mocks.prisma.approval.findFirst.mockResolvedValue(
          approvalRow({ entityType: 'PURCHASE_ORDER', siteId: null, currentStatus: transition.openStatus })
        )

        await transition.run('approval_1')

        expect(mocks.tx.purchaseOrder.findFirst).toHaveBeenCalledWith({
          where: { id: 'entity_1', companyId: 'company_1' },
          select: { id: true },
        })
        const [call] = mocks.tx.purchaseOrder.findFirst.mock.calls as [[{ where: Record<string, unknown> }]]
        expect(call[0].where).not.toHaveProperty('siteId')
      })

      it('resolves the linked entity before the conditional transition, not after it', async () => {
        mocks.prisma.approval.findFirst.mockResolvedValue(
          approvalRow({ entityType: 'MATERIAL_REQUEST', currentStatus: transition.openStatus })
        )

        await transition.run('approval_1')

        const resolvedAt = mocks.tx.material.findFirst.mock.invocationCallOrder[0]
        const transitionedAt = mocks.tx.approval.updateMany.mock.invocationCallOrder[0]
        const timelinedAt = mocks.tx.approvalTimeline.create.mock.invocationCallOrder[0]
        expect(resolvedAt).toBeLessThan(transitionedAt)
        expect(resolvedAt).toBeLessThan(timelinedAt)
      })
    })
  }
})

describe('an unresolvable linked entity leaves no transition, timeline, audit or revalidation', () => {
  for (const transition of TRANSITIONS) {
    describe(`${transition.name}`, () => {
      it.each([
        ['DPR', 'dailyProgressReport'],
        ['MATERIAL_REQUEST', 'material'],
        ['DOCUMENT', 'document'],
      ] as ReadonlyArray<readonly [string, Delegate]>)(
        'refuses a %s that is missing or owned by another company',
        async (entityType, delegate) => {
          mocks.prisma.approval.findFirst.mockResolvedValue(
            approvalRow({ entityType, entityId: 'entity_of_another_company', currentStatus: transition.openStatus })
          )
          mocks.prisma[delegate].findFirst.mockResolvedValue(null)

          await expect(transition.run('approval_1')).rejects.toThrow(/not found in the approval tenant/i)

          expectNoTransitionAndNoTrace()
        }
      )

      it.each([
        ['DPR', 'dailyProgressReport'],
        ['MATERIAL_REQUEST', 'material'],
        ['DOCUMENT', 'document'],
      ] as ReadonlyArray<readonly [string, Delegate]>)(
        'refuses a same-company %s that sits on another site',
        async (entityType, delegate) => {
          mocks.prisma.approval.findFirst.mockResolvedValue(
            approvalRow({ entityType, entityId: 'entity_on_site_2', currentStatus: transition.openStatus })
          )
          // The record exists in the company but not under the approval site, so the
          // site-scoped predicate is what makes the lookup come back empty.
          mocks.prisma[delegate].findFirst.mockResolvedValue(null)

          await expect(transition.run('approval_1')).rejects.toThrow(/not found in the approval tenant/i)

          expect(mocks.tx[delegate].findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({ siteId: 'site_1', companyId: 'company_1' }),
            })
          )
          expectNoTransitionAndNoTrace()
        }
      )

      it('refuses a PURCHASE_ORDER that is missing or owned by another company', async () => {
        mocks.prisma.approval.findFirst.mockResolvedValue(
          approvalRow({
            entityType: 'PURCHASE_ORDER',
            siteId: null,
            entityId: 'po_of_another_company',
            currentStatus: transition.openStatus,
          })
        )
        mocks.prisma.purchaseOrder.findFirst.mockResolvedValue(null)

        await expect(transition.run('approval_1')).rejects.toThrow(/not found in the approval tenant/i)

        expectNoTransitionAndNoTrace()
      })

      it('refuses an EXPENSE that no longer resolves inside the approval tenant', async () => {
        mocks.prisma.approval.findFirst.mockResolvedValue(
          approvalRow({ entityType: 'EXPENSE', currentStatus: transition.openStatus })
        )
        mocks.prisma.expense.findFirst.mockResolvedValue(null)

        await expect(transition.run('approval_1')).rejects.toThrow(/not found in the approval tenant/i)

        expectNoTransitionAndNoTrace()
      })

      it('refuses a SALARY_RUN that no longer resolves inside the approval tenant', async () => {
        mocks.prisma.approval.findFirst.mockResolvedValue(
          approvalRow({ entityType: 'SALARY_RUN', currentStatus: transition.openStatus })
        )
        mocks.prisma.salaryRun.findFirst.mockResolvedValue(null)

        await expect(transition.run('approval_1')).rejects.toThrow(/not found in the approval tenant/i)

        expectNoTransitionAndNoTrace()
      })

      // VARIATION can no longer be requested, but a legacy row can still carry it and
      // no delegate owns it — an unmapped type must fail closed rather than transition.
      it('refuses an entity type that no delegate can resolve', async () => {
        mocks.prisma.approval.findFirst.mockResolvedValue(
          approvalRow({ entityType: 'VARIATION', currentStatus: transition.openStatus })
        )

        await expect(transition.run('approval_1')).rejects.toThrow(/not found in the approval tenant/i)

        expectNoTransitionAndNoTrace()
      })
    })
  }
})

describe('resolution does not invent status writes for types that carry none', () => {
  for (const transition of TRANSITIONS) {
    it.each(STATUSLESS_TYPES)(
      `${transition.name} resolves a linked %s and writes nothing to it`,
      async (entityType, delegate) => {
        mocks.prisma.approval.findFirst.mockResolvedValue(
          approvalRow({ entityType, currentStatus: transition.openStatus })
        )

        await transition.run('approval_1')

        expect(mocks.prisma[delegate].findFirst).toHaveBeenCalledTimes(1)
        expect(mocks.prisma[delegate].update).not.toHaveBeenCalled()
        expect(mocks.prisma[delegate].updateMany).not.toHaveBeenCalled()
        // The two delegates that do own an approval status stay untouched as well.
        expect(mocks.prisma.expense.updateMany).not.toHaveBeenCalled()
        expect(mocks.prisma.salaryRun.updateMany).not.toHaveBeenCalled()
        // The transition itself still happened.
        expect(mocks.prisma.approval.updateMany).toHaveBeenCalledTimes(1)
        expect(mocks.prisma.approvalTimeline.create).toHaveBeenCalledTimes(1)
        expect(mocks.logActivity).toHaveBeenCalledTimes(1)
      }
    )

    it(`${transition.name} resolves a PURCHASE_ORDER and writes nothing to it`, async () => {
      mocks.prisma.approval.findFirst.mockResolvedValue(
        approvalRow({ entityType: 'PURCHASE_ORDER', siteId: null, currentStatus: transition.openStatus })
      )

      await transition.run('approval_1')

      expect(mocks.prisma.purchaseOrder.update).not.toHaveBeenCalled()
      expect(mocks.prisma.purchaseOrder.updateMany).not.toHaveBeenCalled()
      expect(mocks.prisma.approval.updateMany).toHaveBeenCalledTimes(1)
    })
  }
})

describe('the entity specific status writes and count gates are preserved', () => {
  it('still gates the approved expense on exactly one matching row', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(approvalRow({ entityType: 'EXPENSE' }))
    mocks.prisma.expense.updateMany.mockResolvedValue({ count: 0 })

    await expect(approveApprovalAction('approval_1', undefined, 'APPROVE')).rejects.toThrow(
      /linked expense not found/i
    )

    expect(mocks.tx.expense.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entity_1', companyId: 'company_1', deletedAt: null, siteId: 'site_1' },
        data: expect.objectContaining({ approvalStatus: 'APPROVED' }),
      })
    )
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })

  it('still gates the rejected salary run on exactly one matching row', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(
      approvalRow({ entityType: 'SALARY_RUN', entityId: 'salary_1' })
    )
    mocks.prisma.salaryRun.findFirst.mockResolvedValue({ id: 'salary_1' })
    mocks.prisma.salaryRun.updateMany.mockResolvedValue({ count: 0 })

    await expect(rejectApprovalAction('approval_1', 'Headcount mismatch')).rejects.toThrow(
      /linked salary run not found/i
    )

    expect(mocks.tx.salaryRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'salary_1', companyId: 'company_1', siteId: 'site_1' },
        data: { status: 'DRAFT' },
      })
    )
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })

  it('still gates the disbursed expense on exactly one matching row', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(
      approvalRow({ entityType: 'BILL', currentStatus: 'APPROVED' })
    )
    mocks.prisma.expense.updateMany.mockResolvedValue({ count: 2 })

    await expect(markApprovalPaidAction('approval_1', undefined, 'PAID')).rejects.toThrow(
      /linked expense not found/i
    )

    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('completes a BILL approval through the expense delegate after resolution', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(approvalRow({ entityType: 'BILL' }))

    await approveApprovalAction('approval_1', undefined, 'APPROVE')

    expect(mocks.tx.expense.findFirst).toHaveBeenCalledTimes(1)
    expect(mocks.tx.expense.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.syncSiteBudget).toHaveBeenCalledWith('site_1')
  })
})
