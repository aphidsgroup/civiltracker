import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression for checklist template actions gated only on "any live company member".
 *
 * Every template action resolved the live principal but never asked what that principal
 * may do, so a CLIENT, VENDOR or SUBCONTRACTOR (or a SITE_ENGINEER) could create, clone,
 * rename and restructure the company's master templates, and the TASKS module was never
 * consulted.
 *
 * Now each action requires the existing `tasks.manage` permission on the live role and
 * the TASKS module before any template row is read or written. Templates and their tree
 * items must belong to the caller's active company and be non-global; global templates
 * are read-only to tenants and may only be cloned into the caller's company.
 *
 * `@/lib/permissions` and `@/lib/auth/require-module` are real.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  prisma: {
    company: { findUnique: vi.fn() },
    checklistTemplate: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    checklistStage: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    checklistCategory: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    checklistTask: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))

const actions = await import('@/actions/template-checklists')

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

function form(name: string, description = '') {
  const data = new FormData()
  data.set('name', name)
  data.set('description', description)
  return data
}

const TEMPLATE_TREE = {
  id: 'global_1', name: 'Residential', description: 'Standard', companyId: null, isGlobal: true,
  stages: [{ name: 'Foundation', order: 1, weight: 20, categories: [{ name: 'Excavation', order: 1, tasks: [{ name: 'Mark out', order: 1, isRequired: true }] }] }],
}

const ACTIONS: Array<[string, () => Promise<unknown>]> = [
  ['createTemplate', () => actions.createTemplate(form('New'))],
  ['cloneTemplate', () => actions.cloneTemplate('template_1')],
  ['updateTemplateInfo', () => actions.updateTemplateInfo('template_1', 'Name', 'Desc')],
  ['addStage', () => actions.addStage('template_1', 'Stage')],
  ['addCategory', () => actions.addCategory('stage_1', 'Category', 'template_1')],
  ['addTask', () => actions.addTask('category_1', 'Task', 'template_1')],
  ['deleteStage', () => actions.deleteStage('stage_1', 'template_1', 'Foundation')],
  ['deleteCategory', () => actions.deleteCategory('category_1', 'template_1', 'Excavation')],
  ['deleteTask', () => actions.deleteTask('task_1', 'template_1', 'Mark out')],
]

const CHECKLIST_DELEGATES = ['checklistTemplate', 'checklistStage', 'checklistCategory', 'checklistTask'] as const

function expectNoChecklistPrismaCalls() {
  for (const delegate of CHECKLIST_DELEGATES) {
    for (const fn of Object.values(mocks.prisma[delegate])) expect(fn).not.toHaveBeenCalled()
  }
}

let modules: unknown

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['SITES', 'TASKS']
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  mocks.prisma.checklistTemplate.findFirst.mockResolvedValue({ ...TEMPLATE_TREE, id: 'template_1', companyId: 'company_1', isGlobal: false })
  mocks.prisma.checklistTemplate.create.mockResolvedValue({ id: 'clone_1' })
  mocks.prisma.checklistTemplate.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.checklistStage.findFirst.mockResolvedValue({ id: 'stage_1' })
  mocks.prisma.checklistCategory.findFirst.mockResolvedValue({ id: 'category_1' })
  mocks.prisma.checklistTask.findFirst.mockResolvedValue({ id: 'task_1' })
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.prisma) => unknown) => fn(mocks.prisma))
})

describe('template checklist actions: live principal gate', () => {
  it.each(ACTIONS)('%s rejects a revoked or deactivated account before any template read', async (_name, invoke) => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Account is inactive'))
    await expect(invoke()).rejects.toThrow(/UNAUTHORIZED/)
    expectNoChecklistPrismaCalls()
    expect(mocks.prisma.company.findUnique).not.toHaveBeenCalled()
  })

  it.each(['CLIENT', 'VENDOR', 'SUBCONTRACTOR', 'SITE_ENGINEER', 'SUPERVISOR', 'ACCOUNTANT', 'PURCHASE_MANAGER'])(
    'denies every template action to a live %s before Prisma',
    async (role) => {
      mocks.requireUser.mockResolvedValue(principal(role))
      for (const [, invoke] of ACTIONS) {
        await expect(invoke()).rejects.toThrow(/FORBIDDEN: .*tasks\.manage/)
      }
      expectNoChecklistPrismaCalls()
      expect(mocks.prisma.company.findUnique).not.toHaveBeenCalled()
    },
  )

  it.each(ACTIONS)('%s denies a manager demoted since the token was issued', async (_name, invoke) => {
    // The JWT may still say COMPANY_ADMIN; requireUser returns the live membership role.
    mocks.requireUser.mockResolvedValue(principal('CLIENT'))
    await expect(invoke()).rejects.toThrow(/FORBIDDEN/)
    expectNoChecklistPrismaCalls()
  })

  it.each(ACTIONS)('%s rejects when the TASKS module is disabled before any template read', async (_name, invoke) => {
    modules = ['SITES']
    await expect(invoke()).rejects.toThrow(/Module TASKS is not enabled/)
    expectNoChecklistPrismaCalls()
  })

  it.each(ACTIONS)('%s rejects a principal without company context (super admin) before Prisma', async (_name, invoke) => {
    mocks.requireUser.mockResolvedValue({ ...principal('SUPER_ADMIN'), companyId: undefined })
    await expect(invoke()).rejects.toThrow(/company context required/i)
    expectNoChecklistPrismaCalls()
  })
})

