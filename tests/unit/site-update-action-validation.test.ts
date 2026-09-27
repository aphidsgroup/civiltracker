import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for `updateSite` (src/actions/sites.ts) persisting an untyped payload.
 *
 * The action took `data: any` and wrote it with `Number(...)` / `new Date(...)` coercion:
 * a negative or `NaN` budget, an `Invalid Date`, a non-string name, an arbitrary project
 * type, an unbounded string, and a PM or engineer id of another tenant (or a revoked or
 * deactivated member) all reached `site.updateMany`, and every unsent field was nulled.
 *
 * Now the payload is validated by the same field rules as `createSite`: only the sent keys
 * of an explicit allowlist are written, each normalized, and any assignee must be an
 * active member of the live company, all before the first write.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module`, `@/lib/auth/site-mutation`,
 * `@/lib/validation/sites` and `@/lib/sites/update-site` are real.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  logActivity: vi.fn(),
  prisma: {
    company: { findUnique: vi.fn() },
    companyMember: { findFirst: vi.fn(), findMany: vi.fn() },
    site: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))

const { updateSite } = await import('@/actions/sites')

const SITES: Row[] = [
  {
    id: 'site_1', companyId: 'company_1', name: 'Tower A', status: 'ACTIVE', deletedAt: null,
    startDate: new Date('2026-06-01T00:00:00.000Z'), targetEndDate: new Date('2027-06-01T00:00:00.000Z'),
  },
]

const MEMBERSHIPS = [
  { userId: 'user_pm', companyId: 'company_1', isActive: true, user: { isActive: true, deletedAt: null } },
  { userId: 'user_engineer', companyId: 'company_1', isActive: true, user: { isActive: true, deletedAt: null } },
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

function writes() {
  return mocks.prisma.site.update.mock.calls.length + mocks.prisma.site.updateMany.mock.calls.length
}

function expectNoWrites() {
  expect(writes()).toBe(0)
  expect(mocks.logActivity).not.toHaveBeenCalled()
  expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['SITES'], status: 'ACTIVE' })
  const sites = inMemoryDelegate(SITES)
  mocks.prisma.site.findFirst.mockImplementation(sites.findFirst)
  mocks.prisma.site.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.auditLog.create.mockResolvedValue({ id: 'audit_1' })
  // The audited update runs on the transaction client; here it is the same mock.
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.prisma) => unknown) => fn(mocks.prisma))
  mocks.prisma.companyMember.findMany.mockImplementation(async ({ where }: { where: MemberWhere }) =>
    MEMBERSHIPS.filter((m) =>
      m.companyId === where.companyId &&
      m.isActive === where.isActive &&
      where.userId.in.includes(m.userId) &&
      (where.user?.isActive === undefined || m.user.isActive === where.user.isActive) &&
      (where.user?.deletedAt === undefined || m.user.deletedAt === where.user.deletedAt)
    ).map((m) => ({ userId: m.userId }))
  )
})

describe('updateSite input validation', () => {
  it.each([
    ['a null payload', null],
    ['a string payload', 'Tower A2'],
    ['an array payload', [{ name: 'Tower A2' }]],
    ['an empty payload', {}],
    ['a blank name', { name: '   ' }],
    ['a null name', { name: null }],
    ['a non-string name', { name: { toString: () => 'x' } }],
    ['an over-long name', { name: 'x'.repeat(500) }],
    ['an over-long address', { address: 'x'.repeat(5000) }],
    ['an unknown project type', { projectType: 'CASINO' }],
    ['a negative budget', { budget: '-1' }],
    ['a non-numeric budget', { budget: 'lots' }],
    ['an exponent budget', { budget: '1e3' }],
    ['an infinite budget', { budget: Infinity }],
    ['a NaN area', { areaSqft: NaN }],
    ['a fractional floor count', { floors: '2.5' }],
    ['an impossible start date', { startDate: '2026-02-30' }],
    ['a free-text end date', { targetEndDate: 'next week' }],
    ['an end date before the start date', { startDate: '2026-10-01', targetEndDate: '2026-01-01' }],
    ['an end date before the stored start date', { targetEndDate: '2026-01-01' }],
    ['a start date after the stored end date', { startDate: '2028-01-01' }],
    ['a malformed client email', { clientEmail: 'not-an-email' }],
    ['a non-http map link', { mapLink: 'javascript:alert(1)' }],
    ['a smuggled status', { name: 'Tower A2', status: 'COMPLETED' }],
    ['a smuggled company', { name: 'Tower A2', companyId: 'company_2' }],
    ['a smuggled slug', { slug: 'other' }],
    ['a smuggled spent figure', { spent: 99 }],
    ['a smuggled deletion marker', { deletedAt: null }],
    ['a non-string assignee', { assignedPmId: 7 }],
    ['an over-long assignee id', { assignedPmId: 'u'.repeat(500) }],
  ])('rejects %s without writing', async (_label, input) => {
    await expect(updateSite('site_1', input)).rejects.toThrow(/Invalid site/)
    expect(mocks.prisma.companyMember.findMany).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it.each([
    ['a PM of another tenant', { assignedPmId: 'user_foreign' }],
    ['an engineer whose membership was revoked', { assignedEngineerId: 'user_left' }],
    ['a PM whose account is deactivated', { assignedPmId: 'user_disabled' }],
    ['an engineer whose account is deleted', { assignedEngineerId: 'user_deleted' }],
    ['an unknown user', { assignedPmId: 'user_ghost' }],
  ])('refuses %s without writing', async (_label, input) => {
    await expect(updateSite('site_1', { name: 'Tower A2', ...input })).rejects.toThrow(/Invalid site: assignee/)
    expect(mocks.prisma.companyMember.findMany.mock.calls[0][0].where).toMatchObject({ companyId: 'company_1', isActive: true })
    expectNoWrites()
  })

  it('runs the SITES module gate before validating the payload', async () => {
    mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['LABOUR'], status: 'ACTIVE' })
    await expect(updateSite('site_1', { budget: 'lots' })).rejects.toThrow(/Module SITES is not enabled/)
    expectNoWrites()
  })

  it('writes exactly the sent allowlisted fields, normalized, through the guarded write', async () => {
    await expect(updateSite('site_1', {
      name: '  Tower A2 ',
      location: ' Pune ',
      address: '',
      projectType: 'COMMERCIAL',
      budget: '1250000.75',
      floors: '12',
      startDate: '2026-07-01',
      targetEndDate: '2027-08-15',
      assignedPmId: 'user_pm',
      assignedEngineerId: '',
    })).resolves.toEqual({ success: true, siteId: 'site_1' })

    expect(mocks.prisma.site.update).not.toHaveBeenCalled()
    const call = mocks.prisma.site.updateMany.mock.calls[0][0]
    expect(call.where).toEqual({ id: 'site_1', companyId: 'company_1', deletedAt: null })
    expect(call.data).toEqual({
      name: 'Tower A2',
      location: 'Pune',
      address: null,
      projectType: 'COMMERCIAL',
      budget: 1250000.75,
      floors: 12,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      targetEndDate: new Date('2027-08-15T00:00:00.000Z'),
      assignedPmId: 'user_pm',
      assignedEngineerId: null,
    })
    expect(mocks.prisma.companyMember.findMany.mock.calls[0][0].where.userId).toEqual({ in: ['user_pm'] })
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: 'company_1', recordId: 'site_1', action: 'UPDATE', module: 'SITE' }),
    })
  })

  it('leaves unsent fields untouched instead of nulling them', async () => {
    await expect(updateSite('site_1', { clientPhone: '+91 98765 43210' })).resolves.toEqual({ success: true, siteId: 'site_1' })
    expect(mocks.prisma.site.updateMany.mock.calls[0][0].data).toEqual({ clientPhone: '+91 98765 43210' })
    expect(mocks.prisma.companyMember.findMany).not.toHaveBeenCalled()
  })

  it('accepts a single date that stays in order with the stored one', async () => {
    await expect(updateSite('site_1', { targetEndDate: '2027-12-31' })).resolves.toEqual({ success: true, siteId: 'site_1' })
    expect(mocks.prisma.site.updateMany.mock.calls[0][0].data).toEqual({ targetEndDate: new Date('2027-12-31T00:00:00.000Z') })
  })
})
