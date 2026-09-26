import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Assigned-site mutation scope for every path that records an expense/bill or raises an
 * approval request: `createExpenseAction` (direct Server Action), `POST /api/expenses`
 * and `createApprovalAction` → `submitApprovalRequest`, which all bind their site through
 * `findApprovalSubmitSite`.
 *
 * That lookup only bound the site to the caller's company and refused a soft-deleted one,
 * so a SITE_ENGINEER could record an expense, attach a bill and raise an approval (with
 * its timeline) on any site of the company. A field role (SITE_ENGINEER / SUPERVISOR) is
 * now limited to its `assignedSiteScope` — sites it is the assigned engineer of, or that
 * its *active* membership lists — and is refused before any write, bill link, approval or
 * timeline. Privileged roles keep acting on every live site of exactly their company.
 *
 * The permission matrix is real; `hasPermission` is wrapped only so a test can grant a
 * SUPERVISOR the submit permissions it lacks, to prove the policy is role-based.
 */
const mocks = vi.hoisted(() => {
  const tx = {
    mediaAsset: { findFirst: vi.fn() },
    billAttachment: { findFirst: vi.fn() },
    expense: { create: vi.fn() },
    approval: { create: vi.fn() },
    approvalTimeline: { create: vi.fn() },
  }
  return {
    requireUser: vi.fn(),
    hasPermission: vi.fn(),
    extraGrants: new Set<string>(),
    logActivity: vi.fn(),
    tx,
    prisma: {
      $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
      company: { findUnique: vi.fn() },
      companyMember: { findFirst: vi.fn() },
      site: { findFirst: vi.fn() },
      expense: { findFirst: vi.fn() },
      purchaseOrder: { findFirst: vi.fn() },
      approval: { create: vi.fn() },
      approvalTimeline: { create: vi.fn() },
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/permissions')>()
  mocks.hasPermission.mockImplementation(
    (role: string, permission: string) =>
      mocks.extraGrants.has(`${role}:${permission}`) || actual.hasPermission(role as never, permission as never)
  )
  return { ...actual, hasPermission: mocks.hasPermission }
})

const { createExpenseAction } = await import('@/actions/expense')
const { POST } = await import('@/app/api/expenses/route')
const { createApprovalAction } = await import('@/actions/approvals')

const SITES: Row[] = [
  // Assigned through `Site.assignedEngineerId` only; no membership entry.
  { id: 'site_engineer', companyId: 'company_1', name: 'Engineer site', deletedAt: null, assignedEngineerId: 'user_field', engineerId: null },
  // Assigned through `CompanyMember.siteIds` only.
  { id: 'site_listed', companyId: 'company_1', name: 'Listed site', deletedAt: null, assignedEngineerId: null, engineerId: null },
  { id: 'site_theirs', companyId: 'company_1', name: 'Unassigned site', deletedAt: null, assignedEngineerId: 'someone_else', engineerId: null },
  { id: 'site_dead', companyId: 'company_1', name: 'Deleted site', deletedAt: new Date('2026-01-01'), assignedEngineerId: 'user_field', engineerId: null },
  { id: 'site_other', companyId: 'company_2', name: 'Other tenant', deletedAt: null, assignedEngineerId: 'user_field', engineerId: null },
]

const EXPENSES: Row[] = SITES.map((site) => ({
  id: `expense_on_${site.id}`,
  companyId: site.companyId,
  siteId: site.id,
  deletedAt: null,
  billAttachments: [],
}))

let members: Row[]

function principal(role: string, companyId: string | null = 'company_1') {
  return { id: 'user_field', name: role, email: 'field@acme.test', role, companyId }
}

const EXPENSE_INPUT = { amount: 500, category: 'MATERIAL' as const, paymentMode: 'CASH' as const, notes: 'Cement' }

function postExpense(siteId: string) {
  return POST(
    new Request('https://app.test/api/expenses', {
      method: 'POST',
      body: JSON.stringify({ siteId, category: 'MATERIAL', description: 'Cement bags', amount: 500 }),
    })
  )
}

function submitExpenseApproval(siteId: string) {
  return createApprovalAction({ siteId, entityType: 'EXPENSE', entityId: `expense_on_${siteId}`, title: 'Cement' })
}

function expectNoWrites() {
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  expect(mocks.tx.mediaAsset.findFirst).not.toHaveBeenCalled()
  expect(mocks.tx.billAttachment.findFirst).not.toHaveBeenCalled()
  expect(mocks.tx.expense.create).not.toHaveBeenCalled()
  expect(mocks.tx.approval.create).not.toHaveBeenCalled()
  expect(mocks.tx.approvalTimeline.create).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.create).not.toHaveBeenCalled()
  expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
  expect(mocks.logActivity).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.extraGrants.clear()
  for (const permission of ['expenses.create', 'bills.upload', 'approvals.view']) {
    mocks.extraGrants.add(`SUPERVISOR:${permission}`)
  }
  members = [{ userId: 'user_field', companyId: 'company_1', isActive: true, siteIds: ['site_listed'] }]
  mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
  mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['EXPENSES', 'APPROVALS'], status: 'ACTIVE' })
  mocks.prisma.companyMember.findFirst.mockImplementation((args) => inMemoryDelegate(members).findFirst(args))
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)
  mocks.prisma.expense.findFirst.mockImplementation(inMemoryDelegate(EXPENSES).findFirst)
  mocks.tx.mediaAsset.findFirst.mockResolvedValue(null)
  mocks.tx.billAttachment.findFirst.mockResolvedValue(null)
  mocks.tx.expense.create.mockImplementation(async ({ data }: { data: Row }) => ({ id: 'expense_new', ...data }))
  mocks.tx.approval.create.mockImplementation(async ({ data }: { data: Row }) => ({ id: 'approval_new', ...data }))
  mocks.tx.approvalTimeline.create.mockResolvedValue({ id: 'timeline_new' })
})