describe('template checklist actions: tenant resource binding', () => {
  it.each([
    ['updateTemplateInfo', () => actions.updateTemplateInfo('foreign_template', 'Name', 'Desc'), () => mocks.prisma.checklistTemplate.updateMany],
    ['addStage', () => actions.addStage('foreign_template', 'Stage'), () => mocks.prisma.checklistStage.create],
    ['addCategory', () => actions.addCategory('stage_1', 'Category', 'foreign_template'), () => mocks.prisma.checklistCategory.create],
    ['addTask', () => actions.addTask('category_1', 'Task', 'foreign_template'), () => mocks.prisma.checklistTask.create],
    ['deleteStage', () => actions.deleteStage('stage_1', 'foreign_template', 'Foundation'), () => mocks.prisma.checklistStage.deleteMany],
    ['deleteCategory', () => actions.deleteCategory('category_1', 'foreign_template', 'Excavation'), () => mocks.prisma.checklistCategory.deleteMany],
    ['deleteTask', () => actions.deleteTask('task_1', 'foreign_template', 'Mark out'), () => mocks.prisma.checklistTask.deleteMany],
  ])('%s rejects a foreign, global or deleted template before mutation', async (_name, invoke, mutation) => {
    mocks.prisma.checklistTemplate.findFirst.mockResolvedValue(null)
    await expect(invoke()).rejects.toThrow(/access denied/i)
    expect(mocks.prisma.checklistTemplate.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign_template', companyId: 'company_1', isGlobal: false }, select: { id: true },
    })
    expect(mutation()).not.toHaveBeenCalled()
  })

  it.each([
    ['addCategory', () => actions.addCategory('foreign_stage', 'C', 'template_1'), 'checklistStage', () => mocks.prisma.checklistCategory.create],
    ['addTask', () => actions.addTask('foreign_category', 'T', 'template_1'), 'checklistCategory', () => mocks.prisma.checklistTask.create],
    ['deleteStage', () => actions.deleteStage('foreign_stage', 'template_1', 'Foundation'), 'checklistStage', () => mocks.prisma.checklistStage.deleteMany],
    ['deleteCategory', () => actions.deleteCategory('foreign_category', 'template_1', 'Excavation'), 'checklistCategory', () => mocks.prisma.checklistCategory.deleteMany],
    ['deleteTask', () => actions.deleteTask('foreign_task', 'template_1', 'Mark out'), 'checklistTask', () => mocks.prisma.checklistTask.deleteMany],
  ] as const)('%s rejects a tree item outside the owned template before mutation', async (_name, invoke, finder, mutation) => {
    mocks.prisma[finder].findFirst.mockResolvedValue(null)
    await expect(invoke()).rejects.toThrow(/access denied/i)
    expect(mutation()).not.toHaveBeenCalled()
  })

  it('updates only the owned non-global template', async () => {
    await actions.updateTemplateInfo('template_1', 'Name', 'Desc')
    expect(mocks.prisma.checklistTemplate.updateMany).toHaveBeenCalledWith({
      where: { id: 'template_1', companyId: 'company_1', isGlobal: false },
      data: { name: 'Name', description: 'Desc' },
    })
  })

  it('creates a template only in the live company, never global', async () => {
    await actions.createTemplate(form('New', 'Desc'))
    expect(mocks.prisma.checklistTemplate.create).toHaveBeenCalledWith({
      data: { name: 'New', description: 'Desc', companyId: 'company_1', isGlobal: false },
    })
    expect(mocks.redirect).toHaveBeenCalledWith('/checklists/clone_1')
  })
})

describe('template checklist actions: clone scope', () => {
  it('reads only own-company or global templates for cloning', async () => {
    await actions.cloneTemplate('global_1')
    expect(mocks.prisma.checklistTemplate.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'global_1', OR: [{ companyId: 'company_1', isGlobal: false }, { isGlobal: true }] },
    }))
  })

  it('clones a global template into the caller company without modifying the global', async () => {
    mocks.prisma.checklistTemplate.findFirst.mockResolvedValue(TEMPLATE_TREE)
    const result = await actions.cloneTemplate('global_1')
    expect(result).toEqual({ success: true, id: 'clone_1' })
    expect(mocks.prisma.checklistTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Residential (Copy)', companyId: 'company_1', isGlobal: false }),
    })
    expect(mocks.prisma.checklistTemplate.updateMany).not.toHaveBeenCalled()
    expect(mocks.prisma.checklistStage.create).not.toHaveBeenCalled()
    expect(mocks.prisma.checklistStage.delete).not.toHaveBeenCalled()
  })

  it('rejects a foreign private template clone before creating anything', async () => {
    mocks.prisma.checklistTemplate.findFirst.mockResolvedValue(null)
    await expect(actions.cloneTemplate('foreign_template')).rejects.toThrow(/access denied/i)
    expect(mocks.prisma.checklistTemplate.create).not.toHaveBeenCalled()
  })

  it('allows a live PROJECT_MANAGER with tasks.manage to clone', async () => {
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER'))
    mocks.prisma.checklistTemplate.findFirst.mockResolvedValue(TEMPLATE_TREE)
    await expect(actions.cloneTemplate('global_1')).resolves.toEqual({ success: true, id: 'clone_1' })
  })
})
