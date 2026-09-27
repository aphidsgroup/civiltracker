import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'

/**
 * Regression for the subcontractor edit and payment actions rewriting work order, RA
 * billed, advance and retention with no confirmation and no audit trail, on both public
 * routes: `/subcontractors` (`updateSubcontractorAction`, `markSubcontractorPaidAction`)
 * and `/sites/[id]/subcontractors` (`updateSiteSubcontractor`, `markSiteSubcontractorPaid`).
 *
 * Amounts went through `Number()`, so exponent forms, sub-paisa fractions and values past
 * the `Decimal(14, 2)` column were accepted, and on the site page a blank field silently
 * zeroed a balance; an inactive subcontractor could be edited or paid; the site page
 * skipped the assigned-site policy; and neither the edit nor the payment was audited.
 *
 * Now every amount is strict decimal text within the column (absent leaves it unchanged,
 * blank is refused); the subcontractor must be an active one of the live company that is
 * company-wide or on a bound, assigned live site; a change to any financial field needs
 * the subcontractor name typed back and a reason, and a payment always does. The re-read,
 * the write guarded on the balances read and the immutable before/after audit share one
 * transaction, so an audit failure rolls the change back.
 *
 * The transaction mock stages writes issued on `tx` and commits them only when the
 * callback resolves. `@/lib/auth/site-mutation` and `@/lib/audit-data` are real; the
 * permission matrix is widened for SITE_ENGINEER so the assigned-site policy is exercised.
 */
const mocks = vi.hoisted(() => {
  const tx = {
    subcontractor: { findFirst: vi.fn(), updateMany: vi.fn() },
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
      subcontractor: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/permissions')>()
  return {
    ...actual,
    hasPermission: (role: string, permission: string) =>
      (role === 'SITE_ENGINEER' && (permission === 'materials.update' || permission === 'payments.manage')) ||
      actual.hasPermission(role as never, permission as never),
  }
})
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))

const { updateSubcontractorAction, markSubcontractorPaidAction } = await import('@/actions/subcontractors')
const { updateSiteSubcontractor, markSiteSubcontractorPaid } = await import('@/actions/site-subcontractors')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', name: 'Tower A', deletedAt: null, assignedEngineerId: 'user_site_engineer', engineerId: null },
  { id: 'site_unassigned', companyId: 'company_1', name: 'Tower B', deletedAt: null, assignedEngineerId: 'someone_else', engineerId: null },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', deletedAt: new Date('2026-01-01'), assignedEngineerId: 'user_site_engineer', engineerId: null },
  { id: 'site_foreign', companyId: 'company_2', name: 'Rival', deletedAt: null, assignedEngineerId: 'user_site_engineer', engineerId: null },
]

const PROFILE = { phone: '98400 11111', trade: 'Brickwork', gst: '33AAAAA0000A1Z5', status: 'Active' }
const MONEY = { workOrderValue: 100000, raBilled: 40000.5, advance: 10000, retention: 2000 }

const SUBS: Row[] = [
  { id: 'sub_1', companyId: 'company_1', siteId: 'site_1', isActive: true, name: 'Bricks Co', ...PROFILE, ...MONEY },
  { id: 'sub_inactive', companyId: 'company_1', siteId: 'site_1', isActive: false, name: 'Retired Co', ...PROFILE, ...MONEY },
  { id: 'sub_unassigned', companyId: 'company_1', siteId: 'site_unassigned', isActive: true, name: 'Elsewhere Co', ...PROFILE, ...MONEY },
  { id: 'sub_dead', companyId: 'company_1', siteId: 'site_dead', isActive: true, name: 'Old Co', ...PROFILE, ...MONEY },
  { id: 'sub_foreign', companyId: 'company_2', siteId: 'site_foreign', isActive: true, name: 'Rival Co', ...PROFILE, ...MONEY },
]

const siteOf: RelationResolver = (row, key) => {
  if (key !== 'site') return undefined
  return SITES.find((site) => site.id === row.siteId) ?? null
}

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) fd.append(key, value)
  return fd
}

/* The card/edit form echoing the stored balances back unchanged. */
const UNCHANGED_MONEY = { workOrderValue: '100000', raBilled: '40000.50', advance: '10000', retention: '2000' }

