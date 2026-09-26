import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Assigned-site read scope for the approval read surfaces a field role can reach:
 * `getApprovalsAction`, `getApprovalStatsAction`, `getApprovalByIdAction` and
 * `addApprovalCommentAction`.
 *
 * `approvals.view` plus the company predicate let a SITE_ENGINEER list, count, open and
 * comment on the approvals of every site of its company — including titles, amounts,
 * comment threads, timelines and bill attachment URLs of sites it is not assigned to.
 * A field role (SITE_ENGINEER / SUPERVISOR) is now bound at query level to its
 * `assignedSiteScope`, so an unassigned-site approval is never listed or counted, and a
 * detail/comment on one answers exactly like a missing id, before its linked entity is
 * resolved or anything is written. Company-level (site-less) approvals belong to no
 * assigned site and are not visible to a field role. Privileged roles are unchanged.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  hasPermission: vi.fn(),
  extraGrants: new Set<string>(),
  prisma: {
    $transaction: vi.fn(),
    companyMember: { findFirst: vi.fn() },
    approval: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
    approvalComment: { create: vi.fn() },
    expense: { findFirst: vi.fn(), findMany: vi.fn() },
    purchaseOrder: { findFirst: vi.fn(), findMany: vi.fn() },
    dailyProgressReport: { findFirst: vi.fn(), findMany: vi.fn() },
    material: { findFirst: vi.fn(), findMany: vi.fn() },
    salaryRun: { findFirst: vi.fn(), findMany: vi.fn() },
    document: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('@/lib/audit', () => ({ logActivity: vi.fn() }))
vi.mock('@/lib/budget', () => ({ syncSiteBudget: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/permissions')>()
  mocks.hasPermission.mockImplementation(
    (role: string, permission: string) =>
      mocks.extraGrants.has(`${role}:${permission}`) || actual.hasPermission(role as never, permission as never)
  )
  return { ...actual, hasPermission: mocks.hasPermission }
})

const { getApprovalsAction, getApprovalStatsAction, getApprovalByIdAction, addApprovalCommentAction } = await import(
  '@/actions/approvals'
)

const SITES: Row[] = [
  // Assigned through `Site.assignedEngineerId` only.
  { id: 'site_engineer', companyId: 'company_1', name: 'Engineer site', deletedAt: null, assignedEngineerId: 'user_field', engineerId: null },
  // Assigned through `CompanyMember.siteIds` only.
  { id: 'site_listed', companyId: 'company_1', name: 'Listed site', deletedAt: null, assignedEngineerId: null, engineerId: null },
  { id: 'site_theirs', companyId: 'company_1', name: 'Unassigned site', deletedAt: null, assignedEngineerId: 'someone_else', engineerId: null },
  { id: 'site_other', companyId: 'company_2', name: 'Other tenant', deletedAt: null, assignedEngineerId: 'user_field', engineerId: null },
]
const siteById = new Map(SITES.map((site) => [site.id as string, site]))

function approval(id: string, siteId: string | null, overrides: Row = {}): Row {
  return {
    id,
    companyId: 'company_1',
    siteId,
    entityType: 'EXPENSE',
    entityId: `expense_on_${siteId}`,
    title: `Approval ${id}`,
    currentStatus: 'PENDING',
    priority: 'NORMAL',
    amount: 100,
    approvedAt: null,
    deletedAt: null,
    comments: [{ id: `comment_${id}`, comment: 'secret' }],
    timelines: [],
    ...overrides,
    site: siteId ? (siteById.get(siteId) ?? null) : null,
  }
}

const APPROVALS: Row[] = [
  approval('a_engineer', 'site_engineer'),
  approval('a_listed', 'site_listed', { amount: 20 }),
  approval('a_theirs', 'site_theirs', { amount: 9000, priority: 'URGENT' }),
  // Stamped company_1 but pinned to a company_2 site the user is engineer of.
  approval('a_cross_bound', 'site_other', { entityId: 'expense_forged' }),
  approval('a_po', null, { entityType: 'PURCHASE_ORDER', entityId: 'po_1', amount: 5000 }),
]

const EXPENSES: Row[] = [
  ...['site_engineer', 'site_listed', 'site_theirs'].map((siteId) => ({
    id: `expense_on_${siteId}`,
    companyId: 'company_1',
    siteId,
    deletedAt: null,
    billAttachments: [{ secureUrl: `https://cdn.test/${siteId}.pdf` }],
  })),
  { id: 'expense_forged', companyId: 'company_1', siteId: 'site_other', deletedAt: null },
]

const relation = (row: Row, key: string) => (key === 'site' ? ((row.site as Row | null) ?? null) : undefined)

let members: Row[]

function principal(role: string) {
  return { id: 'user_field', name: role, email: 'field@acme.test', role, companyId: 'company_1' }
}

function idsOf(rows: Array<{ id: unknown }>) {
  return rows.map((row) => row.id).sort()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.extraGrants.clear()
  mocks.extraGrants.add('SUPERVISOR:approvals.view')
  members = [{ userId: 'user_field', companyId: 'company_1', isActive: true, siteIds: ['site_listed'] }]
  mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
  mocks.prisma.companyMember.findFirst.mockImplementation((args) => inMemoryDelegate(members).findFirst(args))
  const approvals = inMemoryDelegate(APPROVALS, relation)
  mocks.prisma.approval.findFirst.mockImplementation(approvals.findFirst)
  mocks.prisma.approval.findMany.mockImplementation(approvals.findMany)
  const expenses = inMemoryDelegate(EXPENSES)
  mocks.prisma.expense.findFirst.mockImplementation(expenses.findFirst)
  mocks.prisma.expense.findMany.mockImplementation(expenses.findMany)
  const orders = inMemoryDelegate([{ id: 'po_1', companyId: 'company_1' }])
  mocks.prisma.purchaseOrder.findFirst.mockImplementation(orders.findFirst)
  mocks.prisma.purchaseOrder.findMany.mockImplementation(orders.findMany)
  mocks.prisma.approvalComment.create.mockImplementation(async ({ data }: { data: Row }) => ({ id: 'c_new', ...data }))
})

describe.each(['SITE_ENGINEER', 'SUPERVISOR'])('%s approval reads are bound to assigned sites', (role) => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue(principal(role))
  })

  it('lists only approvals on assigned sites (assignedEngineer and membership siteIds)', async () => {
    expect(idsOf(await getApprovalsAction())).toEqual(['a_engineer', 'a_listed'])
  })

  it('filters the list at query level, not after loading unassigned rows', async () => {
    await getApprovalsAction()

    const rows = await mocks.prisma.approval.findMany.mock.results[0].value
    expect(idsOf(rows)).toEqual(['a_engineer', 'a_listed'])
  })

  it('counts and sums only approvals on assigned sites', async () => {
    const stats = await getApprovalStatsAction()

    expect(stats).toEqual({ pending: 2, urgent: 0, approvedWeek: 0, pendingAmount: 120 })
    const rows = await mocks.prisma.approval.findMany.mock.results[0].value
    expect(idsOf(rows)).toEqual(['a_engineer', 'a_listed'])
  })

  it.each(['a_engineer', 'a_listed'])('opens the detail of assigned %s', async (id) => {
    const detail = await getApprovalByIdAction(id)

    expect(detail.approval.id).toBe(id)
    expect(detail.entityData).toMatchObject({ id: `expense_on_${detail.approval.siteId}` })
  })

  it.each(['a_theirs', 'a_cross_bound', 'a_po', 'a_missing'])(
    'refuses the detail of %s like a missing id, before its entity is resolved',
    async (id) => {
      await expect(getApprovalByIdAction(id)).rejects.toThrow('Approval not found or access denied')

      expect(mocks.prisma.expense.findFirst).not.toHaveBeenCalled()
      expect(mocks.prisma.purchaseOrder.findFirst).not.toHaveBeenCalled()
    }
  )

  it.each(['a_theirs', 'a_po'])('refuses a comment on %s before anything is written', async (id) => {
    await expect(addApprovalCommentAction(id, 'hello')).rejects.toThrow('Approval not found or access denied')

    expect(mocks.prisma.expense.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.approvalComment.create).not.toHaveBeenCalled()
  })

  it('comments on an assigned-site approval', async () => {
    await expect(addApprovalCommentAction('a_listed', 'hello')).resolves.toMatchObject({ approvalId: 'a_listed' })
  })

  it('drops membership-listed sites once the membership is inactive', async () => {
    members = [{ ...members[0], isActive: false }]

    expect(idsOf(await getApprovalsAction())).toEqual(['a_engineer'])
    await expect(getApprovalByIdAction('a_listed')).rejects.toThrow('Approval not found or access denied')
  })
})

