import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Detail reads must be bound to the entity the approval points at.
 *
 * An otherwise well-formed approval — right company, a site on every site-bound type,
 * not deleted, read by a principal holding approvals.view — can still point at an entity
 * that is missing, owned by another company, or sitting on another site of the same
 * company. The server action used to answer `{ approval, entityData: null }` and the REST
 * detail route never looked at the entity at all, so both handed out the approval title,
 * description, comment thread and timeline for a record the reader cannot reach.
 *
 * The entity delegates here behave like the database: they only return the seeded record
 * when every predicate in `where` matches it. A lookup that forgets the company or site
 * predicate therefore *finds* the foreign record, and the test fails.
 */
const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    site: { findFirst: vi.fn() },
    approval: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    approvalTimeline: { create: vi.fn() },
    approvalComment: { create: vi.fn() },
    expense: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    salaryRun: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    dailyProgressReport: { findFirst: vi.fn(), findUnique: vi.fn() },
    material: { findFirst: vi.fn(), findUnique: vi.fn() },
    document: { findFirst: vi.fn(), findUnique: vi.fn() },
    purchaseOrder: { findFirst: vi.fn(), findUnique: vi.fn() },
  }

  return {
    requireUser: vi.fn(),
    requireModuleEnabled: vi.fn(),
    hasPermission: vi.fn(),
    revalidatePath: vi.fn(),
    logActivity: vi.fn(),
    syncSiteBudget: vi.fn(),
    prisma,
  }
})

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/auth/require-module', () => ({ requireModuleEnabled: mocks.requireModuleEnabled }))
vi.mock('@/lib/permissions', () => ({ hasPermission: mocks.hasPermission }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('@/lib/budget', () => ({ syncSiteBudget: mocks.syncSiteBudget }))

const { getApprovalByIdAction } = await import('@/actions/approvals')
const { GET: detailApproval } = await import('@/app/api/approvals/[id]/route')

const GENERIC_DENIAL = 'Approval not found or access denied'

const READER = {
  id: 'reader_1',
  name: 'Reader',
  email: 'reader@acme.test',
  role: 'ACCOUNTANT',
  companyId: 'company_1',
}

type EntityDelegate = 'expense' | 'dailyProgressReport' | 'purchaseOrder'

/** Entity types under test and the delegate that owns each of them. */
const SITE_BOUND_CASES = [
  { entityType: 'EXPENSE', delegate: 'expense' },
  { entityType: 'BILL', delegate: 'expense' },
  // DPR is never mutated by a transition, so nothing but this read ever checks it.
  { entityType: 'DPR', delegate: 'dailyProgressReport' },
] as const satisfies ReadonlyArray<{ entityType: string; delegate: EntityDelegate }>

/** Every string that must never reach a reader who cannot reach the linked entity. */
const SECRETS = [
  'SECRET_TITLE',
  'SECRET_DESCRIPTION',
  'SECRET_COMMENT',
  'SECRET_TIMELINE',
  'SECRET_ATTACHMENT',
  'SECRET_ENTITY',
]

function approvalRow(entityType: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'approval_1',
    companyId: 'company_1',
    siteId: 'site_1',
    entityType,
    entityId: 'entity_1',
    currentStatus: 'PENDING',
    deletedAt: null,
    title: 'SECRET_TITLE',
    description: 'SECRET_DESCRIPTION',
    amount: 5000,
    // The approval's own site: live and owned by the approval company.
    site: { name: 'Site One', location: 'Chennai', companyId: 'company_1', deletedAt: null },
    requestedBy: { name: 'Requester', email: 'req@acme.test', role: 'SITE_ENGINEER', avatar: null },
    comments: [{ id: 'comment_1', comment: 'SECRET_COMMENT', user: { name: 'Req', avatar: null, role: 'SITE_ENGINEER' } }],
    timelines: [{ id: 'timeline_1', note: 'SECRET_TIMELINE', actor: { name: 'Req', role: 'SITE_ENGINEER' } }],
    ...overrides,
  }
}

function entityRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entity_1',
    companyId: 'company_1',
    siteId: 'site_1',
    deletedAt: null,
    description: 'SECRET_ENTITY',
    billAttachments: [{ id: 'attachment_1', fileUrl: 'https://files.test/SECRET_ATTACHMENT.pdf' }],
    ...overrides,
  }
}

/**
 * Seeds one entity into a delegate that answers like a database would: the record is
 * only returned when every `where` predicate the caller supplied matches it.
 */
function seedEntity(delegate: EntityDelegate, record: Record<string, unknown> | null) {
  mocks.prisma[delegate].findFirst.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
    if (!record) return null
    const where = args?.where ?? {}
    for (const [key, value] of Object.entries(where)) {
      if (record[key] !== value) return null
    }
    return record
  })
}

const UNREACHABLE_SCENARIOS = [
  { name: 'missing', record: () => null },
  { name: 'cross-company', record: () => entityRecord({ companyId: 'company_2' }) },
  { name: 'wrong-site', record: () => entityRecord({ siteId: 'site_2' }) },
] as const

