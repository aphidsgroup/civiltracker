import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  prisma: {
    checklistTemplate: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    checklistStage: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    checklistCategory: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    checklistTask: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
  },
}))

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))

const actions = await import('@/actions/template-checklists')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({ id: 'user_1', companyId: 'company_1', role: 'COMPANY_ADMIN' })
  mocks.prisma.checklistTemplate.findFirst.mockResolvedValue({ id: 'template_1' })
  mocks.prisma.checklistTemplate.create.mockResolvedValue({ id: 'clone_1' })
  mocks.prisma.checklistTemplate.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.checklistStage.findFirst.mockResolvedValue({ id: 'stage_1' })
  mocks.prisma.checklistCategory.findFirst.mockResolvedValue({ id: 'category_1' })
  mocks.prisma.checklistTask.findFirst.mockResolvedValue({ id: 'task_1' })
})

describe('template checklist tenant authorization', () => {
  it('rejects a private cross-tenant clone before creating a template', async () => {
    mocks.prisma.checklistTemplate.findFirst.mockResolvedValue(null)
    await expect(actions.cloneTemplate('foreign_template')).rejects.toThrow(/access denied/i)
    expect(mocks.prisma.checklistTemplate.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'foreign_template', OR: [{ companyId: 'company_1' }, { isGlobal: true }] },
    }))
    expect(mocks.prisma.checklistTemplate.create).not.toHaveBeenCalled()
  })

  it('rejects missing live company context before template creation', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'user_1', role: 'SUPER_ADMIN' })
    await expect(actions.createTemplate(new FormData())).rejects.toThrow(/company context required/i)
    expect(mocks.prisma.checklistTemplate.create).not.toHaveBeenCalled()
  })

  it.each([
    ['addStage', () => actions.addStage('foreign_template', 'Stage'), () => mocks.prisma.checklistStage.create],
    ['addCategory', () => actions.addCategory('foreign_stage', 'Category', 'template_1'), () => mocks.prisma.checklistCategory.create],
    ['addTask', () => actions.addTask('foreign_category', 'Task', 'template_1'), () => mocks.prisma.checklistTask.create],
    ['deleteStage', () => actions.deleteStage('foreign_stage', 'template_1'), () => mocks.prisma.checklistStage.delete],
    ['deleteCategory', () => actions.deleteCategory('foreign_category', 'template_1'), () => mocks.prisma.checklistCategory.delete],
    ['deleteTask', () => actions.deleteTask('foreign_task', 'template_1'), () => mocks.prisma.checklistTask.delete],
  ])('%s rejects foreign nested IDs before mutation', async (name, invoke, mutation) => {
    if (name === 'addStage') mocks.prisma.checklistTemplate.findFirst.mockResolvedValue(null)
    if (name === 'addCategory' || name === 'deleteStage') mocks.prisma.checklistStage.findFirst.mockResolvedValue(null)
    if (name === 'addTask' || name === 'deleteCategory') mocks.prisma.checklistCategory.findFirst.mockResolvedValue(null)
    if (name === 'deleteTask') mocks.prisma.checklistTask.findFirst.mockResolvedValue(null)
    await expect(invoke()).rejects.toThrow(/access denied/i)
    expect(mutation()).not.toHaveBeenCalled()
  })

  it.each([
    ['addCategory', () => actions.addCategory('stage_1', 'Category', 'template_1'), mocks.prisma.checklistStage.findFirst, { id: 'stage_1', template: { id: 'template_1', companyId: 'company_1', isGlobal: false } }],
    ['addTask', () => actions.addTask('category_1', 'Task', 'template_1'), mocks.prisma.checklistCategory.findFirst, { id: 'category_1', stage: { template: { id: 'template_1', companyId: 'company_1', isGlobal: false } } }],
    ['deleteStage', () => actions.deleteStage('stage_1', 'template_1'), mocks.prisma.checklistStage.findFirst, { id: 'stage_1', template: { id: 'template_1', companyId: 'company_1', isGlobal: false } }],
    ['deleteCategory', () => actions.deleteCategory('category_1', 'template_1'), mocks.prisma.checklistCategory.findFirst, { id: 'category_1', stage: { template: { id: 'template_1', companyId: 'company_1', isGlobal: false } } }],
    ['deleteTask', () => actions.deleteTask('task_1', 'template_1'), mocks.prisma.checklistTask.findFirst, { id: 'task_1', category: { stage: { template: { id: 'template_1', companyId: 'company_1', isGlobal: false } } } }],
  ])('%s binds the exact tenant-owned non-global parent', async (_name, invoke, finder, where) => {
    await invoke()
    expect(finder).toHaveBeenCalledWith(expect.objectContaining({ where }))
  })

  it('prevents global template mutation through the tenant root resolver', async () => {
    mocks.prisma.checklistTemplate.findFirst.mockResolvedValue(null)
    await expect(actions.updateTemplateInfo('global_template', 'Name', 'Desc')).rejects.toThrow(/access denied/i)
    expect(mocks.prisma.checklistTemplate.findFirst).toHaveBeenCalledWith({
      where: { id: 'global_template', companyId: 'company_1', isGlobal: false }, select: { id: true },
    })
    expect(mocks.prisma.checklistTemplate.updateMany).not.toHaveBeenCalled()
  })
})