describe.each(['SITE_ENGINEER', 'SUPERVISOR'])('%s assigned-site mutation scope', (role) => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue(principal(role))
  })

  describe('createExpenseAction (direct Server Action)', () => {
    it.each(['site_engineer', 'site_listed'])('records an expense and its approval on assigned %s', async (siteId) => {
      await expect(createExpenseAction({ siteId, ...EXPENSE_INPUT })).resolves.toMatchObject({ success: true })

      expect(mocks.tx.expense.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ companyId: 'company_1', siteId }) })
      )
      expect(mocks.tx.approval.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ companyId: 'company_1', siteId }) })
      )
      expect(mocks.tx.approvalTimeline.create).toHaveBeenCalledTimes(1)
    })

    it.each(['site_theirs', 'site_dead', 'site_other', 'site_missing'])(
      'refuses %s before any write, bill link, approval or timeline',
      async (siteId) => {
        await expect(createExpenseAction({ siteId, ...EXPENSE_INPUT })).rejects.toThrow(/Site not found or access denied/)
        expectNoWrites()
      }
    )

    it('refuses a bill on an unassigned site before the uploaded asset is resolved', async () => {
      await expect(
        createExpenseAction({ siteId: 'site_theirs', ...EXPENSE_INPUT, mediaAssetId: 'asset_1' })
      ).rejects.toThrow(/Site not found or access denied/)
      expectNoWrites()
    })
  })

  describe('POST /api/expenses', () => {
    it.each(['site_engineer', 'site_listed'])('records a bill and its approval on assigned %s', async (siteId) => {
      const response = await postExpense(siteId)

      expect(response.status).toBe(200)
      expect(mocks.tx.expense.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ companyId: 'company_1', siteId }) })
      )
      expect(mocks.tx.approval.create).toHaveBeenCalledTimes(1)
      expect(mocks.tx.approvalTimeline.create).toHaveBeenCalledTimes(1)
    })

    it.each(['site_theirs', 'site_dead', 'site_other', 'site_missing'])(
      'refuses %s before any write, approval or timeline',
      async (siteId) => {
        const response = await postExpense(siteId)

        expect(response.status).toBe(404)
        expect(await response.json()).toMatchObject({ error: expect.stringMatching(/Site not found or access denied/) })
        expectNoWrites()
      }
    )
  })

  describe('createApprovalAction', () => {
    beforeEach(() => {
      mocks.extraGrants.add(`${role}:approvals.view`)
      mocks.extraGrants.add(`${role}:expenses.create`)
      mocks.extraGrants.add(`${role}:purchase.approve`)
    })

    it.each(['site_engineer', 'site_listed'])('raises an approval on assigned %s', async (siteId) => {
      await expect(submitExpenseApproval(siteId)).resolves.toMatchObject({ id: 'approval_new' })

      expect(mocks.tx.approval.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ companyId: 'company_1', siteId }) })
      )
    })

    it.each(['site_theirs', 'site_dead', 'site_other', 'site_missing'])(
      'refuses %s before the linked entity is resolved or anything is written',
      async (siteId) => {
        await expect(submitExpenseApproval(siteId)).rejects.toThrow(/Site not found or access denied/)

        expect(mocks.prisma.expense.findFirst).not.toHaveBeenCalled()
        expectNoWrites()
      }
    )

    it('refuses a company-level (site-less) request, which no assignment covers', async () => {
      await expect(
        createApprovalAction({ siteId: null, entityType: 'PURCHASE_ORDER', entityId: 'po_1', title: 'PO' })
      ).rejects.toThrow(/Forbidden/)

      expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
      expect(mocks.prisma.purchaseOrder.findFirst).not.toHaveBeenCalled()
      expectNoWrites()
    })
  })
})

