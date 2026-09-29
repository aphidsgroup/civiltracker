import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for the mobile Upload Bill, Add Expense and Client Advance pages.
 *
 * Each page only resolved a principal and then listed every live site of its company —
 * `/mobile/upload-bill` even non-ACTIVE ones — to any member: a CLIENT, a VENDOR or an
 * ACCOUNTANT could enumerate site names and ids, a SITE_ENGINEER or SUPERVISOR was offered
 * sites it is not assigned to (which the downstream actions then refuse), the module
 * switches were ignored, and a `?siteId=` of any site was handed to the form as its
 * default destination.
 *
 * Now every page checks the live permissions its downstream action needs and the matching
 * module before any site query, lists only ACTIVE live sites in the principal's
 * `assignedSiteScope`, and preselects a site only when it is in that list:
 *
 *  - upload-bill:        `bills.upload` + BILLS, and `expenses.create` + `approvals.view`
 *  - add-expense:        `expenses.create` + EXPENSES, and `approvals.view`
 *  - add-client-advance: `payments.manage` + CLIENTS
 *
 * The writes themselves stay in the hardened `createExpenseAction` / `createClientAdvance`.
 * `@/lib/pages/tenant-page-access`, `@/lib/auth/site-mutation` and `@/lib/permissions` are real.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireUser: vi.fn(),
  billProps: vi.fn(),
  expenseProps: vi.fn(),
  advanceProps: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  prisma: {
    company: { findFirst: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('@/components/mobile/MobileUploadBillClient', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.billProps(props)
    return null
  },
}))
vi.mock('@/components/mobile/MobileAddExpenseClient', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.expenseProps(props)
    return null
  },
}))
vi.mock('@/components/mobile/MobileClientAdvanceClient', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.advanceProps(props)
    return null
  },
}))

const { default: UploadBillPage } = await import('@/app/(mobile)/mobile/upload-bill/page')
const { default: AddExpensePage } = await import('@/app/(mobile)/mobile/add-expense/page')
const { default: ClientAdvancePage } = await import('@/app/(mobile)/mobile/add-client-advance/page')

const SITES: Row[] = [
  { id: 'site_mine', companyId: 'company_1', name: 'Mine', location: 'A', deletedAt: null, status: 'ACTIVE', assignedEngineerId: null, engineerId: null },
  { id: 'site_engineer', companyId: 'company_1', name: 'Engineered', location: 'B', deletedAt: null, status: 'ACTIVE', assignedEngineerId: null, engineerId: 'user_field' },
  { id: 'site_hold', companyId: 'company_1', name: 'On hold', location: 'C', deletedAt: null, status: 'ON_HOLD', assignedEngineerId: 'user_field', engineerId: null },
  { id: 'site_theirs', companyId: 'company_1', name: 'Theirs', location: 'D', deletedAt: null, status: 'ACTIVE', assignedEngineerId: 'someone_else', engineerId: null },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', location: 'E', deletedAt: new Date('2026-01-01'), status: 'ACTIVE', assignedEngineerId: 'user_field', engineerId: null },
  { id: 'site_other', companyId: 'company_2', name: 'Other tenant', location: 'F', deletedAt: null, status: 'ACTIVE', assignedEngineerId: 'user_field', engineerId: null },
]

const MEMBERS: Row[] = [
  { userId: 'user_field', companyId: 'company_1', isActive: true, siteIds: ['site_mine'] },
  { userId: 'user_field', companyId: 'company_1', isActive: false, siteIds: ['site_theirs'] },
]

const FIELD_ROLES = ['SITE_ENGINEER', 'SUPERVISOR', 'SUBCONTRACTOR']

function principal(role: string) {
  const id = FIELD_ROLES.includes(role) ? 'user_field' : `user_${role.toLowerCase()}`
  return { id, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId: 'company_1' }
}

const ALL_MODULES = ['SITES', 'BILLS', 'EXPENSES', 'CLIENTS', 'APPROVALS']
let modules: unknown

const P = (siteId?: string) => ({ searchParams: Promise.resolve({ siteId }) })

/** Renders the page element so the mocked client component actually receives its props. */
async function render(element: Promise<unknown>) {
  return renderToStaticMarkup((await element) as ReactElement)
}

type PageCase = {
  name: string
  run: (siteId?: string) => Promise<unknown>
  props: ReturnType<typeof vi.fn>
  module: string
  allowed: string[]
  denied: Array<[role: string, redirectTo: string]>
}

