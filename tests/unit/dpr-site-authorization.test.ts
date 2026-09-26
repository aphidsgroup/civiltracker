import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Direct-action cover for `createDpr`.
 *
 * The action used to create the DailyProgressReport on the global client and then raise
 * its approval separately, so a failed linked-entity lookup, approval or timeline write
 * left an orphan DPR behind. The transaction mock stages every write issued on `tx` and
 * only commits it when the callback resolves.
 */
const mocks = vi.hoisted(() => {
  const committed: Array<{ model: string; data: Record<string, unknown> }> = []
  let staged: typeof committed = []

  const prisma = {
    $transaction: vi.fn(),
    company: { findUnique: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findFirst: vi.fn(), findUnique: vi.fn() },
    dailyProgressReport: { create: vi.fn(), findFirst: vi.fn() },
    approval: { create: vi.fn() },
    approvalTimeline: { create: vi.fn() },
  }

  const tx = {
    dailyProgressReport: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: 'dpr_1', ...data }
        staged.push({ model: 'dailyProgressReport', data: row })
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
    revalidatePath: vi.fn(),
    prisma,
    tx,
    committed,
    runTransaction,
  }
})

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { createDpr } = await import('@/actions/dpr')

const ENGINEER = { id: 'engineer_1', role: 'SITE_ENGINEER', companyId: 'company_1' }

/**
 * engineer_1 is the engineer of site_1 and listed on site_listed by active membership;
 * site_theirs is a live, ACTIVE company site assigned to someone else.
 */
const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', deletedAt: null, status: 'ACTIVE', assignedEngineerId: 'engineer_1', engineerId: null },
  { id: 'site_listed', companyId: 'company_1', deletedAt: null, status: 'ACTIVE', assignedEngineerId: null, engineerId: null },
  { id: 'site_theirs', companyId: 'company_1', deletedAt: null, status: 'ACTIVE', assignedEngineerId: 'someone_else', engineerId: null },
  { id: 'site_hold', companyId: 'company_1', deletedAt: null, status: 'ON_HOLD', assignedEngineerId: 'engineer_1', engineerId: null },
  { id: 'other_company_site', companyId: 'company_2', deletedAt: null, status: 'ACTIVE', assignedEngineerId: 'engineer_1', engineerId: null },
]

let modules: unknown
let memberSiteIds: string[]

function form(siteId = 'site_1') {
  const data = new FormData()
  data.set('siteId', siteId)
  data.set('workDone', 'Concrete poured')
  data.set('labourCount', '5')
  data.set('date', '2026-09-10')
  return data
}

function expectNoReads() {
  expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.site.findUnique).not.toHaveBeenCalled()
  expect(mocks.prisma.dailyProgressReport.findFirst).not.toHaveBeenCalled()
}

/** The raw, non-transactional writes on the global client are what the orphan was. */
function expectNoGlobalWrites() {
  expect(mocks.prisma.dailyProgressReport.create).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.create).not.toHaveBeenCalled()
  expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
}

function expectNoWrites() {
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  expect(mocks.tx.dailyProgressReport.create).not.toHaveBeenCalled()
  expect(mocks.tx.approval.create).not.toHaveBeenCalled()
  expect(mocks.tx.approvalTimeline.create).not.toHaveBeenCalled()
  expectNoGlobalWrites()
  expect(mocks.committed).toEqual([])
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.committed.length = 0
  mocks.requireUser.mockResolvedValue(ENGINEER)
  mocks.prisma.$transaction.mockImplementation(mocks.runTransaction)
  modules = ['DPR']
  memberSiteIds = ['site_listed']
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  mocks.prisma.companyMember.findFirst.mockImplementation(async () => ({ siteIds: memberSiteIds }))
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)
})

describe('createDpr authorizes before any read or write', () => {
  it('refuses an unauthenticated or stale principal before touching the database', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Account is inactive'))

    await expect(createDpr(form())).rejects.toThrow(/UNAUTHORIZED/)
    expectNoReads()
    expectNoWrites()
  })

  it('refuses a role without dpr.create before any read or write', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'vendor_1', role: 'VENDOR', companyId: 'company_1' })

    await expect(createDpr(form())).rejects.toThrow(/dpr\.create/)
    expectNoReads()
    expectNoWrites()
  })

  it('refuses a principal with no company context before any read', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root_1', role: 'SUPER_ADMIN', companyId: null })

    await expect(createDpr(form())).rejects.toThrow(/tenant context/i)
    expectNoReads()
    expectNoWrites()
  })

  it('refuses when the live company has the DPR module disabled, before any site read', async () => {
    modules = ['SITES', 'LABOUR']

    await expect(createDpr(form())).rejects.toThrow(/Module DPR is not enabled/)
    expectNoReads()
    expectNoWrites()
  })

  it('judges the module on the live company, not on anything the form sends', async () => {
    modules = { dpr: false }
    const data = form()
    data.set('companyId', 'company_2')

    await expect(createDpr(data)).rejects.toThrow(/Module DPR is not enabled/)
    expect(mocks.prisma.company.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'company_1' } }))
    expectNoWrites()
  })
})

