import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Module gates on the expense Server Actions (`createExpenseAction`, the mobile add-expense
 * / upload-bill action, and `createExpenseFromFormAction`, the desktop form action).
 *
 * Both actions checked the live role's permissions but never the company modules, so a
 * member of a company with EXPENSES switched off could still post an expense — and with
 * BILLS switched off could still file a bill against a stored upload — by invoking the
 * action directly.
 *
 * Policy, matching the rest of the product:
 *  - EXPENSES must be enabled for every expense write (`POST /api/expenses` gates on it).
 *  - BILLS must also be enabled when a bill attachment is filed (`UPLOAD_POLICIES.BILL`).
 *  - APPROVALS is *not* required: entity-creation flows (`createDpr`, `POST /api/expenses`)
 *    raise their approval without it; that module gates the approval queue itself.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module` and `@/lib/auth/site-mutation` are real;
 * only the principal, Prisma and side-effect modules are mocked.
 */
const mocks = vi.hoisted(() => {
  const committed: Array<{ model: string; data: Record<string, unknown> }> = []
  let staged: typeof committed = []

  const stage = (model: string, id: string) =>
    vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id, ...data }
      staged.push({ model, data: row })
      return row
    })

  const tx = {
    mediaAsset: { findFirst: vi.fn() },
    billAttachment: { findFirst: vi.fn() },
    expense: { create: stage('expense', 'expense_1') },
    approval: { create: stage('approval', 'approval_1') },
    approvalTimeline: { create: stage('approvalTimeline', 'timeline_1') },
  }

  const prisma = {
    $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => {
      staged = []
      try {
        const result = await run(tx)
        committed.push(...staged)
        return result
      } finally {
        staged = []
      }
    }),
    company: { findUnique: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findFirst: vi.fn() },
    mediaAsset: { findFirst: vi.fn() },
    expense: { create: vi.fn() },
    billAttachment: { create: vi.fn() },
    approval: { create: vi.fn() },
    approvalTimeline: { create: vi.fn() },
  }

  return {
    requireUser: vi.fn(),
    logActivity: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`)
    }),
    prisma,
    tx,
    committed,
  }
})

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))

const { createExpenseAction, createExpenseFromFormAction } = await import('@/actions/expense')

const SITE_ENGINEER = {
  id: 'engineer_1',
  name: 'Engineer',
  email: 'engineer@acme.test',
  role: 'SITE_ENGINEER',
  companyId: 'company_1',
}

const EXPENSE_INPUT = {
  siteId: 'site_1',
  amount: 1250,
  category: 'MATERIAL' as const,
  paymentMode: 'CASH' as const,
  paidTo: 'Supplier',
  notes: 'Cement bags',
}

const BILL_INPUT = { ...EXPENSE_INPUT, billNumber: 'INV-7', mediaAssetId: 'asset_inv7' }

function expenseForm() {
  const form = new FormData()
  const fields = {
    siteId: 'site_1',
    amount: '1250.50',
    date: '2026-09-20',
    category: 'MATERIAL',
    paymentMode: 'CASH',
    paidTo: 'Cement Supplier',
    description: 'Cement bags for slab',
  }
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  return form
}

let modules: unknown

/** No user-controlled resource — site, membership scope, upload — was read. */
function expectNoResourceReads() {
  expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.mediaAsset.findFirst).not.toHaveBeenCalled()
  expect(mocks.tx.mediaAsset.findFirst).not.toHaveBeenCalled()
  expect(mocks.tx.billAttachment.findFirst).not.toHaveBeenCalled()
}