const editForm = (overrides: Record<string, string> = {}) =>
  form({ id: 'sub_1', name: 'Bricks Company', ...PROFILE, phone: '98400 22222', ...UNCHANGED_MONEY, ...overrides })

const payForm = (overrides: Record<string, string> = {}) =>
  form({ id: 'sub_1', amount: '28000.50', dangerConfirmText: 'Bricks Co', reason: 'RA bill 3 settled by NEFT', ...overrides })

/* Both public routes for each mutation. */
const UPDATE_ROUTES = [
  { name: 'updateSubcontractorAction', run: (fd: FormData, siteId = 'site_1') => { void siteId; return updateSubcontractorAction(fd) } },
  { name: 'updateSiteSubcontractor', run: (fd: FormData, siteId = 'site_1') => updateSiteSubcontractor(siteId, fd) },
]
const PAY_ROUTES = [
  { name: 'markSubcontractorPaidAction', run: (fd: FormData, siteId = 'site_1') => { void siteId; return markSubcontractorPaidAction(fd) } },
  { name: 'markSiteSubcontractorPaid', run: (fd: FormData, siteId = 'site_1') => markSiteSubcontractorPaid(siteId, fd) },
]

let committed: Array<[string, Row]>
let staged: Array<[string, Row]>

beforeEach(() => {
  vi.clearAllMocks()
  committed = []
  staged = []
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['MATERIALS'], status: 'ACTIVE' })
  mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: [] })
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)

  const subs = inMemoryDelegate(SUBS, siteOf)
  for (const delegate of [mocks.prisma.subcontractor, mocks.tx.subcontractor]) delegate.findFirst.mockImplementation(subs.findFirst)
  mocks.tx.subcontractor.updateMany.mockImplementation(async (args: { where: Row; data: Row }) => {
    const result = await subs.updateMany(args)
    if (result.count) staged.push(['subcontractor.updateMany', args.data])
    return result
  })
  mocks.tx.auditLog.create.mockImplementation(async (args: { data: Row }) => {
    staged.push(['auditLog.create', args.data])
    return { id: 'audit_1' }
  })
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => {
    staged = []
    const result = await fn(mocks.tx)
    committed.push(...staged)
    return result
  })
})

function expectNothingWritten() {
  expect(committed).toEqual([])
  for (const fn of [mocks.prisma.subcontractor.updateMany, mocks.prisma.subcontractor.update, mocks.prisma.auditLog.create, mocks.logActivity]) {
    expect(fn).not.toHaveBeenCalled()
  }
  expect(mocks.revalidatePath).not.toHaveBeenCalled()
}

