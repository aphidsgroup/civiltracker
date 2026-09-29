import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'

/**
 * Regression for the labour advance payments, `markLabourPaidAction` (the `/labour`
 * roster) and `markSiteLabourPaid` (the `/sites/[id]/labour` page).
 *
 * Both parsed the amount with `Number()`, so exponent forms, sub-paisa fractions and
 * values past the `Decimal(10, 2)` column were accepted; both paid an inactive worker;
 * both booked the advance on the worker's latest attendance by labour id alone, so a
 * worker moved from site A to site B had the payment written onto a historical site A log
 * (the roster action only narrowed this for field roles); the site page skipped the
 * assigned-site policy; and neither wrote an audit record.
 *
 * Now the amount is strict positive decimal text within the column, the worker must be an
 * active worker of the live company on its current (bound, assigned) site, the advance is
 * booked only on attendance of that same site (else the opening advance), the write is
 * guarded on the balance read, and the immutable audit shares the transaction: an audit
 * failure rolls the payment back.
 *
 * The transaction mock stages writes issued on `tx` and commits them only when the
 * callback resolves. `@/lib/auth/site-mutation` and `@/lib/audit-data` are real; the
 * permission matrix is widened for SITE_ENGINEER so the assigned-site policy is exercised.
 */
const mocks = vi.hoisted(() => {
  const tx = {
    labour: { findFirst: vi.fn(), updateMany: vi.fn() },
    labourAttendance: { findFirst: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    // No salary run has closed the day; payroll-period-lock.test.ts covers a closed one.
    salaryRun: { findFirst: vi.fn(async () => null) },
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
      labourAttendance: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
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
      (role === 'SITE_ENGINEER' && permission === 'labour.manage') || actual.hasPermission(role as never, permission as never),
  }
})
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))

const { markLabourPaidAction } = await import('@/actions/labour')
const { markSiteLabourPaid } = await import('@/actions/site-labour')

const SITES: Row[] = [
  { id: 'site_a', companyId: 'company_1', name: 'Tower A', deletedAt: null, assignedEngineerId: 'user_site_engineer', engineerId: null },
  { id: 'site_b', companyId: 'company_1', name: 'Tower B', deletedAt: null, assignedEngineerId: 'user_site_engineer', engineerId: null },
  { id: 'site_unassigned', companyId: 'company_1', name: 'Tower C', deletedAt: null, assignedEngineerId: 'someone_else', engineerId: null },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', deletedAt: new Date('2026-01-01'), assignedEngineerId: 'user_site_engineer', engineerId: null },
  { id: 'site_foreign', companyId: 'company_2', name: 'Rival', deletedAt: null, assignedEngineerId: 'user_site_engineer', engineerId: null },
]

const LABOUR: Row[] = [
  { id: 'lab_a', companyId: 'company_1', siteId: 'site_a', name: 'Ravi', isActive: true, openingAdvance: 0 },
  // Worked on site A, now moved to site B.
  { id: 'lab_moved', companyId: 'company_1', siteId: 'site_b', name: 'Kumar', isActive: true, openingAdvance: 200 },
  { id: 'lab_inactive', companyId: 'company_1', siteId: 'site_a', name: 'Left', isActive: false, openingAdvance: 0 },
  { id: 'lab_unassigned', companyId: 'company_1', siteId: 'site_unassigned', name: 'Other', isActive: true, openingAdvance: 0 },
  { id: 'lab_dead', companyId: 'company_1', siteId: 'site_dead', name: 'Old', isActive: true, openingAdvance: 0 },
  { id: 'lab_foreign', companyId: 'company_2', siteId: 'site_foreign', name: 'Rival', isActive: true, openingAdvance: 0 },
]

/*
 * The in-memory delegate ignores `orderBy` and returns the first match, so a historical
 * other-site log listed first is what an unbound "latest attendance" query would pick.
 */
function attendanceRows(): Row[] {
  return [
    { id: 'att_moved_history', labourId: 'lab_moved', siteId: 'site_a', date: new Date('2026-09-20'), advance: 50 },
    { id: 'att_a', labourId: 'lab_a', siteId: 'site_a', date: new Date('2026-09-18'), advance: 100.5 },
  ]
}

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

let attendance: Row[]
let committed: Array<[string, Row]>
let staged: Array<[string, Row]>