/** No expense, bill attachment, media binding or approval was written anywhere. */
function expectNoWrites() {
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  expect(mocks.tx.expense.create).not.toHaveBeenCalled()
  expect(mocks.tx.approval.create).not.toHaveBeenCalled()
  expect(mocks.tx.approvalTimeline.create).not.toHaveBeenCalled()
  expect(mocks.prisma.expense.create).not.toHaveBeenCalled()
  expect(mocks.prisma.billAttachment.create).not.toHaveBeenCalled()
  expect(mocks.prisma.approval.create).not.toHaveBeenCalled()
  expect(mocks.prisma.approvalTimeline.create).not.toHaveBeenCalled()
  expect(mocks.committed).toEqual([])
  expect(mocks.logActivity).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.committed.length = 0
  modules = ['EXPENSES', 'BILLS', 'APPROVALS']
  mocks.requireUser.mockResolvedValue(SITE_ENGINEER)
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: ['site_1'] })
  mocks.prisma.site.findFirst.mockResolvedValue({ id: 'site_1', companyId: 'company_1', name: 'Tower A' })
  mocks.tx.mediaAsset.findFirst.mockResolvedValue({
    cloudinaryPublicId: 'bills/inv7',
    secureUrl: 'https://res.cloudinary.test/bills/inv7.jpg',
    format: 'jpg',
    bytes: 2048,
    width: null,
    height: null,
    originalName: 'inv7.jpg',
  })
  mocks.tx.billAttachment.findFirst.mockResolvedValue(null)
})

describe('createExpenseAction module gates', () => {
  it.each([
    ['an expense', EXPENSE_INPUT],
    ['a bill', BILL_INPUT],
  ])('refuses %s when EXPENSES is disabled, before any read or write', async (_label, input) => {
    modules = ['BILLS', 'APPROVALS']

    await expect(createExpenseAction(input)).rejects.toThrow(/Module EXPENSES is not enabled/)
    expectNoResourceReads()
    expectNoWrites()
  })

  it('refuses a bill when BILLS is disabled, before the upload or site is read', async () => {
    modules = ['EXPENSES', 'APPROVALS']

    await expect(createExpenseAction(BILL_INPUT)).rejects.toThrow(/Module BILLS is not enabled/)
    expectNoResourceReads()
    expectNoWrites()
  })

  it('refuses when the module object switches EXPENSES off', async () => {
    modules = { expenses: false, bills: true, approvals: true }

    await expect(createExpenseAction(EXPENSE_INPUT)).rejects.toThrow(/Module EXPENSES is not enabled/)
    expectNoResourceReads()
    expectNoWrites()
  })

  it('still records a plain expense when only BILLS is disabled', async () => {
    modules = ['EXPENSES', 'APPROVALS']

    await expect(createExpenseAction(EXPENSE_INPUT)).resolves.toEqual({ success: true, expenseId: 'expense_1' })
    expect(mocks.committed.map((entry) => entry.model)).toEqual(['expense', 'approval', 'approvalTimeline'])
  })

  it('does not require the APPROVALS module to raise the expense approval', async () => {
    modules = ['EXPENSES', 'BILLS']

    await expect(createExpenseAction(BILL_INPUT)).resolves.toEqual({ success: true, expenseId: 'expense_1' })
    expect(mocks.committed.map((entry) => entry.model)).toEqual(['expense', 'approval', 'approvalTimeline'])
  })

  it('checks the modules of the live principal company', async () => {
    await createExpenseAction(BILL_INPUT)

    for (const [args] of mocks.prisma.company.findUnique.mock.calls) {
      expect(args.where).toEqual({ id: 'company_1' })
    }
    expect(mocks.prisma.company.findUnique).toHaveBeenCalled()
  })
})

describe('createExpenseFromFormAction module gates', () => {
  it('refuses when EXPENSES is disabled, before any read or write', async () => {
    modules = ['BILLS', 'APPROVALS']

    await expect(createExpenseFromFormAction(expenseForm())).rejects.toThrow(/Module EXPENSES is not enabled/)
    expectNoResourceReads()
    expectNoWrites()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('records the expense when EXPENSES is enabled, without needing BILLS or APPROVALS', async () => {
    modules = ['EXPENSES']

    await expect(createExpenseFromFormAction(expenseForm())).rejects.toThrow('NEXT_REDIRECT:/expenses')
    expect(mocks.committed.map((entry) => entry.model)).toEqual(['expense', 'approval', 'approvalTimeline'])
  })
})
