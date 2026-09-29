import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'

/**
 * Regression for `deactivateSiteLabour` being a silent, unconfirmed action.
 *
 * The page prompts for the worker's name and sends it as `dangerConfirmText`, but the
 * action ignored it: a direct call with only a worker id deactivated the worker, and no
 * audit record was written.
 *
 * Now the action binds the URL site through the assigned-site mutation gate, re-reads the
 * worker inside one transaction, compares the confirmation with that worker's current
 * name, deactivates with a guarded write and writes the audit record on the same
 * transaction client — an audit failure fails the deactivation.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module` and `@/lib/auth/site-mutation` are real.
 */
const mocks = vi.hoisted(() => {
  const tx = {
    labour: { findFirst: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    requireUser: vi.fn(),
    revalidatePath: vi.fn(),
    logActivity: vi.fn(),
    tx,
    prisma: {
      company: { findUnique: vi.fn() },
      companyMember: { findFirst: vi.fn() },
      site: { findFirst: vi.fn() },
      labour: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))

const { deactivateSiteLabour } = await import('@/actions/site-labour')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', name: 'Tower A', deletedAt: null },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', deletedAt: new Date('2026-01-01') },
]

let labourRows: Row[]

const siteRelation: RelationResolver = (row, key) => (key === 'site' ? SITES.find((s) => s.id === row.siteId) ?? null : undefined)

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.append(key, value)
  return fd
}

function writes() {
  return mocks.tx.labour.updateMany.mock.calls.length + mocks.prisma.labour.updateMany.mock.calls.length + mocks.prisma.labour.update.mock.calls.length
}

beforeEach(() => {
  vi.clearAllMocks()
  labourRows = [
    { id: 'lab_1', companyId: 'company_1', siteId: 'site_1', name: 'Ravi Kumar', trade: 'MASON', isActive: true },
    { id: 'lab_dead', companyId: 'company_1', siteId: 'site_dead', name: 'Old', trade: 'MASON', isActive: true },
  ]
  mocks.requireUser.mockResolvedValue({ id: 'user_admin', name: 'Admin', email: 'admin@acme.test', role: 'COMPANY_ADMIN', companyId: 'company_1' })
  mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['LABOUR'], status: 'ACTIVE' })
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)
  mocks.tx.labour.findFirst.mockImplementation((args: Row) => inMemoryDelegate(labourRows, siteRelation).findFirst(args))
  mocks.tx.labour.updateMany.mockImplementation((args: Row) => inMemoryDelegate(labourRows, siteRelation).updateMany(args))
  mocks.tx.auditLog.create.mockResolvedValue({})
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx))
})

describe('deactivateSiteLabour', () => {
  it.each([
    ['no confirmation (direct forged call)', {}],
    ['an empty confirmation', { dangerConfirmText: '' }],
    ['a wrong name', { dangerConfirmText: 'Someone Else' }],
    ['the worker id', { dangerConfirmText: 'lab_1' }],
  ])('refuses %s without writing or auditing', async (_label, fields) => {
    await expect(deactivateSiteLabour('site_1', form({ id: 'lab_1', ...fields }))).rejects.toThrow(/did not match/)
    expect(writes()).toBe(0)
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('checks the confirmation against the worker re-read in the transaction', async () => {
    labourRows[0] = { ...labourRows[0], name: 'Renamed' }
    await expect(deactivateSiteLabour('site_1', form({ id: 'lab_1', dangerConfirmText: 'Ravi Kumar' }))).rejects.toThrow(/did not match/)
    expect(writes()).toBe(0)
  })

  it('refuses a deleted site before reading the worker', async () => {
    await expect(deactivateSiteLabour('site_dead', form({ id: 'lab_dead', dangerConfirmText: 'Old' }))).rejects.toThrow(/Site not found or access denied/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(writes()).toBe(0)
  })

  it('fails the deactivation when the audit record cannot be written', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit write failed'))
    await expect(deactivateSiteLabour('site_1', form({ id: 'lab_1', dangerConfirmText: 'Ravi Kumar' }))).rejects.toThrow(/audit write failed/)
    expect(mocks.prisma.labour.updateMany).not.toHaveBeenCalled()
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('deactivates and audits on one transaction with the exact confirmation', async () => {
    await deactivateSiteLabour('site_1', form({ id: 'lab_1', dangerConfirmText: ' Ravi Kumar ' }))
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.labour.updateMany).toHaveBeenCalledWith({
      where: { id: 'lab_1', companyId: 'company_1', siteId: 'site_1', site: { deletedAt: null } },
      data: { isActive: false },
    })
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user_admin', companyId: 'company_1', action: 'UPDATE', module: 'LABOUR', recordId: 'lab_1',
        before: expect.objectContaining({ isActive: true, siteId: 'site_1', name: 'Ravi Kumar' }),
        after: expect.objectContaining({ isActive: false, siteId: 'site_1', name: 'Ravi Kumar' }),
      }),
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites/site_1/labour')
  })
})
