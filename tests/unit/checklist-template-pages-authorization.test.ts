import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for `/checklists` and `/checklists/[id]` reading from JWT claims.
 *
 * Both pages trusted the token's company id, so a revoked member, a demoted role (a CLIENT
 * or SITE_ENGINEER) or a company with TASKS switched off still read the company's template
 * trees. The index listed every template flagged global — including a row that also
 * carried a tenant's company id — and its per-template "Sites" count summed checklists
 * of every tenant. The editor accepted any template id through a unique lookup.
 *
 * Now both pages run the live tenant gate for `tasks.manage` + TASKS before any template
 * read. The index lists global templates only when they are owned by no company and the
 * caller's own non-global templates, and counts only the caller's project checklists. The
 * editor opens only a non-global template of exactly the live company.
 *
 * `@/lib/permissions` and `@/lib/pages/tenant-page-access` are real.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireUser: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  prisma: {
    company: { findFirst: vi.fn() },
    checklistTemplate: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('@/app/(dashboard)/checklists/CloneTemplateBtn', () => ({ CloneTemplateBtn: () => null }))
vi.mock('@/app/(dashboard)/checklists/[id]/TemplateBuilderClient', () => ({ TemplateBuilderClient: () => null }))

const { default: ChecklistsIndexPage } = await import('@/app/(dashboard)/checklists/page')
const { default: EditTemplatePage } = await import('@/app/(dashboard)/checklists/[id]/page')

const TEMPLATES: Row[] = [
  { id: 'tpl_global', companyId: null, isGlobal: true, stages: [], _count: { stages: 0, projects: 0 } },
  { id: 'tpl_own', companyId: 'company_1', isGlobal: false, stages: [], _count: { stages: 0, projects: 0 } },
  { id: 'tpl_own_flagged_global', companyId: 'company_1', isGlobal: true, stages: [], _count: { stages: 0, projects: 0 } },
  { id: 'tpl_foreign', companyId: 'company_2', isGlobal: false, stages: [], _count: { stages: 0, projects: 0 } },
  { id: 'tpl_foreign_flagged_global', companyId: 'company_2', isGlobal: true, stages: [], _count: { stages: 0, projects: 0 } },
]

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

const params = (id: string) => Promise.resolve({ id })

function expectNoTemplateReads() {
  for (const read of Object.values(mocks.prisma.checklistTemplate)) expect(read).not.toHaveBeenCalled()
}

let modules: unknown

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['SITES', 'TASKS']
  mocks.auth.mockResolvedValue({ user: { id: 'user_token', role: 'COMPANY_ADMIN', companyId: 'company_2' } })
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findFirst.mockImplementation(async () => ({ modulesJson: modules }))
  const delegate = inMemoryDelegate(TEMPLATES)
  mocks.prisma.checklistTemplate.findMany.mockImplementation(delegate.findMany)
  mocks.prisma.checklistTemplate.findFirst.mockImplementation(delegate.findFirst)
  mocks.prisma.checklistTemplate.findUnique.mockImplementation(delegate.findFirst)
})

const PAGES: Array<[string, () => Promise<unknown>]> = [
  ['/checklists', () => ChecklistsIndexPage()],
  ['/checklists/[id]', () => EditTemplatePage({ params: params('tpl_own') })],
]

describe.each(PAGES)('%s gate', (_path, render) => {
  it('refuses a revoked principal whose token is still valid, before any template read', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))
    await expect(render()).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.auth).not.toHaveBeenCalled()
    expectNoTemplateReads()
  })

  it.each([['CLIENT', '/client-portal'], ['SITE_ENGINEER', '/mobile/home'], ['ACCOUNTANT', '/dashboard']])(
    'turns away a live %s without tasks.manage',
    async (role, home) => {
      mocks.requireUser.mockResolvedValue(principal(role))
      await expect(render()).rejects.toThrow(`NEXT_REDIRECT:${home}`)
      expectNoTemplateReads()
    },
  )

  it('turns away when TASKS is disabled for the live company', async () => {
    modules = ['SITES']
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/dashboard')
    expectNoTemplateReads()
  })

  it('turns away SUPER_ADMIN, which has no tenant context', async () => {
    mocks.requireUser.mockResolvedValue({ ...principal('SUPER_ADMIN'), companyId: undefined })
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/super-admin/dashboard')
    expectNoTemplateReads()
  })
})

describe('/checklists template policy', () => {
  it('lists unowned global masters and the live company\'s own templates only', async () => {
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER'))
    await ChecklistsIndexPage()

    const results = await Promise.all(
      mocks.prisma.checklistTemplate.findMany.mock.results.map((result) => result.value as Promise<Row[]>),
    )
    const [globals, own] = results.map((rows) => rows.map((row) => row.id))
    expect(globals).toEqual(['tpl_global'])
    expect(own).toEqual(['tpl_own'])
  })

  it('counts only the live company\'s project checklists', async () => {
    await ChecklistsIndexPage()
    for (const [args] of mocks.prisma.checklistTemplate.findMany.mock.calls) {
      expect(args.include._count.select.projects).toEqual({ where: { companyId: 'company_1' } })
    }
  })
})

describe('/checklists/[id] template policy', () => {
  it('opens a non-global template of the live company', async () => {
    await expect(EditTemplatePage({ params: params('tpl_own') })).resolves.toBeTruthy()
    expect(mocks.prisma.checklistTemplate.findFirst.mock.calls[0][0].where).toEqual({ id: 'tpl_own', companyId: 'company_1', isGlobal: false })
  })

  it.each(['tpl_global', 'tpl_own_flagged_global', 'tpl_foreign', 'tpl_foreign_flagged_global', 'tpl_missing'])(
    'refuses template %s',
    async (id) => {
      await expect(EditTemplatePage({ params: params(id) })).rejects.toThrow('NEXT_REDIRECT:/checklists')
    },
  )
})
