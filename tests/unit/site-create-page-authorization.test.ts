import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for `/sites/new` creating sites from JWT claims.
 *
 * The page and its `createSiteAction` only checked that the token carried a company id,
 * so a revoked member or any role (a SITE_ENGINEER, a CLIENT) could create sites, the
 * SITES module and the plan's site limit were ignored, any template id was deep-copied
 * (including another tenant's), selected task ids were never checked against the
 * template, malformed JSON crashed mid-flow and the site and its checklist were written
 * separately, leaving a site without its checklist when the second write failed.
 *
 * Now the page runs the live tenant gate for `sites.create` + SITES before its template
 * read, and the action runs the live permission and module gate, accepts only a same
 * company or global template, requires every selected task to belong to it, rejects
 * malformed selections before any write, and writes the site and checklist inside one
 * transaction under the site limit.
 *
 * `@/lib/permissions`, `@/lib/pages/tenant-page-access`, `@/lib/auth/require-permission`,
 * `@/lib/auth/require-module` and `@/lib/auth/site-mutation` are real.
 */
const mocks = vi.hoisted(() => {
  const tx = {
    company: { findUnique: vi.fn() },
    site: { count: vi.fn(), create: vi.fn() },
    projectChecklist: { create: vi.fn() },
  }
  return {
    auth: vi.fn(),
    requireUser: vi.fn(),
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
      checklistTemplate: { findFirst: vi.fn() },
      site: { count: vi.fn(), create: vi.fn() },
      projectChecklist: { create: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('@/app/(dashboard)/sites/new/NewSiteClient', () => ({ NewSiteClient: mocks.NewSiteClient }))

const { default: NewSitePage } = await import('@/app/(dashboard)/sites/new/page')

function template(id: string, companyId: string | null, isGlobal: boolean, taskIds: string[]): Row {
  return {
    id, companyId, isGlobal,
    stages: [{
      id: `${id}_stage`, name: 'Foundation', order: 1, weight: 1,
      categories: [{
        id: `${id}_cat`, name: 'Excavation', order: 1,
        tasks: taskIds.map((taskId, order) => ({ id: taskId, name: `Task ${taskId}`, order, isRequired: true })),
      }],
    }],
  }
}

const TEMPLATES: Row[] = [
  template('tpl_own', 'company_1', false, ['own_t1', 'own_t2']),
  template('tpl_global', null, true, ['global_t1']),
  template('tpl_foreign', 'company_2', false, ['foreign_t1']),
]

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

function siteForm(overrides: Record<string, string> = {}) {
  const fd = new FormData()
  const fields = { name: 'Tower B', location: 'Chennai', address: '', projectType: '', budget: '5000', startDate: '', targetEndDate: '', templateId: 'tpl_own', selectedTaskIds: JSON.stringify(['own_t1']), ...overrides }
  for (const [key, value] of Object.entries(fields)) fd.append(key, value)
  return fd
}

let modules: unknown
let companyStatus: string

async function loadAction() {
  const props = findClientProps((await NewSitePage()) as ReactNode)
  if (!props) throw new Error('NewSiteClient not rendered')
  return props.createSiteAction
}

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['SITES']
  companyStatus = 'ACTIVE'
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.auth.mockResolvedValue({ user: principal('COMPANY_ADMIN') })
  mocks.prisma.company.findFirst.mockImplementation(async () => ({ modulesJson: modules }))
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: companyStatus }))
  mocks.prisma.checklistTemplate.findFirst.mockImplementation(inMemoryDelegate(TEMPLATES).findFirst)
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx))
  mocks.tx.company.findUnique.mockResolvedValue({ siteLimit: 5 })
  mocks.tx.site.count.mockResolvedValue(1)
  mocks.tx.site.create.mockResolvedValue({ id: 'site_new', companyId: 'company_1' })
  mocks.tx.projectChecklist.create.mockResolvedValue({ id: 'checklist_new' })
})

describe('/sites/new page load', () => {
  it('refuses a revoked principal before the template read', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))
    await expect(NewSitePage()).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.prisma.checklistTemplate.findFirst).not.toHaveBeenCalled()
  })

  it.each(['PROJECT_MANAGER', 'SITE_ENGINEER', 'ACCOUNTANT', 'CLIENT', 'VENDOR'])('turns away %s, which lacks sites.create, before the template read', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(NewSitePage()).rejects.toThrow(/NEXT_REDIRECT/)
    expect(mocks.prisma.checklistTemplate.findFirst).not.toHaveBeenCalled()
  })

  it('turns away a company with SITES disabled before the template read', async () => {
    modules = ['EXPENSES']
    await expect(NewSitePage()).rejects.toThrow(/NEXT_REDIRECT/)
    expect(mocks.prisma.checklistTemplate.findFirst).not.toHaveBeenCalled()
  })

  it('reads templates for the live company, not the JWT company', async () => {
    mocks.auth.mockResolvedValue({ user: principal('COMPANY_ADMIN', 'company_2') })
    await NewSitePage()
    const where = mocks.prisma.checklistTemplate.findFirst.mock.calls[0][0].where
    expect(where).toEqual({ OR: [{ companyId: 'company_1', isGlobal: false }, { isGlobal: true }] })
  })
})