describe.each(UPDATE_ROUTES)('$name', ({ run }) => {
  it.each([
    ['an exponent work order value', { workOrderValue: '1e5' }],
    ['a sub-paisa RA billed', { raBilled: '40000.505' }],
    ['a negative advance', { advance: '-1' }],
    ['a blank retention', { retention: '' }],
    ['an Infinity work order value', { workOrderValue: 'Infinity' }],
    ['an RA billed over the Decimal(14,2) column', { raBilled: '1000000000000' }],
    ['an unknown status', { status: 'Deleted' }],
    ['a blank status', { status: '' }],
    ['a blank name', { name: ' ' }],
  ])('rejects %s before any transaction', async (_label, overrides) => {
    await expect(run(editForm(overrides))).rejects.toThrow(/invalid|required/i)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  it.each([
    ['an inactive subcontractor', 'sub_inactive'],
    ['a subcontractor of a deleted site', 'sub_dead'],
    ['a foreign-company subcontractor', 'sub_foreign'],
    ['a missing subcontractor', 'missing'],
  ])('refuses %s', async (_label, id) => {
    await expect(run(editForm({ id }))).rejects.toThrow(/Subcontractor not found or access denied/)
    expectNothingWritten()
  })

  it('a profile-only edit writes the profile, guarded on the balances read, and audits it in one transaction', async () => {
    await run(editForm())

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    const [{ where, data }] = mocks.tx.subcontractor.updateMany.mock.calls[0]
    expect(where).toMatchObject({ id: 'sub_1', companyId: 'company_1', isActive: true, ...MONEY })
    expect(data).toEqual({ name: 'Bricks Company', ...PROFILE, phone: '98400 22222' })
    expect(committed.map(([name]) => name)).toEqual(['subcontractor.updateMany', 'auditLog.create'])

    const audit = mocks.tx.auditLog.create.mock.calls[0][0].data
    expect(audit).toMatchObject({
      companyId: 'company_1', action: 'UPDATE', module: 'SUBCONTRACTOR', recordId: 'sub_1',
      before: { name: 'Bricks Co', phone: '98400 11111', ...MONEY },
      after: { name: 'Bricks Company', phone: '98400 22222', ...MONEY },
    })
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })

  it('leaves an absent amount unchanged', async () => {
    const fd = editForm()
    fd.delete('advance')
    fd.delete('retention')
    await run(fd)
    expect(mocks.tx.subcontractor.updateMany.mock.calls[0][0].data).not.toHaveProperty('advance')
    expect(mocks.tx.subcontractor.updateMany.mock.calls[0][0].data).not.toHaveProperty('retention')
  })

  it.each([
    ['work order value', { workOrderValue: '120000' }],
    ['RA billed', { raBilled: '50000' }],
    ['advance', { advance: '0' }],
    ['retention', { retention: '0' }],
  ])('refuses a %s change without the name typed back and a reason', async (_label, change) => {
    await expect(run(editForm(change))).rejects.toThrow(/confirmation text did not match/)
    await expect(run(editForm({ ...change, dangerConfirmText: 'bricks co', reason: 'x' }))).rejects.toThrow(/confirmation text did not match/)
    await expect(run(editForm({ ...change, dangerConfirmText: 'Bricks Co' }))).rejects.toThrow(/reason is required/i)
    await expect(run(editForm({ ...change, dangerConfirmText: 'Bricks Co', reason: 'r'.repeat(501) }))).rejects.toThrow(/at most 500/)
    expectNothingWritten()
  })

  it('a confirmed financial change is written, guarded and audited with its reason', async () => {
    await run(editForm({ raBilled: '52000.25', retention: '2600', dangerConfirmText: 'Bricks Co', reason: 'RA bill 4 certified' }))

    const [{ where, data }] = mocks.tx.subcontractor.updateMany.mock.calls[0]
    expect(where).toMatchObject({ id: 'sub_1', companyId: 'company_1', isActive: true, ...MONEY })
    expect(data).toEqual({ name: 'Bricks Company', ...PROFILE, phone: '98400 22222', raBilled: 52000.25, retention: 2600 })

    const audit = mocks.tx.auditLog.create.mock.calls[0][0].data
    expect(audit).toMatchObject({
      action: 'ADJUST', module: 'SUBCONTRACTOR', recordId: 'sub_1',
      before: MONEY,
      after: { ...MONEY, raBilled: 52000.25, retention: 2600, reason: 'RA bill 4 certified', changed: ['raBilled', 'retention'] },
    })
    expect(audit.after._description).toMatch(/RA bill 4 certified/)
    expect(committed.map(([name]) => name)).toEqual(['subcontractor.updateMany', 'auditLog.create'])
  })

  it('rolls the edit back when the audit write fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit down'))
    await expect(run(editForm({ advance: '15000', dangerConfirmText: 'Bricks Co', reason: 'Advance corrected' }))).rejects.toThrow('audit down')
    expect(mocks.tx.subcontractor.updateMany).toHaveBeenCalledTimes(1)
    expectNothingWritten()
  })

  it('refuses, without an audit record, when the balances changed under it', async () => {
    mocks.tx.subcontractor.updateMany.mockResolvedValue({ count: 0 })
    await expect(run(editForm())).rejects.toThrow(/Subcontractor changed/)
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  it('a field role edits only a subcontractor of an assigned site', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    await expect(run(editForm({ id: 'sub_unassigned' }), 'site_unassigned')).rejects.toThrow(/access denied/)
    expectNothingWritten()
    await expect(run(editForm())).resolves.toBeUndefined()
  })
})