beforeEach(() => {
  vi.clearAllMocks()
  committed = []
  staged = []
  attendance = attendanceRows()
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['LABOUR'], status: 'ACTIVE' })
  mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: [] })
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)

  const labour = inMemoryDelegate(LABOUR, siteOf)
  const logs = inMemoryDelegate(attendance)
  for (const delegate of [mocks.prisma.labour, mocks.tx.labour]) delegate.findFirst.mockImplementation(labour.findFirst)
  for (const delegate of [mocks.prisma.labourAttendance, mocks.tx.labourAttendance]) delegate.findFirst.mockImplementation(logs.findFirst)
  mocks.tx.labour.updateMany.mockImplementation(async (args: { where: Row; data: Row }) => {
    const result = await labour.updateMany(args)
    if (result.count) staged.push(['labour.updateMany', args.data])
    return result
  })
  mocks.tx.labourAttendance.updateMany.mockImplementation(async (args: { where: Row; data: Row }) => {
    const result = await logs.updateMany(args)
    if (result.count) staged.push(['labourAttendance.updateMany', args.data])
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
  for (const fn of [
    mocks.prisma.labour.updateMany, mocks.prisma.labour.update, mocks.prisma.labourAttendance.updateMany,
    mocks.prisma.labourAttendance.update, mocks.prisma.auditLog.create, mocks.logActivity,
  ]) {
    expect(fn).not.toHaveBeenCalled()
  }
  expect(mocks.revalidatePath).not.toHaveBeenCalled()
}

/* Both public routes, each paying worker `id` from the page it lives on. */
const ROUTES = [
  { name: 'markLabourPaidAction', pay: (id: string, amount: string, siteId: string) => { void siteId; return markLabourPaidAction(form({ id, amount })) } },
  { name: 'markSiteLabourPaid', pay: (id: string, amount: string, siteId: string) => markSiteLabourPaid(siteId, form({ id, amount })) },
]

describe.each(ROUTES)('$name', ({ pay }) => {
  it.each([
    ['exponent', '5e2'],
    ['sub-paisa', '10.001'],
    ['negative', '-10'],
    ['zero', '0'],
    ['over the Decimal(10,2) column', '100000000'],
    ['NaN', 'NaN'],
    ['Infinity', 'Infinity'],
    ['blank', ''],
  ])('rejects a %s amount without writing', async (_label, amount) => {
    await expect(pay('lab_a', amount, 'site_a')).rejects.toThrow(/Invalid payment amount/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  it.each([
    ['an inactive worker', 'lab_inactive', 'site_a'],
    ['a worker of a deleted site', 'lab_dead', 'site_a'],
    ['a foreign-company worker', 'lab_foreign', 'site_a'],
    ['a missing worker', 'missing', 'site_a'],
  ])('refuses %s before any attendance read', async (_label, id, siteId) => {
    await expect(pay(id, '500', siteId)).rejects.toThrow(/Labour not found or access denied/)
    expect(mocks.tx.labourAttendance.findFirst).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  it('books the advance on the latest attendance of the current site, guarded and audited in one transaction', async () => {
    await pay('lab_a', '500.25', 'site_a')

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.labourAttendance.findFirst.mock.calls[0][0]).toMatchObject({
      where: { labourId: 'lab_a', siteId: 'site_a' },
      orderBy: { date: 'desc' },
    })
    expect(mocks.tx.labourAttendance.updateMany).toHaveBeenCalledWith({
      where: { id: 'att_a', labourId: 'lab_a', siteId: 'site_a', advance: 100.5 },
      data: { advance: 600.75 },
    })
    expect(committed.map(([name]) => name)).toEqual(['labourAttendance.updateMany', 'auditLog.create'])

    const audit = mocks.tx.auditLog.create.mock.calls[0][0].data
    expect(audit).toMatchObject({
      companyId: 'company_1', action: 'PAID', module: 'LABOUR', recordId: 'lab_a',
      before: { siteId: 'site_a', attendanceId: 'att_a', attendanceDate: '2026-09-18', advance: 100.5 },
      after: { siteId: 'site_a', attendanceId: 'att_a', attendanceDate: '2026-09-18', advance: 600.75, paidAmount: 500.25 },
    })
    expect(audit.after._description).toMatch(/Ravi/)
    expect(mocks.logActivity).not.toHaveBeenCalled()
  })

  it('never books a moved worker onto historical attendance of another site', async () => {
    await pay('lab_moved', '300', 'site_b')

    expect(mocks.tx.labourAttendance.findFirst.mock.calls[0][0].where).toEqual({ labourId: 'lab_moved', siteId: 'site_b' })
    expect(mocks.tx.labourAttendance.updateMany).not.toHaveBeenCalled()
    expect(mocks.tx.labour.updateMany).toHaveBeenCalledTimes(1)
    const [{ where, data }] = mocks.tx.labour.updateMany.mock.calls[0]
    expect(where).toMatchObject({ id: 'lab_moved', companyId: 'company_1', siteId: 'site_b', isActive: true, openingAdvance: 200 })
    expect(data).toEqual({ openingAdvance: 500 })
    expect(attendance.find((row) => row.id === 'att_moved_history')).toMatchObject({ advance: 50 })

    const audit = mocks.tx.auditLog.create.mock.calls[0][0].data
    expect(audit).toMatchObject({
      action: 'PAID', module: 'LABOUR', recordId: 'lab_moved',
      before: { siteId: 'site_b', attendanceId: null, openingAdvance: 200 },
      after: { siteId: 'site_b', attendanceId: null, openingAdvance: 500, paidAmount: 300 },
    })
    expect(committed.map(([name]) => name)).toEqual(['labour.updateMany', 'auditLog.create'])
  })

  it('books on the current site once the moved worker has attendance there', async () => {
    attendance.push({ id: 'att_b', labourId: 'lab_moved', siteId: 'site_b', date: new Date('2026-09-10'), advance: 0 })
    await pay('lab_moved', '40', 'site_b')
    expect(mocks.tx.labourAttendance.updateMany).toHaveBeenCalledWith({
      where: { id: 'att_b', labourId: 'lab_moved', siteId: 'site_b', advance: 0 },
      data: { advance: 40 },
    })
    expect(mocks.tx.labour.updateMany).not.toHaveBeenCalled()
  })

  it('rolls the attendance advance back when the audit write fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit down'))
    await expect(pay('lab_a', '500', 'site_a')).rejects.toThrow('audit down')
    expect(mocks.tx.labourAttendance.updateMany).toHaveBeenCalledTimes(1)
    expectNothingWritten()
  })

  it('rolls the opening advance back when the audit write fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit down'))
    await expect(pay('lab_moved', '300', 'site_b')).rejects.toThrow('audit down')
    expect(mocks.tx.labour.updateMany).toHaveBeenCalledTimes(1)
    expectNothingWritten()
  })

  it('refuses, without an audit record, when the advance changed under it', async () => {
    mocks.tx.labourAttendance.updateMany.mockResolvedValue({ count: 0 })
    await expect(pay('lab_a', '500', 'site_a')).rejects.toThrow(/Labour advance changed/)
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  it('refuses a payment that would overflow the advance column', async () => {
    mocks.tx.labourAttendance.findFirst.mockResolvedValue({ id: 'att_a', labourId: 'lab_a', siteId: 'site_a', date: new Date('2026-09-18'), advance: 99_999_999 })
    await expect(pay('lab_a', '1', 'site_a')).rejects.toThrow(/exceed/i)
    expect(mocks.tx.labourAttendance.updateMany).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  it('a field role pays only a worker on an assigned site', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    await expect(pay('lab_unassigned', '10', 'site_unassigned')).rejects.toThrow(/access denied/)
    expectNothingWritten()

    await pay('lab_a', '10', 'site_a')
    expect(committed.map(([name]) => name)).toEqual(['labourAttendance.updateMany', 'auditLog.create'])
  })
})

describe('markSiteLabourPaid site binding', () => {
  it.each(['site_dead', 'site_foreign', 'missing'])('refuses URL site %s before any worker read', async (siteId) => {
    await expect(markSiteLabourPaid(siteId, form({ id: 'lab_a', amount: '10' }))).rejects.toThrow(/Site not found or access denied/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  it("refuses a worker of this company whose current site is not the page's site", async () => {
    await expect(markSiteLabourPaid('site_a', form({ id: 'lab_moved', amount: '10' }))).rejects.toThrow(/Labour not found or access denied/)
    expect(mocks.tx.labourAttendance.findFirst).not.toHaveBeenCalled()
    expectNothingWritten()
  })
})