describe('createSiteAction', () => {
  it('refuses a principal revoked after the page loaded, before any write', async () => {
    const action = await loadAction()
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Account is inactive'))
    await expect(action(siteForm())).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it.each(['PROJECT_MANAGER', 'SITE_ENGINEER', 'CLIENT'])('refuses %s, which lacks sites.create', async (role) => {
    const action = await loadAction()
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(action(siteForm())).rejects.toThrow(/FORBIDDEN/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('refuses when the SITES module was switched off', async () => {
    const action = await loadAction()
    modules = ['EXPENSES']
    await expect(action(siteForm())).rejects.toThrow(/Module SITES is not enabled/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('refuses a suspended company', async () => {
    const action = await loadAction()
    companyStatus = 'SUSPENDED'
    await expect(action(siteForm())).rejects.toThrow(/suspended/i)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('refuses once the plan site limit is reached, inside the transaction', async () => {
    const action = await loadAction()
    mocks.tx.site.count.mockResolvedValue(5)
    await expect(action(siteForm())).rejects.toThrow(/Site limit reached/)
    expect(mocks.tx.site.count).toHaveBeenCalledWith({ where: { companyId: 'company_1' } })
    expect(mocks.tx.site.create).not.toHaveBeenCalled()
  })

  it('refuses another tenant\'s template and writes nothing', async () => {
    const action = await loadAction()
    await expect(action(siteForm({ templateId: 'tpl_foreign', selectedTaskIds: JSON.stringify(['foreign_t1']) }))).rejects.toThrow(/Template not found or access denied/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('refuses a selected task that does not belong to the template', async () => {
    const action = await loadAction()
    await expect(action(siteForm({ selectedTaskIds: JSON.stringify(['own_t1', 'foreign_t1']) }))).rejects.toThrow(/task selection/i)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('refuses selected tasks without a template', async () => {
    const action = await loadAction()
    await expect(action(siteForm({ templateId: '', selectedTaskIds: JSON.stringify(['own_t1']) }))).rejects.toThrow(/task selection/i)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it.each([
    ['broken JSON', '[not json'],
    ['a non-array', '{"id":"own_t1"}'],
    ['non-string ids', '[1,2]'],
  ])('safely denies %s in the task selection', async (_name, raw) => {
    const action = await loadAction()
    await expect(action(siteForm({ selectedTaskIds: raw }))).rejects.toThrow(/task selection/i)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it.each([
    ['a negative budget', { budget: '-5' }],
    ['a non-numeric budget', { budget: 'abc' }],
    ['a missing name', { name: '' }],
    ['a missing location', { location: '  ' }],
  ])('rejects %s before any write', async (_name, overrides) => {
    const action = await loadAction()
    await expect(action(siteForm(overrides))).rejects.toThrow(/invalid|required/i)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('accepts a global template', async () => {
    const action = await loadAction()
    await expect(action(siteForm({ templateId: 'tpl_global', selectedTaskIds: JSON.stringify(['global_t1']) }))).rejects.toThrow('NEXT_REDIRECT:/sites')
    expect(mocks.tx.projectChecklist.create.mock.calls[0][0].data).toMatchObject({ siteId: 'site_new', templateId: 'tpl_global', companyId: 'company_1' })
  })

  it('writes the site and only the selected template tasks inside one transaction for the live company', async () => {
    const action = await loadAction()
    await expect(action(siteForm())).rejects.toThrow('NEXT_REDIRECT:/sites')

    expect(mocks.prisma.site.create).not.toHaveBeenCalled()
    expect(mocks.prisma.projectChecklist.create).not.toHaveBeenCalled()
    expect(mocks.tx.site.create.mock.calls[0][0].data).toMatchObject({ companyId: 'company_1', name: 'Tower B', location: 'Chennai', budget: 5000, createdById: 'user_company_admin' })
    const checklist = mocks.tx.projectChecklist.create.mock.calls[0][0].data
    expect(checklist).toMatchObject({ siteId: 'site_new', templateId: 'tpl_own', companyId: 'company_1' })
    const tasks = checklist.stages.create[0].categories.create[0].tasks.create
    expect(tasks.map((task: { name: string }) => task.name)).toEqual(['Task own_t1'])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sites')
  })

  it('does not report success when the checklist write fails inside the transaction', async () => {
    const action = await loadAction()
    mocks.tx.projectChecklist.create.mockRejectedValue(new Error('db down'))
    await expect(action(siteForm())).rejects.toThrow('db down')
    expect(mocks.redirect).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('creates a site without a checklist when no template is chosen', async () => {
    const action = await loadAction()
    await expect(action(siteForm({ templateId: '', selectedTaskIds: '[]' }))).rejects.toThrow('NEXT_REDIRECT:/sites')
    expect(mocks.tx.site.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.projectChecklist.create).not.toHaveBeenCalled()
  })
})