describe('membership binding', () => {
  it('ignores the siteIds of an inactive membership', async () => {
    members = [{ userId: 'user_field', companyId: 'company_1', isActive: false, siteIds: ['site_listed'] }]

    await expect(createExpenseAction({ siteId: 'site_listed', ...EXPENSE_INPUT })).rejects.toThrow(
      /Site not found or access denied/
    )
    expect((await postExpense('site_listed')).status).toBe(404)
    expectNoWrites()
  })

  it('ignores a membership of another company', async () => {
    members = [{ userId: 'user_field', companyId: 'company_2', isActive: true, siteIds: ['site_listed'] }]

    await expect(createExpenseAction({ siteId: 'site_listed', ...EXPENSE_INPUT })).rejects.toThrow(
      /Site not found or access denied/
    )
    expectNoWrites()
  })

  it('refuses a field role that carries no company before any site read', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER', null))

    await expect(createExpenseAction({ siteId: 'site_engineer', ...EXPENSE_INPUT })).rejects.toThrow()
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expectNoWrites()
  })
})

describe('privileged roles keep company-wide scope', () => {
  it.each(['COMPANY_ADMIN', 'PROJECT_MANAGER'])('%s records on an unassigned live site of its company', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    await expect(createExpenseAction({ siteId: 'site_theirs', ...EXPENSE_INPUT })).resolves.toMatchObject({ success: true })
    expect((await postExpense('site_theirs')).status).toBe(200)
    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
  })

  it.each(['COMPANY_ADMIN', 'PROJECT_MANAGER'])('%s is still bound to exactly its company and live sites', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    for (const siteId of ['site_other', 'site_dead']) {
      await expect(createExpenseAction({ siteId, ...EXPENSE_INPUT })).rejects.toThrow(/Site not found or access denied/)
      expect((await postExpense(siteId)).status).toBe(404)
    }
    expectNoWrites()
  })

  it('SUPER_ADMIN still records on any live site, never a deleted one', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPER_ADMIN', null))

    await expect(createExpenseAction({ siteId: 'site_other', ...EXPENSE_INPUT })).resolves.toMatchObject({ success: true })
    expect(mocks.tx.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ companyId: 'company_2', siteId: 'site_other' }) })
    )
    await expect(createExpenseAction({ siteId: 'site_dead', ...EXPENSE_INPUT })).rejects.toThrow(
      /Site not found or access denied/
    )
  })
})
