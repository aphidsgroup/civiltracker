import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for the desktop "Record Expense" page found at f3c09f6.
 *
 * The page carried a nested Server Action that trusted the JWT session, wrote an Expense
 * onto whatever `siteId` the form posted — with no permission check, no approval, no
 * timeline and no transaction — and then incremented `Site.spent` through an unscoped
 * `site.update({ where: { id } })`, so a caller could inflate any tenant's site totals.
 *
 * The page must now resolve the live principal and its permissions before any site
 * read, and its form must post to the hardened, transactional expense action. The
 * permission matrix (`@/lib/permissions`) is real; the Prisma site lookup runs on an
 * in-memory `where` evaluator so a cross-tenant or deleted site is refused by the query.
 */
const mocks = vi.hoisted(() => {
  const committed: Array<{ model: string; data: Record<string, unknown> }> = []
  let staged: typeof committed = []

  const prisma = {
    $transaction: vi.fn(),
    site: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    expense: { create: vi.fn() },
    approval: { create: vi.fn() },
    approvalTimeline: { create: vi.fn() },
  }

  const stage = (model: string, id: string) =>
    vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id, ...data }
      staged.push({ model, data: row })
      return row
    })

  const tx = {
    expense: { create: stage('expense', 'expense_new') },
    approval: { create: stage('approval', 'approval_new') },
    approvalTimeline: { create: stage('approvalTimeline', 'timeline_new') },
    site: { update: vi.fn(), updateMany: vi.fn() },
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
    auth: vi.fn(),
    requireUser: vi.fn(),
    revalidatePath: vi.fn(),
    logActivity: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`)
    }),
    prisma,
    tx,
    committed,
    runTransaction,
  }
})

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))

const { default: NewExpensePage } = await import('@/app/(dashboard)/expenses/new/page')
const { createExpenseFromFormAction } = await import('@/actions/expense')

const PAGE_SOURCE = path.resolve('src/app/(dashboard)/expenses/new/page.tsx')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', name: 'Tower A', deletedAt: null, status: 'ACTIVE' },
  { id: 'site_dead', companyId: 'company_1', name: 'Demolished', deletedAt: new Date('2026-01-01'), status: 'ACTIVE' },
  { id: 'site_other', companyId: 'company_2', name: 'Other tenant', deletedAt: null, status: 'ACTIVE' },
]

function principal(role: string, companyId: string | undefined = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

const SITE_ENGINEER = principal('SITE_ENGINEER')
const SUPER_ADMIN = { id: 'root_1', name: 'Root', email: 'root@platform.test', role: 'SUPER_ADMIN' }

/** Active members that may not record an expense: no expenses.create, or no approval participation. */
const ROLES_WITHOUT_EXPENSE_CREATE = ['ACCOUNTANT', 'PURCHASE_MANAGER', 'SUPERVISOR', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'] as const

function expenseForm(overrides: Record<string, string> = {}) {
  const form = new FormData()
  const fields = {
    siteId: 'site_1',
    amount: '1250.50',
    date: '2026-09-20',
    category: 'MATERIAL',
    paymentMode: 'CASH',
    paidTo: 'Cement Supplier',
    description: 'Cement bags for slab',
    ...overrides,
  }
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  return form
}

function expectNoSiteReads() {
  expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.site.findMany).not.toHaveBeenCalled()
  expect(mocks.prisma.site.findUnique).not.toHaveBeenCalled()
}

function expectNoWrites() {
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  expect(mocks.prisma.expense.create).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.create).not.toHaveBeenCalled()
  expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
  expect(mocks.committed).toEqual([])
  expect(mocks.logActivity).not.toHaveBeenCalled()
}

/** No path may ever touch `Site.spent` directly — the budget sync owns it. */
function expectNoSiteMutation() {
  expect(mocks.prisma.site.update).not.toHaveBeenCalled()
  expect(mocks.prisma.site.updateMany).not.toHaveBeenCalled()
  expect(mocks.tx.site.update).not.toHaveBeenCalled()
  expect(mocks.tx.site.updateMany).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.committed.length = 0
  // The JWT always claims a company: only the live principal may decide.
  mocks.auth.mockResolvedValue({ user: { id: 'user_site_engineer', companyId: 'company_1', role: 'COMPANY_ADMIN' } })
  mocks.requireUser.mockResolvedValue(SITE_ENGINEER)
  mocks.prisma.$transaction.mockImplementation(mocks.runTransaction)

  const sites = inMemoryDelegate(SITES)
  mocks.prisma.site.findFirst.mockImplementation(sites.findFirst)
  mocks.prisma.site.findMany.mockImplementation(sites.findMany)
})

describe('the Record Expense page carries no write path of its own', () => {
  it('delegates to the hardened expense action instead of an inline Server Action', async () => {
    const source = await readFile(PAGE_SOURCE, 'utf8')

    expect(source).not.toContain("'use server'")
    expect(source).not.toMatch(/prisma\.expense\.create/)
    expect(source).not.toMatch(/prisma\.site\.update/)
    expect(source).not.toMatch(/from '@\/lib\/auth'/)
    expect(source).toContain('createExpenseFromFormAction')
  })
})

describe('NewExpensePage read authorization', () => {
  it('refuses a revoked principal before any site read, even with a valid JWT', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    await expect(NewExpensePage()).rejects.toThrow(/UNAUTHORIZED/)
    expectNoSiteReads()
  })

  it.each(ROLES_WITHOUT_EXPENSE_CREATE)('turns an active %s away before any site read', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    await expect(NewExpensePage()).rejects.toThrow(/NEXT_REDIRECT/)
    expectNoSiteReads()
  })

  it('turns a SUPER_ADMIN, which has no company context, away before any site read', async () => {
    mocks.requireUser.mockResolvedValue(SUPER_ADMIN)

    await expect(NewExpensePage()).rejects.toThrow('NEXT_REDIRECT:/super-admin/dashboard')
    expectNoSiteReads()
  })

  it('lists only live, active sites of the live principal company', async () => {
    await NewExpensePage()

    expect(mocks.prisma.site.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.site.findMany.mock.calls[0][0].where).toEqual({
      companyId: 'company_1',
      deletedAt: null,
      status: 'ACTIVE',
    })
  })
})

describe('createExpenseFromFormAction', () => {
  it('refuses a revoked principal before any read or write', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Account is inactive'))

    await expect(createExpenseFromFormAction(expenseForm())).rejects.toThrow(/UNAUTHORIZED/)
    expectNoSiteReads()
    expectNoWrites()
    expectNoSiteMutation()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it.each(ROLES_WITHOUT_EXPENSE_CREATE)('refuses an active %s before any read or write', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    await expect(createExpenseFromFormAction(expenseForm())).rejects.toThrow(/forbidden/i)
    expectNoSiteReads()
    expectNoWrites()
    expectNoSiteMutation()
  })

  it.each([
    ['another tenant', 'site_other'],
    ['a soft-deleted', 'site_dead'],
    ['a missing', 'site_missing'],
  ])('refuses %s site without writing anything', async (_label, siteId) => {
    await expect(createExpenseFromFormAction(expenseForm({ siteId }))).rejects.toThrow(/site not found or access denied/i)

    expectNoWrites()
    expectNoSiteMutation()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('ignores a company the form tries to smuggle in', async () => {
    const form = expenseForm({ siteId: 'site_other' })
    form.set('companyId', 'company_2')

    await expect(createExpenseFromFormAction(form)).rejects.toThrow(/site not found or access denied/i)
    expectNoWrites()
  })

  it.each([
    ['a non-numeric amount', { amount: 'abc' }],
    ['a non-positive amount', { amount: '0' }],
    ['an unknown category', { category: 'BRIBES' }],
    ['an unknown payment mode', { paymentMode: 'BARTER' }],
    ['an invalid date', { date: 'not-a-date' }],
    ['a missing site', { siteId: '' }],
  ])('rejects %s before any read or write', async (_label, overrides) => {
    await expect(createExpenseFromFormAction(expenseForm(overrides))).rejects.toThrow(/invalid expense/i)

    expectNoSiteReads()
    expectNoWrites()
  })

  it('writes the expense, its approval and the timeline in one transaction on the resolved tenant', async () => {
    await expect(createExpenseFromFormAction(expenseForm())).rejects.toThrow('NEXT_REDIRECT:/expenses')

    expect(mocks.prisma.site.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'site_1', companyId: 'company_1', deletedAt: null } })
    )
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.committed.map((entry) => entry.model)).toEqual(['expense', 'approval', 'approvalTimeline'])

    const [expense, approval, timeline] = mocks.committed.map((entry) => entry.data)
    expect(expense).toMatchObject({
      companyId: 'company_1',
      siteId: 'site_1',
      createdById: 'user_site_engineer',
      amount: 1250.5,
      category: 'MATERIAL',
      paymentMode: 'CASH',
      paidTo: 'Cement Supplier',
      description: 'Cement bags for slab',
      billDate: new Date('2026-09-20'),
    })
    expect(approval).toMatchObject({
      companyId: 'company_1',
      siteId: 'site_1',
      entityType: 'EXPENSE',
      entityId: 'expense_new',
      requestedById: 'user_site_engineer',
      currentStatus: 'PENDING',
    })
    expect(timeline).toMatchObject({ companyId: 'company_1', approvalId: 'approval_new', action: 'SUBMITTED' })

    expect(mocks.prisma.expense.create).not.toHaveBeenCalled()
    expect(mocks.prisma.approval.create).not.toHaveBeenCalled()
    expectNoSiteMutation()
    expect(mocks.logActivity).toHaveBeenCalledTimes(1)
  })

  it('rolls the expense back when the approval timeline cannot be written', async () => {
    mocks.tx.approvalTimeline.create.mockRejectedValueOnce(new Error('timeline write failed'))

    await expect(createExpenseFromFormAction(expenseForm())).rejects.toThrow('timeline write failed')

    expect(mocks.tx.expense.create).toHaveBeenCalledTimes(1)
    expect(mocks.committed).toEqual([])
    expectNoSiteMutation()
    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})
