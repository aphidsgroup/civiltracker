import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for `updateSiteDetails` (src/actions/site.ts), the Edit Site modal's form
 * action, being a weaker parallel of `updateSite`.
 *
 * It read the form field by field with `as string` casts: any extra key was ignored
 * rather than refused, `new Date(...)` accepted impossible and reversed dates, project
 * type and client phone were free text, assignee rules did not exist, the site was bound
 * without the assigned-site scope, and no audit record was written at all.
 *
 * Now the form is mapped onto the canonical `parseUpdateSiteInput` field rules with an
 * explicit key allowlist, and the write goes through the shared update service: the site
 * is re-read inside the assigned-site scope, the date order is checked against the stored
 * dates, assignees are bound to active members of the live company, and the update and
 * its immutable audit record commit on one transaction client.
 *
 * The transaction mock stages every write issued on `tx` and commits it only when the
 * callback resolves, so `committed` is what a real database would still hold.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module`, `@/lib/auth/site-mutation`,
 * `@/lib/validation/sites`, `@/lib/sites/update-site` and `@/lib/audit-data` are real.
 */
const mocks = vi.hoisted(() => {
  const committed: Array<{ model: string; args: Record<string, unknown> }> = []
  let staged: typeof committed = []

  const tx = {
    site: { findFirst: vi.fn(), updateMany: vi.fn() },
    companyMember: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
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

  function stage(model: string, args: Record<string, unknown>) {
    staged.push({ model, args })
  }

  return {
    requireUser: vi.fn(),
    revalidatePath: vi.fn(),
    logActivity: vi.fn(),
    committed,
    runTransaction,
    stage,
    tx,
    prisma: {
      $transaction: vi.fn(),
      company: { findUnique: vi.fn() },
      companyMember: { findFirst: vi.fn(), findMany: vi.fn() },
      site: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      auditLog: { create: vi.fn() },
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { updateSiteDetails } = await import('@/actions/site')

const SITES: Row[] = [
  {
    id: 'site_1', companyId: 'company_1', name: 'Tower A', location: 'Chennai', status: 'ACTIVE', deletedAt: null,
    address: null, projectType: null, clientName: null, clientPhone: null, areaSqft: null, budget: 1000,
    startDate: new Date('2026-06-01T00:00:00.000Z'), targetEndDate: new Date('2027-06-01T00:00:00.000Z'),
    assignedPmId: null, assignedEngineerId: null,
  },
  {
    id: 'site_cancelled', companyId: 'company_1', name: 'Old Tower', location: 'Chennai', status: 'CANCELLED', deletedAt: null,
    budget: 0, startDate: null, targetEndDate: null,
  },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', location: 'x', status: 'ACTIVE', deletedAt: new Date('2026-01-01'), budget: 0 },
  { id: 'site_other', companyId: 'company_2', name: 'Other', location: 'x', status: 'ACTIVE', deletedAt: null, budget: 0 },
]

const MEMBERSHIPS = [
  { userId: 'user_pm', companyId: 'company_1', isActive: true, user: { isActive: true, deletedAt: null } },
  { userId: 'user_left', companyId: 'company_1', isActive: false, user: { isActive: true, deletedAt: null } },
  { userId: 'user_disabled', companyId: 'company_1', isActive: true, user: { isActive: false, deletedAt: null } },
  { userId: 'user_deleted', companyId: 'company_1', isActive: true, user: { isActive: true, deletedAt: new Date('2026-01-01') } },
  { userId: 'user_foreign', companyId: 'company_2', isActive: true, user: { isActive: true, deletedAt: null } },
]

type MemberWhere = {
  companyId: string
  isActive: boolean
  userId: { in: string[] }
  user?: { isActive?: boolean; deletedAt?: null }
}

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

/** Exactly what `EditSiteModal` posts, with overrides. */
function editForm(overrides: Record<string, string> = {}, extra: Array<[string, string | Blob]> = []) {
  const fd = new FormData()
  const fields = {
    id: 'site_1', name: 'Tower A2', location: 'Chennai', address: '', projectType: '', clientName: '', clientPhone: '',
    areaSqft: '', budget: '2500', startDate: '2026-06-01', targetEndDate: '2027-06-01', status: 'ON_HOLD', ...overrides,
  }
  for (const [key, value] of Object.entries(fields)) fd.append(key, value)
  for (const [key, value] of extra) fd.append(key, value)
  return fd
}

function expectNothingCommitted() {
  expect(mocks.committed).toEqual([])
  expect(mocks.prisma.site.update).not.toHaveBeenCalled()
  expect(mocks.prisma.site.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
  expect(mocks.logActivity).not.toHaveBeenCalled()
  expect(mocks.revalidatePath).not.toHaveBeenCalled()
}

function expectNoWriteAttempt() {
  expect(mocks.tx.site.updateMany).not.toHaveBeenCalled()
  expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
  expectNothingCommitted()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.committed.length = 0
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['SITES'], status: 'ACTIVE' })
  mocks.prisma.$transaction.mockImplementation(mocks.runTransaction)
  const sites = inMemoryDelegate(SITES)
  mocks.prisma.site.findFirst.mockImplementation(sites.findFirst)
  mocks.tx.site.findFirst.mockImplementation(sites.findFirst)
  mocks.tx.site.updateMany.mockImplementation(async (args: Row) => {
    const result = await sites.updateMany(args)
    if (result.count === 1) mocks.stage('site.updateMany', args)
    return result
  })
  mocks.tx.auditLog.create.mockImplementation(async (args: Row) => {
    mocks.stage('auditLog.create', args)
    return { id: 'audit_1' }
  })
  const members = async ({ where }: { where: MemberWhere }) =>
    MEMBERSHIPS.filter((m) =>
      m.companyId === where.companyId &&
      m.isActive === where.isActive &&
      where.userId.in.includes(m.userId) &&
      (where.user?.isActive === undefined || m.user.isActive === where.user.isActive) &&
      (where.user?.deletedAt === undefined || m.user.deletedAt === where.user.deletedAt)
    ).map((m) => ({ userId: m.userId }))
  mocks.tx.companyMember.findMany.mockImplementation(members)
  mocks.prisma.companyMember.findMany.mockImplementation(members)
})

describe('updateSiteDetails refuses a forged form', () => {
  it.each([
    ['a smuggled company', [['companyId', 'company_2']]],
    ['a smuggled spent figure', [['spent', '99']]],
    ['a smuggled slug', [['slug', 'other-tower']]],
    ['a smuggled deletion marker', [['deletedAt', '']]],
    ['a smuggled creator', [['createdById', 'user_x']]],
    ['an unknown key', [['isAdmin', 'true']]],
    ['a repeated name', [['name', 'Tower B']]],
    ['a file in place of a field', [['address', new Blob(['x'])]]],
  ] as Array<[string, Array<[string, string | Blob]>]>)('refuses %s before any write', async (_label, extra) => {
    await expect(updateSiteDetails(editForm({}, extra))).rejects.toThrow(/Invalid site/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNoWriteAttempt()
  })

  it.each([
    ['an unknown status', { status: 'DEMOLISHED' }],
    ['a blank id', { id: '  ' }],
    ['an over-long id', { id: 's'.repeat(65) }],
    ['a free-text project type', { projectType: 'CASINO' }],
    ['a malformed client phone', { clientPhone: 'call me' }],
    ['an over-long client name', { clientName: 'x'.repeat(500) }],
    ['a negative budget', { budget: '-1' }],
    ['an exponent budget', { budget: '1e3' }],
    ['a zero area', { areaSqft: '0' }],
  ])('refuses %s before any write', async (_label, overrides) => {
    await expect(updateSiteDetails(editForm(overrides))).rejects.toThrow(/Invalid site/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNoWriteAttempt()
  })
})

describe('updateSiteDetails validates real, ordered dates', () => {
  it.each([
    ['an impossible start date', { startDate: '2026-02-30' }],
    ['a free-text end date', { targetEndDate: 'next week' }],
    ['a non-ISO start date', { startDate: '06/01/2026' }],
    ['an out-of-range year', { targetEndDate: '9999-01-01' }],
    ['an end date before the start date', { startDate: '2026-10-01', targetEndDate: '2026-01-01' }],
  ])('refuses %s before any write', async (_label, overrides) => {
    await expect(updateSiteDetails(editForm(overrides))).rejects.toThrow(/Invalid site: (startDate|targetEndDate)/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNoWriteAttempt()
  })

  it('refuses a single end date that falls before the stored start date', async () => {
    const fd = editForm()
    fd.delete('startDate')
    fd.set('targetEndDate', '2026-01-01')
    await expect(updateSiteDetails(fd)).rejects.toThrow(/Invalid site: targetEndDate must not be before the start date/)
    expectNoWriteAttempt()
  })
})

describe('updateSiteDetails binds assignees to live members of the company', () => {
  it.each([
    ['a PM of another tenant', 'assignedPmId', 'user_foreign'],
    ['an engineer whose membership was revoked', 'assignedEngineerId', 'user_left'],
    ['a PM whose account is deactivated', 'assignedPmId', 'user_disabled'],
    ['an engineer whose account is deleted', 'assignedEngineerId', 'user_deleted'],
    ['an unknown user', 'assignedPmId', 'user_ghost'],
  ])('refuses %s without writing', async (_label, field, userId) => {
    await expect(updateSiteDetails(editForm({ [field]: userId }))).rejects.toThrow(/Invalid site: assignee/)
    expect(mocks.tx.companyMember.findMany.mock.calls[0][0].where).toMatchObject({ companyId: 'company_1', isActive: true })
    expectNoWriteAttempt()
  })
})

describe('updateSiteDetails authorization and resource binding', () => {
  it('refuses a live role without sites.update before reading the site', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    await expect(updateSiteDetails(editForm())).rejects.toThrow(/FORBIDDEN/)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.tx.site.findFirst).not.toHaveBeenCalled()
    expectNothingCommitted()
  })

  it('refuses when the SITES module is disabled before validating or reading', async () => {
    mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['LABOUR'], status: 'ACTIVE' })
    await expect(updateSiteDetails(editForm({ budget: 'lots' }))).rejects.toThrow(/Module SITES is not enabled/)
    expect(mocks.tx.site.findFirst).not.toHaveBeenCalled()
    expectNothingCommitted()
  })

  it.each([
    ['a site of another company', 'site_other'],
    ['a soft-deleted site', 'site_dead'],
    ['a missing site', 'nope'],
  ])('refuses %s without writing', async (_label, id) => {
    await expect(updateSiteDetails(editForm({ id }))).rejects.toThrow(/Site not found or access denied/)
    expectNoWriteAttempt()
  })

  it('refuses a status the form cannot set, but keeps an unchanged stored one', async () => {
    await expect(updateSiteDetails(editForm({ status: 'CANCELLED' }))).rejects.toThrow(/Invalid site: status/)
    expectNoWriteAttempt()

    await expect(updateSiteDetails(editForm({ id: 'site_cancelled', startDate: '', targetEndDate: '', status: 'CANCELLED' })))
      .resolves.toEqual({ success: true })
    const write = mocks.committed.find((entry) => entry.model === 'site.updateMany')
    expect(write?.args.data).not.toHaveProperty('status')
  })
})

describe('updateSiteDetails writes the update and its audit record atomically', () => {
  it('rolls the update back and surfaces the error when the audit write fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit store unavailable'))
    await expect(updateSiteDetails(editForm())).rejects.toThrow('audit store unavailable')
    // The site write was issued on the transaction client, and discarded with it.
    expect(mocks.tx.site.updateMany).toHaveBeenCalledTimes(1)
    expectNothingCommitted()
  })

  it('fails without an audit record when the guarded write matches no row (raced away)', async () => {
    mocks.tx.site.updateMany.mockResolvedValue({ count: 0 })
    await expect(updateSiteDetails(editForm())).rejects.toThrow(/Site not found or access denied/)
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expectNothingCommitted()
  })

  it('writes exactly the allowlisted fields, normalized, with an audit record in the same transaction', async () => {
    await expect(updateSiteDetails(editForm({
      name: '  Tower A2 ',
      location: ' Pune ',
      address: '  12 Main Rd ',
      projectType: 'COMMERCIAL',
      clientName: ' Acme Ltd ',
      clientPhone: ' +91 98765 43210 ',
      areaSqft: '1200.5',
      budget: '1250000.75',
      startDate: '2026-07-01',
      targetEndDate: '2027-08-15',
      status: 'COMPLETED',
      assignedPmId: 'user_pm',
      assignedEngineerId: '',
    }))).resolves.toEqual({ success: true })

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.committed.map((entry) => entry.model)).toEqual(['site.updateMany', 'auditLog.create'])

    const [write, audit] = mocks.committed
    expect(write.args.where).toEqual({ id: 'site_1', companyId: 'company_1', deletedAt: null })
    expect(write.args.data).toEqual({
      name: 'Tower A2',
      location: 'Pune',
      address: '12 Main Rd',
      projectType: 'COMMERCIAL',
      clientName: 'Acme Ltd',
      clientPhone: '+91 98765 43210',
      areaSqft: 1200.5,
      budget: 1250000.75,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      targetEndDate: new Date('2027-08-15T00:00:00.000Z'),
      assignedPmId: 'user_pm',
      assignedEngineerId: null,
      status: 'COMPLETED',
    })

    const data = audit.args.data as Record<string, unknown>
    expect(data).toMatchObject({ userId: 'user_company_admin', companyId: 'company_1', action: 'UPDATE', module: 'SITE', recordId: 'site_1' })
    expect(data.before).toMatchObject({ name: 'Tower A', location: 'Chennai', status: 'ACTIVE', budget: 1000, startDate: '2026-06-01T00:00:00.000Z' })
    expect(data.after).toMatchObject({
      name: 'Tower A2', location: 'Pune', status: 'COMPLETED', budget: 1250000.75,
      startDate: '2026-07-01T00:00:00.000Z', targetEndDate: '2027-08-15T00:00:00.000Z', assignedPmId: 'user_pm',
    })

    // The canonical update path writes nothing on the global client and never uses the best-effort logger.
    expect(mocks.prisma.site.updateMany).not.toHaveBeenCalled()
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites/site_1')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites')
  })

  it('maps blank optional fields from the modal to null and a blank budget to 0', async () => {
    await expect(updateSiteDetails(editForm({ budget: '', startDate: '', targetEndDate: '' }))).resolves.toEqual({ success: true })
    expect(mocks.committed[0].args.data).toMatchObject({
      address: null, projectType: null, clientName: null, clientPhone: null, areaSqft: null, budget: 0, startDate: null, targetEndDate: null,
    })
    expect(mocks.tx.companyMember.findMany).not.toHaveBeenCalled()
  })
})