describe('createDpr assigned-site policy for field roles', () => {
  it.each(['SITE_ENGINEER', 'SUPERVISOR'])('%s cannot file on a live company site it is not assigned to', async (role) => {
    mocks.requireUser.mockResolvedValue({ id: 'engineer_1', role, companyId: 'company_1' })

    await expect(createDpr(form('site_theirs'))).rejects.toThrow(/site not found or access denied/i)
    expectNoWrites()
  })

  it('a field role with no assignment at all cannot file on any site', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'supervisor_new', role: 'SUPERVISOR', companyId: 'company_1' })
    memberSiteIds = []

    for (const siteId of ['site_1', 'site_listed', 'site_theirs']) {
      await expect(createDpr(form(siteId))).rejects.toThrow(/site not found or access denied/i)
    }
    expectNoWrites()
  })

  it('files on a site listed on the active membership', async () => {
    await expect(createDpr(form('site_listed'))).resolves.toEqual({ success: true, dprId: 'dpr_1' })
  })

  it('refuses an assigned site that is not ACTIVE', async () => {
    await expect(createDpr(form('site_hold'))).rejects.toThrow(/site not found or access denied/i)
    expectNoWrites()
  })

  it('lets a PROJECT_MANAGER file on any ACTIVE live company site', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'pm_1', role: 'PROJECT_MANAGER', companyId: 'company_1' })

    await expect(createDpr(form('site_theirs'))).resolves.toEqual({ success: true, dprId: 'dpr_1' })
    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
  })
})

describe('createDpr tenant authorization', () => {
  it('queries the submitted site with the live caller company before writing a DPR', async () => {
    await createDpr(form())

    expect(mocks.prisma.site.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'site_1', companyId: 'company_1', deletedAt: null, status: 'ACTIVE' }),
      select: { id: true },
    })
  })

  it('rejects a site outside the caller company without creating DPR or approval records', async () => {
    await expect(createDpr(form('other_company_site'))).rejects.toThrow(/site not found or access denied/i)
    expectNoWrites()
  })

  it('rejects a soft-deleted site without creating DPR or approval records', async () => {
    // The row exists but is soft deleted: only a lookup that ignores deletedAt finds it.
    mocks.prisma.site.findFirst.mockImplementation(
      inMemoryDelegate(SITES.map((site) => (site.id === 'site_1' ? { ...site, deletedAt: new Date() } : site))).findFirst
    )

    await expect(createDpr(form())).rejects.toThrow(/site not found or access denied/i)
    expectNoWrites()
  })
})

describe('createDpr writes DPR, approval and timeline atomically', () => {
  // The public createApprovalAction requires approvals.view, which SUPERVISOR does not
  // hold; the DPR flow is authorized by dpr.create and must keep submitting.
  it('commits DPR, approval and timeline in one transaction for a SUPERVISOR', async () => {
    const supervisor = { id: 'supervisor_1', role: 'SUPERVISOR', companyId: 'company_1' }
    mocks.requireUser.mockResolvedValue(supervisor)

    // Assigned to site_listed through its active membership.
    await expect(createDpr(form('site_listed'))).resolves.toEqual({ success: true, dprId: 'dpr_1' })

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.committed.map((row) => row.model)).toEqual(['dailyProgressReport', 'approval', 'approvalTimeline'])
    expectNoGlobalWrites()
    expect(mocks.tx.approval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ requestedById: 'supervisor_1' }),
    })
  })

  it('binds the DPR, approval and timeline to the exact company, site and DPR', async () => {
    await createDpr(form())

    expect(mocks.tx.dailyProgressReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company_1',
        siteId: 'site_1',
        workDone: 'Concrete poured',
        labourCount: 5,
        createdById: 'engineer_1',
      }),
    })
    expect(mocks.tx.approval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company_1',
        siteId: 'site_1',
        entityType: 'DPR',
        entityId: 'dpr_1',
        priority: 'NORMAL',
        approvalType: 'OPERATIONAL',
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

  it('rolls back the DPR when the approval write fails', async () => {
    mocks.tx.approval.create.mockRejectedValueOnce(new Error('approval insert failed'))

    await expect(createDpr(form())).rejects.toThrow('approval insert failed')

    expect(mocks.tx.dailyProgressReport.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.approvalTimeline.create).not.toHaveBeenCalled()
    expect(mocks.committed).toEqual([])
    expectNoGlobalWrites()
  })

  it('rolls back the DPR and approval when the timeline write fails', async () => {
    mocks.tx.approvalTimeline.create.mockRejectedValueOnce(new Error('timeline insert failed'))

    await expect(createDpr(form())).rejects.toThrow('timeline insert failed')

    expect(mocks.tx.approval.create).toHaveBeenCalledTimes(1)
    expect(mocks.committed).toEqual([])
    expectNoGlobalWrites()
  })
})
