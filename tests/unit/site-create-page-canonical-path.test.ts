import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for `/sites/new` running its own, weaker create-site mutation.
 *
 * The page's `createSiteAction` is a Server Action and so a public POST endpoint. It read
 * `address`, `projectType` and the dates as raw casts: a free-text or impossible date
 * reached `new Date(...)`, an arbitrary or unbounded string was persisted, extra fields
 * were silently ignored, the duplicate-name rule of `createSite` was skipped and no audit
 * record was written.
 *
 * Now the form is mapped onto the canonical `createSite` payload and validated by the same
 * strict schema, assignees are bound to active members of the live company, and the site,
 * its checklist snapshot and a required audit record are written in one transaction under
 * the site limit and the duplicate rule. These tests execute the real form action.
 *
 * `@/lib/permissions`, `@/lib/pages/tenant-page-access`, `@/lib/auth/require-permission`,
 * `@/lib/auth/require-module`, `@/lib/auth/site-mutation` and `@/lib/validation/sites`
 * are real.
 */
const mocks = vi.hoisted(() => {
  const tx = {
    company: { findUnique: vi.fn() },
    companyMember: { findMany: vi.fn() },
    site: { count: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    projectChecklist: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    auth: vi.fn(),
    requireUser: vi.fn(),
    logActivity: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`)
    }),
    notFound: vi.fn(() => {
      throw new Error('NEXT_NOT_FOUND')
    }),
    NewSiteClient: vi.fn(() => null),
    tx,
    prisma: {
      company: { findFirst: vi.fn(), findUnique: vi.fn() },
      companyMember: { findFirst: vi.fn(), findMany: vi.fn() },
      checklistTemplate: { findFirst: vi.fn() },
      site: { count: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
      projectChecklist: { create: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('@/app/(dashboard)/sites/new/NewSiteClient', () => ({ NewSiteClient: mocks.NewSiteClient }))

const { default: NewSitePage } = await import('@/app/(dashboard)/sites/new/page')

const TEMPLATES: Row[] = [{
  id: 'tpl_own', companyId: 'company_1', isGlobal: false,
  stages: [{
    id: 'stage_1', name: 'Foundation', order: 1, weight: 1,
    categories: [{
      id: 'cat_1', name: 'Excavation', order: 1,
      tasks: [
        { id: 'own_t1', name: 'Task own_t1', order: 0, isRequired: true },
        { id: 'own_t2', name: 'Task own_t2', order: 1, isRequired: false },
      ],
    }],
  }],
}]

/** Memberships: only user_pm and user_engineer are active members with active accounts in company_1. */
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

function activeMembers({ where }: { where: MemberWhere }) {
  return MEMBERSHIPS.filter((m) =>
    m.companyId === where.companyId &&
    m.isActive === where.isActive &&
    where.userId.in.includes(m.userId) &&
    (where.user?.isActive === undefined || m.user.isActive === where.user.isActive) &&
    (where.user?.deletedAt === undefined || m.user.deletedAt === where.user.deletedAt)
  ).map((m) => ({ userId: m.userId }))
}

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

type Props = { template: unknown; createSiteAction: (fd: FormData) => Promise<void> }

function findClientProps(node: ReactNode): Props | null {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findClientProps(child)
      if (found) return found
    }
    return null
  }
  const element = node as ReactElement<{ children?: ReactNode }>
  if (element.type === mocks.NewSiteClient) return element.props as unknown as Props
  return findClientProps(element.props?.children)
}

/** Exactly the FormData `NewSiteClient.handleSubmit` builds. */
const UI_FIELDS = {
  name: '  Tower B ',
  location: ' Chennai ',
  address: '12 Anna Salai',
  projectType: 'RESIDENTIAL',
  budget: '5000.50',
  startDate: '2026-10-01',
  targetEndDate: '2027-10-01',
  selectedTaskIds: JSON.stringify(['own_t1']),
  templateId: 'tpl_own',
}

function siteForm(overrides: Record<string, string | Blob | null> = {}) {
  const fd = new FormData()
  for (const [key, value] of Object.entries({ ...UI_FIELDS, ...overrides })) {
    if (value !== null) fd.append(key, value)
  }
  return fd
}

let modules: unknown

async function loadAction() {
  const props = findClientProps((await NewSitePage()) as ReactNode)
  if (!props) throw new Error('NewSiteClient not rendered')
  return props.createSiteAction
}

function expectNoWrites() {
  for (const client of [mocks.prisma, mocks.tx]) {
    expect(client.site.create).not.toHaveBeenCalled()
    expect(client.projectChecklist.create).not.toHaveBeenCalled()
    expect(client.auditLog.create).not.toHaveBeenCalled()
  }
  expect(mocks.logActivity).not.toHaveBeenCalled()
  expect(mocks.redirect).not.toHaveBeenCalled()
  expect(mocks.revalidatePath).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['SITES']
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.auth.mockResolvedValue({ user: principal('COMPANY_ADMIN') })
  mocks.prisma.company.findFirst.mockImplementation(async () => ({ modulesJson: modules }))
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  mocks.prisma.checklistTemplate.findFirst.mockImplementation(inMemoryDelegate(TEMPLATES).findFirst)
  mocks.prisma.companyMember.findMany.mockImplementation(async (args: { where: MemberWhere }) => activeMembers(args))
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx))
  mocks.tx.company.findUnique.mockResolvedValue({ status: 'ACTIVE', siteLimit: 5 })
  mocks.tx.companyMember.findMany.mockImplementation(async (args: { where: MemberWhere }) => activeMembers(args))
  mocks.tx.site.count.mockResolvedValue(1)
  mocks.tx.site.findFirst.mockResolvedValue(null)
  mocks.tx.site.create.mockResolvedValue({ id: 'site_new', companyId: 'company_1' })
  mocks.tx.projectChecklist.create.mockResolvedValue({ id: 'checklist_new' })
  mocks.tx.auditLog.create.mockResolvedValue({ id: 'audit_1' })
})

describe('createSiteAction runs the canonical create-site validation', () => {
  it.each([
    ['a forged status', { status: 'COMPLETED' }],
    ['a forged company', { companyId: 'company_2' }],
    ['a forged spent figure', { spent: '99' }],
    ['a forged creator', { createdById: 'user_other' }],
    ['a forged slug', { slug: 'someone-elses-site' }],
    ['a forged deletion marker', { deletedAt: '2026-01-01' }],
  ])('refuses %s with zero writes', async (_label, overrides) => {
    const action = await loadAction()
    await expect(action(siteForm(overrides))).rejects.toThrow(/Invalid site/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it.each([
    ['an impossible start date', { startDate: '2026-02-30' }],
    ['a free-text start date', { startDate: 'next week' }],
    ['a month out of range', { targetEndDate: '2026-13-01' }],
    ['a timestamp instead of a date', { startDate: '2026-10-01T10:00:00Z' }],
    ['an end date before the start date', { targetEndDate: '2026-01-01' }],
    ['an unknown project type', { projectType: 'CASINO' }],
    ['an exponent budget', { budget: '1e3' }],
    ['a negative budget', { budget: '-5' }],
    ['a budget beyond the column precision', { budget: '1000000000000000' }],
    ['an over-long name', { name: 'x'.repeat(500) }],
    ['an over-long address', { address: 'x'.repeat(5000) }],
    ['a name with no sluggable characters', { name: '!!!' }],
    ['a blank location', { location: '   ' }],
  ])('refuses %s with zero writes', async (_label, overrides) => {
    const action = await loadAction()
    await expect(action(siteForm(overrides))).rejects.toThrow(/Invalid site/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('refuses a repeated field rather than picking one of the values', async () => {
    const action = await loadAction()
    const fd = siteForm()
    fd.append('name', 'Another Tower')
    await expect(action(fd)).rejects.toThrow(/Invalid site/)
    expectNoWrites()
  })

  it('refuses a file where a text field is expected', async () => {
    const action = await loadAction()
    await expect(action(siteForm({ address: new Blob(['x']) }))).rejects.toThrow(/Invalid site/)
    expectNoWrites()
  })

  it.each([
    ['an over-long template id', { templateId: 't'.repeat(500) }],
    ['an unbounded task selection', { selectedTaskIds: JSON.stringify(Array.from({ length: 5000 }, (_, i) => `task_${i}`)) }],
    ['an over-long task id', { selectedTaskIds: JSON.stringify(['t'.repeat(500)]) }],
  ])('refuses %s before any read or write', async (_label, overrides) => {
    const action = await loadAction()
    mocks.prisma.checklistTemplate.findFirst.mockClear()
    await expect(action(siteForm(overrides))).rejects.toThrow(/Invalid|task selection/i)
    expect(mocks.prisma.checklistTemplate.findFirst).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it.each([
    ['a PM of another tenant', { assignedPmId: 'user_foreign' }],
    ['an engineer whose membership was revoked', { assignedEngineerId: 'user_left' }],
    ['a PM whose account is deactivated', { assignedPmId: 'user_disabled' }],
    ['an engineer whose account is deleted', { assignedEngineerId: 'user_deleted' }],
    ['an unknown user', { assignedPmId: 'user_ghost' }],
  ])('refuses %s with zero writes', async (_label, overrides) => {
    const action = await loadAction()
    await expect(action(siteForm(overrides))).rejects.toThrow(/Invalid site: assignee/)
    expectNoWrites()
  })

  it('applies the duplicate-name rule of createSite', async () => {
    const action = await loadAction()
    mocks.tx.site.findFirst.mockResolvedValue({ id: 'site_existing' })
    await expect(action(siteForm())).rejects.toThrow(/already exists/)
    expect(mocks.tx.site.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId: 'company_1', slug: 'tower-b', deletedAt: null },
    }))
    expectNoWrites()
  })

  it('refuses once the plan site limit is reached, with zero writes', async () => {
    const action = await loadAction()
    mocks.tx.site.count.mockResolvedValue(5)
    await expect(action(siteForm())).rejects.toThrow(/Site limit reached/)
    expectNoWrites()
  })

  it('does not report success when the required audit record cannot be written', async () => {
    const action = await loadAction()
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit store down'))
    await expect(action(siteForm())).rejects.toThrow('audit store down')
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses a principal without sites.create before parsing the form', async () => {
    const action = await loadAction()
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    await expect(action(siteForm({ status: 'COMPLETED' }))).rejects.toThrow(/sites\.create/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('refuses when SITES was switched off, before parsing the form', async () => {
    const action = await loadAction()
    modules = ['EXPENSES']
    await expect(action(siteForm({ startDate: 'garbage' }))).rejects.toThrow(/Module SITES is not enabled/)
    expectNoWrites()
  })

  it('creates the normalized site, its checklist and the audit record in one transaction', async () => {
    const action = await loadAction()
    await expect(action(siteForm({ assignedPmId: 'user_pm', assignedEngineerId: 'user_engineer' }))).rejects.toThrow('NEXT_REDIRECT:/sites')

    expect(mocks.prisma.site.create).not.toHaveBeenCalled()
    expect(mocks.tx.site.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.site.create.mock.calls[0][0].data).toEqual({
      companyId: 'company_1',
      name: 'Tower B',
      slug: 'tower-b',
      location: 'Chennai',
      address: '12 Anna Salai',
      clientName: null,
      clientPhone: null,
      clientEmail: null,
      mapLink: null,
      projectType: 'RESIDENTIAL',
      contractType: null,
      areaSqft: null,
      floors: null,
      budget: 5000.5,
      contractValue: null,
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      targetEndDate: new Date('2027-10-01T00:00:00.000Z'),
      assignedPmId: 'user_pm',
      assignedEngineerId: 'user_engineer',
      status: 'PLANNING',
      createdById: 'user_company_admin',
    })
    const checklist = mocks.tx.projectChecklist.create.mock.calls[0][0].data
    expect(checklist).toMatchObject({ siteId: 'site_new', templateId: 'tpl_own', companyId: 'company_1' })
    expect(checklist.stages.create[0].categories.create[0].tasks.create.map((t: { name: string }) => t.name)).toEqual(['Task own_t1'])

    expect(mocks.logActivity).not.toHaveBeenCalled()
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
    expect(mocks.tx.auditLog.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.auditLog.create.mock.calls[0][0].data).toMatchObject({
      userId: 'user_company_admin',
      companyId: 'company_1',
      action: 'CREATE',
      module: 'SITE',
      recordId: 'site_new',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites')
  })

  it('accepts the unedited blank optional fields the UI always sends', async () => {
    const action = await loadAction()
    const blanks = { address: '', projectType: '', budget: '', startDate: '', targetEndDate: '', templateId: '', selectedTaskIds: '[]' }
    await expect(action(siteForm(blanks))).rejects.toThrow('NEXT_REDIRECT:/sites')

    expect(mocks.tx.companyMember.findMany).not.toHaveBeenCalled()
    expect(mocks.tx.site.create.mock.calls[0][0].data).toMatchObject({
      name: 'Tower B', location: 'Chennai', address: null, projectType: null, budget: 0, startDate: null, targetEndDate: null,
    })
    expect(mocks.tx.projectChecklist.create).not.toHaveBeenCalled()
    expect(mocks.tx.auditLog.create).toHaveBeenCalledTimes(1)
  })
})
