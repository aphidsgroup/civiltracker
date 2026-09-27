import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for `updateSite` (src/actions/sites.ts) committing a site change unaudited.
 *
 * The action wrote the guarded `site.updateMany` on the root client, then called the
 * best-effort `logActivity`, which swallows a failed audit write: the site change stayed
 * committed with no audit trail.
 *
 * Now `updateSite` runs on the same audited update service as `updateSiteDetails`: the
 * assigned-scope site re-read, the guarded write and the immutable audit record share one
 * transaction, so an audit failure rolls the site change back.
 *
 * The transaction mock stages every write issued on `tx` and commits it only when the
 * callback resolves. `@/lib/permissions`, `@/lib/auth/require-module`,
 * `@/lib/auth/site-mutation`, `@/lib/validation/sites`, `@/lib/sites/update-site` and
 * `@/lib/audit-data` are real.
 */
const mocks = vi.hoisted(() => {
  const committed: Array<{ model: string; args: Record<string, unknown> }> = []
  let staged: typeof committed = []

  const tx = {
    site: { findFirst: vi.fn(), updateMany: vi.fn() },
    companyMember: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }

  return {
    requireUser: vi.fn(),
    logActivity: vi.fn(),
    committed,
    tx,
    stage(model: string, args: Record<string, unknown>) {
      staged.push({ model, args })
    },
    async runTransaction(run: (client: typeof tx) => unknown) {
      staged = []
      try {
        const result = await run(tx)
        committed.push(...staged)
        return result
      } finally {
        staged = []
      }
    },
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

const { updateSite } = await import('@/actions/sites')

const SITES: Row[] = [
  {
    id: 'site_1', companyId: 'company_1', name: 'Tower A', location: 'Chennai', status: 'ACTIVE', deletedAt: null,
    budget: 1000, assignedPmId: null, assignedEngineerId: null,
    startDate: new Date('2026-06-01T00:00:00.000Z'), targetEndDate: new Date('2027-06-01T00:00:00.000Z'),
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.committed.length = 0
  mocks.requireUser.mockResolvedValue({ id: 'user_admin', name: 'Admin', email: 'admin@acme.test', role: 'COMPANY_ADMIN', companyId: 'company_1' })
  mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['SITES'], status: 'ACTIVE' })
  mocks.prisma.$transaction.mockImplementation(mocks.runTransaction)
  mocks.tx.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)
  mocks.tx.site.updateMany.mockImplementation(async (args: Record<string, unknown>) => {
    mocks.stage('site.updateMany', args)
    return { count: 1 }
  })
  mocks.tx.companyMember.findMany.mockResolvedValue([{ userId: 'user_pm' }])
  mocks.tx.auditLog.create.mockImplementation(async (args: Record<string, unknown>) => {
    mocks.stage('auditLog.create', args)
    return { id: 'audit_1' }
  })
})

function rootWrites() {
  const { prisma } = mocks
  return [prisma.site.update, prisma.site.updateMany, prisma.auditLog.create, mocks.logActivity]
    .reduce((sum, fn) => sum + fn.mock.calls.length, 0)
}

describe('updateSite: required audit', () => {
  it('rolls the site change back when the audit write fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit store unavailable'))

    await expect(updateSite('site_1', { name: 'Tower A2' })).rejects.toThrow('audit store unavailable')

    expect(mocks.tx.site.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.committed).toEqual([])
    expect(rootWrites()).toBe(0)
  })

  it('commits the guarded write and its audit record with the changed fields', async () => {
    await expect(updateSite('site_1', { name: ' Tower A2 ', budget: '2500', assignedPmId: 'user_pm' }))
      .resolves.toEqual({ success: true, siteId: 'site_1' })

    expect(rootWrites()).toBe(0)
    expect(mocks.tx.site.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'site_1', companyId: 'company_1', deletedAt: null })
    expect(mocks.tx.companyMember.findMany.mock.calls[0][0].where).toMatchObject({ companyId: 'company_1', isActive: true })
    expect(mocks.committed).toEqual([
      {
        model: 'site.updateMany',
        args: {
          where: { id: 'site_1', companyId: 'company_1', deletedAt: null },
          data: { name: 'Tower A2', budget: 2500, assignedPmId: 'user_pm' },
        },
      },
      {
        model: 'auditLog.create',
        args: {
          data: {
            userId: 'user_admin',
            companyId: 'company_1',
            action: 'UPDATE',
            module: 'SITE',
            recordId: 'site_1',
            before: { name: 'Tower A', budget: 1000, assignedPmId: null },
            after: {
              name: 'Tower A2', budget: 2500, assignedPmId: 'user_pm',
              fields: ['name', 'budget', 'assignedPmId'],
              _description: 'Admin updated site "Tower A"',
            },
          },
        },
      },
    ])
  })

  it('refuses a site that is deleted before the transaction re-read, writing nothing', async () => {
    mocks.tx.site.findFirst.mockResolvedValue(null)
    await expect(updateSite('site_1', { name: 'Tower A2' })).rejects.toThrow(/Site not found or access denied/)
    expect(mocks.tx.site.updateMany).not.toHaveBeenCalled()
    expect(mocks.committed).toEqual([])
  })
})