describe.each(PAY_ROUTES)('$name', ({ run }) => {
  it.each([
    ['an exponent', '1e3'],
    ['a sub-paisa', '10.001'],
    ['a negative', '-5'],
    ['a zero', '0'],
    ['an over-column', '1000000000000'],
    ['an Infinity', 'Infinity'],
    ['a blank', ''],
  ])('rejects %s amount before any transaction', async (_label, amount) => {
    await expect(run(payForm({ amount }))).rejects.toThrow(/Invalid payment amount/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  it('needs a reason', async () => {
    await expect(run(payForm({ reason: ' ' }))).rejects.toThrow(/Payment reason is required/)
    expectNothingWritten()
  })

  it.each([
    ['absent', undefined],
    ['wrong', 'Bricks'],
  ])('refuses %s confirmation text', async (_label, typed) => {
    const fd = payForm()
    if (typed === undefined) fd.delete('dangerConfirmText')
    else fd.set('dangerConfirmText', typed)
    await expect(run(fd)).rejects.toThrow(/Payment confirmation text did not match/)
    expectNothingWritten()
  })

  it.each([
    ['an inactive subcontractor', 'sub_inactive'],
    ['a subcontractor of a deleted site', 'sub_dead'],
    ['a foreign-company subcontractor', 'sub_foreign'],
    ['a missing subcontractor', 'missing'],
  ])('refuses %s', async (_label, id) => {
    await expect(run(payForm({ id }))).rejects.toThrow(/Subcontractor not found or access denied/)
    expectNothingWritten()
  })

  it('records the payment on the advance, guarded on the balance read, and audits it in one transaction', async () => {
    await run(payForm())

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.subcontractor.updateMany).toHaveBeenCalledTimes(1)
    const [{ where, data }] = mocks.tx.subcontractor.updateMany.mock.calls[0]
    expect(where).toMatchObject({ id: 'sub_1', companyId: 'company_1', isActive: true, advance: 10000 })
    expect(data).toEqual({ advance: 38000.5 })

    const audit = mocks.tx.auditLog.create.mock.calls[0][0].data
    expect(audit).toMatchObject({
      companyId: 'company_1', action: 'PAID', module: 'SUBCONTRACTOR', recordId: 'sub_1',
      before: { advance: 10000, pending: 28000.5 },
      after: { advance: 38000.5, pending: 0, paidAmount: 28000.5, reason: 'RA bill 3 settled by NEFT' },
    })
    expect(committed.map(([name]) => name)).toEqual(['subcontractor.updateMany', 'auditLog.create'])
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })

  it('rolls the payment back when the audit write fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit down'))
    await expect(run(payForm())).rejects.toThrow('audit down')
    expect(mocks.tx.subcontractor.updateMany).toHaveBeenCalledTimes(1)
    expectNothingWritten()
  })

  it('refuses, without an audit record, when the advance changed under it', async () => {
    mocks.tx.subcontractor.updateMany.mockResolvedValue({ count: 0 })
    await expect(run(payForm())).rejects.toThrow(/Subcontractor changed/)
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  it('refuses a payment that would overflow the advance column', async () => {
    mocks.tx.subcontractor.findFirst.mockResolvedValue({ ...SUBS[0], advance: 999_999_999_999 })
    await expect(run(payForm({ amount: '1' }))).rejects.toThrow(/exceed/i)
    expectNothingWritten()
  })

  it('a field role pays only a subcontractor of an assigned site', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    await expect(run(payForm({ id: 'sub_unassigned', dangerConfirmText: 'Elsewhere Co' }), 'site_unassigned')).rejects.toThrow(/access denied/)
    expectNothingWritten()
    await expect(run(payForm())).resolves.toBeUndefined()
  })
})

describe('site subcontractor URL binding', () => {
  it.each([
    ['updateSiteSubcontractor', (siteId: string) => updateSiteSubcontractor(siteId, editForm())],
    ['markSiteSubcontractorPaid', (siteId: string) => markSiteSubcontractorPaid(siteId, payForm())],
  ])('%s refuses a deleted, foreign or missing URL site before any subcontractor read', async (_name, run) => {
    for (const siteId of ['site_dead', 'site_foreign', 'missing']) {
      await expect(run(siteId)).rejects.toThrow(/Site not found or access denied/)
    }
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  it.each([
    ['updateSiteSubcontractor', () => updateSiteSubcontractor('site_1', editForm({ id: 'sub_unassigned' }))],
    ['markSiteSubcontractorPaid', () => markSiteSubcontractorPaid('site_1', payForm({ id: 'sub_unassigned', dangerConfirmText: 'Elsewhere Co' }))],
  ])('%s refuses a subcontractor of another site of the same company', async (_name, run) => {
    await expect(run()).rejects.toThrow(/Subcontractor not found or access denied/)
    expectNothingWritten()
  })
})