const PAGES: PageCase[] = [
  {
    name: '/mobile/upload-bill',
    run: (siteId) => render(UploadBillPage(P(siteId))),
    props: mocks.billProps,
    module: 'BILLS',
    allowed: ['COMPANY_ADMIN', 'PROJECT_MANAGER', 'SITE_ENGINEER'],
    // PURCHASE_MANAGER and VENDOR hold bills.upload but may not raise the expense approval.
    denied: [['ACCOUNTANT', '/dashboard'], ['PURCHASE_MANAGER', '/dashboard'], ['VENDOR', '/dashboard'], ['SUPERVISOR', '/mobile/home'], ['SUBCONTRACTOR', '/dashboard'], ['CLIENT', '/client-portal']],
  },
  {
    name: '/mobile/add-expense',
    run: (siteId) => render(AddExpensePage(P(siteId))),
    props: mocks.expenseProps,
    module: 'EXPENSES',
    allowed: ['COMPANY_ADMIN', 'PROJECT_MANAGER', 'SITE_ENGINEER'],
    denied: [['ACCOUNTANT', '/dashboard'], ['PURCHASE_MANAGER', '/dashboard'], ['VENDOR', '/dashboard'], ['SUPERVISOR', '/mobile/home'], ['SUBCONTRACTOR', '/dashboard'], ['CLIENT', '/client-portal']],
  },
  {
    name: '/mobile/add-client-advance',
    run: (siteId) => render(ClientAdvancePage(P(siteId))),
    props: mocks.advanceProps,
    module: 'CLIENTS',
    allowed: ['COMPANY_ADMIN', 'ACCOUNTANT'],
    denied: [['PROJECT_MANAGER', '/dashboard'], ['PURCHASE_MANAGER', '/dashboard'], ['SITE_ENGINEER', '/mobile/home'], ['SUPERVISOR', '/mobile/home'], ['VENDOR', '/dashboard'], ['SUBCONTRACTOR', '/dashboard'], ['CLIENT', '/client-portal']],
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  modules = ALL_MODULES
  // The JWT always claims an admin; only the live principal decides.
  mocks.auth.mockResolvedValue({ user: principal('COMPANY_ADMIN') })
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findFirst.mockImplementation(async () => ({ modulesJson: modules }))
  mocks.prisma.companyMember.findFirst.mockImplementation(inMemoryDelegate(MEMBERS).findFirst)
  mocks.prisma.site.findMany.mockImplementation(inMemoryDelegate(SITES).findMany)
})

function expectNoSiteReads() {
  expect(mocks.prisma.site.findMany).not.toHaveBeenCalled()
  expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
}

function rendered(props: ReturnType<typeof vi.fn>) {
  expect(props).toHaveBeenCalledTimes(1)
  const received = props.mock.calls[0][0] as { sites: Row[]; defaultSiteId?: string; defaultSiteName?: string }
  return { ...received, siteIds: received.sites.map((site) => site.id).sort() }
}

describe.each(PAGES)('$name gate', ({ run, props, module, allowed, denied }) => {
  it('refuses a revoked principal before any site query', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))
    await expect(run()).rejects.toThrow(/UNAUTHORIZED/)
    expectNoSiteReads()
    expect(props).not.toHaveBeenCalled()
  })

  it('turns a SUPER_ADMIN, which has no tenant context, away before any site query', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root', name: 'Root', email: 'root@x', role: 'SUPER_ADMIN' })
    await expect(run()).rejects.toThrow('NEXT_REDIRECT:/super-admin/dashboard')
    expectNoSiteReads()
  })

  it.each(denied)('turns a live %s away to %s before any site query', async (role, redirectTo) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(run()).rejects.toThrow(`NEXT_REDIRECT:${redirectTo}`)
    expectNoSiteReads()
    expect(props).not.toHaveBeenCalled()
  })

  it.each(allowed)(`turns a live %s away when ${module} is disabled`, async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    modules = ALL_MODULES.filter((name) => name !== module)
    await expect(run()).rejects.toThrow(/NEXT_REDIRECT|NEXT_NOT_FOUND/)
    expectNoSiteReads()
    expect(props).not.toHaveBeenCalled()
  })

  it.each(allowed)('lets a live %s in', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await run()
    expect(props).toHaveBeenCalledTimes(1)
  })
})

describe.each(PAGES)('$name site picker', ({ run, props, allowed }) => {
  const privileged = allowed.find((role) => role === 'COMPANY_ADMIN')!

  it('offers a privileged role every ACTIVE live site of its company only', async () => {
    mocks.requireUser.mockResolvedValue(principal(privileged))
    await run('site_theirs')
    const { siteIds, defaultSiteId } = rendered(props)
    expect(siteIds).toEqual(['site_engineer', 'site_mine', 'site_theirs'])
    expect(defaultSiteId).toBe('site_theirs')
  })

  it.each(['site_other', 'site_dead', 'site_hold', 'missing'])('never preselects %s outside the picker', async (siteId) => {
    mocks.requireUser.mockResolvedValue(principal(privileged))
    await run(siteId)
    const received = rendered(props)
    expect(received.defaultSiteId).toBeUndefined()
    if ('defaultSiteName' in received) expect(['Other tenant', 'Gone', 'On hold']).not.toContain(received.defaultSiteName)
  })
})

describe.each(PAGES.filter((page) => page.allowed.includes('SITE_ENGINEER')))('$name for a field role', ({ run, props }) => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
  })

  it('offers only ACTIVE assigned live sites', async () => {
    await run('site_mine')
    const { siteIds, defaultSiteId, defaultSiteName } = rendered(props)
    expect(siteIds).toEqual(['site_engineer', 'site_mine'])
    expect(defaultSiteId).toBe('site_mine')
    expect(defaultSiteName).toBe('Mine')
  })

  it('never hands an unassigned site to the form as its destination or label', async () => {
    await run('site_theirs')
    const { siteIds, defaultSiteId, defaultSiteName } = rendered(props)
    expect(siteIds).not.toContain('site_theirs')
    expect(defaultSiteId).toBeUndefined()
    expect(defaultSiteName).not.toBe('Theirs')
  })

  it('offers nothing through a deactivated membership', async () => {
    mocks.prisma.companyMember.findFirst.mockResolvedValue(null)
    await run('site_mine')
    const { siteIds, defaultSiteId } = rendered(props)
    expect(siteIds).toEqual(['site_engineer'])
    expect(defaultSiteId).toBeUndefined()
  })
})