describe('field role without a company', () => {
  it('is refused before any approval read', async () => {
    mocks.requireUser.mockResolvedValue({ ...principal('SITE_ENGINEER'), companyId: null })

    await expect(getApprovalsAction()).rejects.toThrow(/Forbidden/)
    await expect(getApprovalStatsAction()).rejects.toThrow(/Forbidden/)
    await expect(getApprovalByIdAction('a_engineer')).rejects.toThrow(/Forbidden/)
    expect(mocks.prisma.approval.findMany).not.toHaveBeenCalled()
    expect(mocks.prisma.approval.findFirst).not.toHaveBeenCalled()
  })
})

describe.each(['COMPANY_ADMIN', 'PROJECT_MANAGER', 'ACCOUNTANT'])('%s keeps company-wide approval reads', (role) => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue(principal(role))
  })

  it('lists every exactly bound approval of its company without a membership lookup', async () => {
    expect(idsOf(await getApprovalsAction())).toEqual(['a_engineer', 'a_listed', 'a_po', 'a_theirs'])
    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
  })

  it('opens an approval on a site it is not assigned to', async () => {
    await expect(getApprovalByIdAction('a_theirs')).resolves.toMatchObject({ approval: { id: 'a_theirs' } })
  })

  it('still refuses a cross-bound approval', async () => {
    await expect(getApprovalByIdAction('a_cross_bound')).rejects.toThrow('Approval not found or access denied')
  })
})

describe('roles without approvals.view', () => {
  it.each(['CLIENT', 'VENDOR'])('%s is still refused before any read', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    await expect(getApprovalsAction()).rejects.toThrow(/approvals.view/)
    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.approval.findMany).not.toHaveBeenCalled()
  })
})