function expectNoLeak(text: string) {
  for (const secret of SECRETS) expect(text).not.toContain(secret)
}

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function readDetailRoute(id = 'approval_1') {
  const response = await detailApproval(new Request(`http://localhost/api/approvals/${id}`), routeParams(id))
  const body = await response.json()
  return { status: response.status, body }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue(READER)
  mocks.requireModuleEnabled.mockResolvedValue(undefined)
  mocks.hasPermission.mockImplementation((_role: unknown, permission: string) => permission === 'approvals.view')
  for (const delegate of ['expense', 'dailyProgressReport', 'purchaseOrder'] as const) {
    seedEntity(delegate, null)
  }
  mocks.prisma.salaryRun.findFirst.mockResolvedValue(null)
  mocks.prisma.material.findFirst.mockResolvedValue(null)
  mocks.prisma.document.findFirst.mockResolvedValue(null)
})

describe('getApprovalByIdAction refuses an approval whose linked entity is unreachable', () => {
  for (const { entityType, delegate } of SITE_BOUND_CASES) {
    for (const scenario of UNREACHABLE_SCENARIOS) {
      it(`refuses a well-formed ${entityType} approval whose entity is ${scenario.name}`, async () => {
        mocks.prisma.approval.findFirst.mockResolvedValue(approvalRow(entityType))
        seedEntity(delegate, scenario.record())

        const outcome = await getApprovalByIdAction('approval_1').then(
          (value) => ({ ok: true as const, value }),
          (error: Error) => ({ ok: false as const, error })
        )

        expect(outcome.ok).toBe(false)
        if (outcome.ok) return
        expect(outcome.error.message).toBe(GENERIC_DENIAL)
        expectNoLeak(outcome.error.message)
        expectNoLeak(JSON.stringify(outcome.error))
      })
    }

    it(`resolves the ${entityType} entity strictly inside the approval company and site`, async () => {
      mocks.prisma.approval.findFirst.mockResolvedValue(approvalRow(entityType))
      seedEntity(delegate, entityRecord())

      const result = await getApprovalByIdAction('approval_1')

      expect(result.approval.id).toBe('approval_1')
      expect(result.entityData).toMatchObject({ id: 'entity_1' })
      expect(mocks.prisma[delegate].findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'entity_1', companyId: 'company_1', siteId: 'site_1' }),
        })
      )
    })
  }

  it('refuses a PURCHASE_ORDER approval whose order belongs to another company', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(approvalRow('PURCHASE_ORDER', { siteId: null, site: null }))
    seedEntity('purchaseOrder', entityRecord({ companyId: 'company_2', siteId: undefined }))

    await expect(getApprovalByIdAction('approval_1')).rejects.toThrow(GENERIC_DENIAL)
  })

  it('still details a company level PURCHASE_ORDER approval without adding a site predicate', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(approvalRow('PURCHASE_ORDER', { siteId: 'site_1' }))
    seedEntity('purchaseOrder', { id: 'entity_1', companyId: 'company_1' })

    const result = await getApprovalByIdAction('approval_1')

    expect(result.entityData).toEqual({ id: 'entity_1', companyId: 'company_1' })
    expect(mocks.prisma.purchaseOrder.findFirst).toHaveBeenCalledWith({
      where: { id: 'entity_1', companyId: 'company_1' },
    })
  })

  it('refuses a SUPER_ADMIN reader too: the entity is scoped by the approval, not the caller', async () => {
    mocks.requireUser.mockResolvedValue({ ...READER, role: 'SUPER_ADMIN', companyId: undefined })
    mocks.prisma.approval.findFirst.mockResolvedValue(approvalRow('EXPENSE'))
    seedEntity('expense', entityRecord({ companyId: 'company_2' }))

    await expect(getApprovalByIdAction('approval_1')).rejects.toThrow(GENERIC_DENIAL)
  })
})

describe('GET /api/approvals/[id] refuses an approval whose linked entity is unreachable', () => {
  for (const { entityType, delegate } of SITE_BOUND_CASES) {
    for (const scenario of UNREACHABLE_SCENARIOS) {
      it(`answers a generic 404 for a well-formed ${entityType} approval whose entity is ${scenario.name}`, async () => {
        mocks.prisma.approval.findFirst.mockResolvedValue(approvalRow(entityType))
        seedEntity(delegate, scenario.record())

        const { status, body } = await readDetailRoute()

        expect(status).toBe(404)
        expect(body).toEqual({ error: GENERIC_DENIAL })
        expectNoLeak(JSON.stringify(body))
      })
    }

    it(`still details a ${entityType} approval whose entity is inside the approval company and site`, async () => {
      mocks.prisma.approval.findFirst.mockResolvedValue(approvalRow(entityType))
      seedEntity(delegate, entityRecord())

      const { status, body } = await readDetailRoute()

      expect(status).toBe(200)
      expect(body).toMatchObject({ success: true, data: { id: 'approval_1', title: 'SECRET_TITLE' } })
      expect(mocks.prisma[delegate].findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'entity_1', companyId: 'company_1', siteId: 'site_1' }),
        })
      )
    })
  }

  it('answers a generic 404 for a PURCHASE_ORDER approval whose order belongs to another company', async () => {
    mocks.prisma.approval.findFirst.mockResolvedValue(approvalRow('PURCHASE_ORDER', { siteId: null, site: null }))
    seedEntity('purchaseOrder', entityRecord({ companyId: 'company_2', siteId: undefined }))

    const { status, body } = await readDetailRoute()

    expect(status).toBe(404)
    expect(body).toEqual({ error: GENERIC_DENIAL })
  })

  it('keeps the approvals.view gate ahead of any approval or entity read', async () => {
    mocks.hasPermission.mockReturnValue(false)

    const { status } = await readDetailRoute()

    expect(status).toBe(403)
    expect(mocks.prisma.approval.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.expense.findFirst).not.toHaveBeenCalled()
  })
})
