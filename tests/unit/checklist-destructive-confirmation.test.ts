import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for permanent checklist deletes reachable without server confirmation or
 * retained audit.
 *
 * `deleteStage`, `deleteCategory` and `deleteTask` (template builder) and
 * `deleteChecklistTask` and `deleteProjectChecklist` (site checklist) hard-deleted their
 * target, cascading to every child row (template categories and tasks; project stages,
 * tasks, attachments and checklist photos), as soon as the scope checks passed. The only
 * confirmation was a browser `confirm()`, and nothing recorded who deleted what.
 *
 * Now each delete takes the text the operator typed. The scope is checked first (live
 * principal, `tasks.manage`, TASKS module, the caller's company, assigned-site scope for a
 * project checklist); the target is then re-read inside the transaction through its exact
 * parent chain, the typed text must equal its current name (the site name for a whole
 * checklist), the delete repeats the parent guard, and a DELETE audit event is written on
 * the same transaction client. A mismatch, a foreign or cross-parent target, or an audit
 * failure leaves every row, and the prior audit history, as it was.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module`, `@/lib/auth/site-mutation` and
 * `@/lib/auth/checklist-site` are real.
 */
type ProjectTask = { id: string; name: string; categoryId: string; checklistId: string; siteId: string; companyId: string; status: string }
type ProjectChecklist = { id: string; siteId: string; companyId: string; templateId: string; createdAt: Date }
type Template = { id: string; name: string; companyId: string | null; isGlobal: boolean }
type Stage = { id: string; name: string; templateId: string; order: number; weight: number }
type Category = { id: string; name: string; stageId: string; order: number }
type TemplateTask = { id: string; name: string; categoryId: string; order: number; isRequired: boolean }
type AuditRow = { id: string; userId: string; companyId: string | null; action: string; module: string; recordId: string | null; before?: unknown; after?: unknown }
type Store = {
  checklists: Record<string, ProjectChecklist>
  projectTasks: Record<string, ProjectTask>
  templates: Record<string, Template>
  stages: Record<string, Stage>
  categories: Record<string, Category>
  templateTasks: Record<string, TemplateTask>
  audit: AuditRow[]
}

const mocks = vi.hoisted(() => {
  const forbidden = (name: string) => vi.fn(async () => {
    throw new Error(`test: ${name} must not be called`)
  })
  return {
    requireUser: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn(),
    tx: {
      site: { findFirst: vi.fn() },
      projectChecklist: { findFirst: vi.fn(), deleteMany: vi.fn() },
      projectChecklistTask: { findFirst: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
      sitePhoto: { count: vi.fn() },
      checklistStage: { findFirst: vi.fn(), deleteMany: vi.fn() },
      checklistCategory: { findFirst: vi.fn(), deleteMany: vi.fn() },
      checklistTask: { findFirst: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
      auditLog: { create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    },
    prisma: {
      company: { findUnique: vi.fn() },
      companyMember: { findFirst: vi.fn() },
      site: { findFirst: vi.fn() },
      checklistTemplate: { findFirst: vi.fn() },
      // Targets are read, deleted and audited on the transaction client only.
      projectChecklist: { findFirst: forbidden('prisma.projectChecklist.findFirst'), delete: forbidden('prisma.projectChecklist.delete'), deleteMany: forbidden('prisma.projectChecklist.deleteMany') },
      projectChecklistTask: { findFirst: forbidden('prisma.projectChecklistTask.findFirst'), delete: forbidden('prisma.projectChecklistTask.delete'), deleteMany: forbidden('prisma.projectChecklistTask.deleteMany') },
      checklistStage: { findFirst: forbidden('prisma.checklistStage.findFirst'), delete: forbidden('prisma.checklistStage.delete'), deleteMany: forbidden('prisma.checklistStage.deleteMany') },
      checklistCategory: { findFirst: forbidden('prisma.checklistCategory.findFirst'), delete: forbidden('prisma.checklistCategory.delete'), deleteMany: forbidden('prisma.checklistCategory.deleteMany') },
      checklistTask: { findFirst: forbidden('prisma.checklistTask.findFirst'), delete: forbidden('prisma.checklistTask.delete'), deleteMany: forbidden('prisma.checklistTask.deleteMany') },
      auditLog: { create: forbidden('prisma.auditLog.create'), delete: forbidden('prisma.auditLog.delete'), deleteMany: forbidden('prisma.auditLog.deleteMany') },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))

const checklists = await import('@/actions/checklists')
const templates = await import('@/actions/template-checklists')

const SITES: Row[] = [
  { id: 'site_1', name: 'Tower A', companyId: 'company_1', deletedAt: null, assignedEngineerId: null, engineerId: null, clientUserId: null },
  { id: 'site_2', name: 'Tower B', companyId: 'company_1', deletedAt: null, assignedEngineerId: null, engineerId: null, clientUserId: null },
  { id: 'site_foreign', name: 'Foreign Tower', companyId: 'company_2', deletedAt: null, assignedEngineerId: null, engineerId: null, clientUserId: null },
]

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

function projectTask(id: string, name: string, siteId: string, companyId: string): ProjectTask {
  return { id, name, categoryId: `cat_${siteId}`, checklistId: `checklist_${siteId}`, siteId, companyId, status: 'COMPLETED' }
}

function freshStore(): Store {
  const created = new Date('2026-09-01')
  return {
    checklists: {
      checklist_site_1: { id: 'checklist_site_1', siteId: 'site_1', companyId: 'company_1', templateId: 'template_1', createdAt: created },
      checklist_site_2: { id: 'checklist_site_2', siteId: 'site_2', companyId: 'company_1', templateId: 'template_1', createdAt: created },
      checklist_site_foreign: { id: 'checklist_site_foreign', siteId: 'site_foreign', companyId: 'company_2', templateId: 'template_foreign', createdAt: created },
    },
    projectTasks: {
      task_1: projectTask('task_1', 'Pour slab', 'site_1', 'company_1'),
      task_site_2: projectTask('task_site_2', 'Pour slab', 'site_2', 'company_1'),
      task_foreign: projectTask('task_foreign', 'Pour slab', 'site_foreign', 'company_2'),
    },
    templates: {
      template_1: { id: 'template_1', name: 'Residential', companyId: 'company_1', isGlobal: false },
      template_other: { id: 'template_other', name: 'Commercial', companyId: 'company_1', isGlobal: false },
      template_foreign: { id: 'template_foreign', name: 'Rival', companyId: 'company_2', isGlobal: false },
      template_global: { id: 'template_global', name: 'Standard', companyId: null, isGlobal: true },
    },
    stages: {
      stage_1: { id: 'stage_1', name: 'Foundation', templateId: 'template_1', order: 1, weight: 20 },
      stage_other: { id: 'stage_other', name: 'Foundation', templateId: 'template_other', order: 1, weight: 20 },
      stage_foreign: { id: 'stage_foreign', name: 'Foundation', templateId: 'template_foreign', order: 1, weight: 20 },
      stage_global: { id: 'stage_global', name: 'Foundation', templateId: 'template_global', order: 1, weight: 20 },
    },
    categories: {
      category_1: { id: 'category_1', name: 'Excavation', stageId: 'stage_1', order: 1 },
      category_other: { id: 'category_other', name: 'Excavation', stageId: 'stage_other', order: 1 },
      category_foreign: { id: 'category_foreign', name: 'Excavation', stageId: 'stage_foreign', order: 1 },
    },
    templateTasks: {
      ttask_1: { id: 'ttask_1', name: 'Mark out', categoryId: 'category_1', order: 1, isRequired: true },
      ttask_other: { id: 'ttask_other', name: 'Mark out', categoryId: 'category_other', order: 1, isRequired: true },
      ttask_foreign: { id: 'ttask_foreign', name: 'Mark out', categoryId: 'category_foreign', order: 1, isRequired: true },
    },
    // Prior history that no delete may touch.
    audit: [
      { id: 'audit_old_tick', userId: 'user_earlier', companyId: 'company_1', action: 'TICK', module: 'CHECKLIST', recordId: 'site_1', after: { taskId: 'task_1' } },
    ],
  }
}

let store: Store
let failAudit: boolean

type TemplateWhere = { id: string; companyId: string; isGlobal: boolean }

function ownsTemplate(templateId: string, where: TemplateWhere | undefined) {
  if (!where?.id || !where.companyId || where.isGlobal !== false) throw new Error('test: template chain must bind id, company and non-global')
  const template = store.templates[templateId]
  return !!template && template.id === where.id && template.companyId === where.companyId && !template.isGlobal
}

function stageInTemplate(stageId: string, where: TemplateWhere | undefined) {
  const stage = store.stages[stageId]
  return !!stage && ownsTemplate(stage.templateId, where)
}

function categoryInTemplate(categoryId: string, where: TemplateWhere | undefined) {
  const category = store.categories[categoryId]
  return !!category && stageInTemplate(category.stageId, where)
}

function destructiveAuditCalls() {
  const { auditLog } = mocks.tx
  return [auditLog.delete, auditLog.deleteMany, auditLog.update, auditLog.updateMany].reduce((sum, fn) => sum + fn.mock.calls.length, 0)
}

function targetDeletes() {
  const { tx } = mocks
  return [tx.projectChecklist.deleteMany, tx.projectChecklistTask.deleteMany, tx.checklistStage.deleteMany, tx.checklistCategory.deleteMany, tx.checklistTask.deleteMany]
    .reduce((sum, fn) => sum + fn.mock.calls.length, 0)
}

beforeEach(() => {
  vi.clearAllMocks()
  store = freshStore()
  failAudit = false
  mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER'))
  mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['SITES', 'TASKS'], status: 'ACTIVE' })
  mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: ['site_1'] })
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)
  mocks.tx.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)

  mocks.prisma.checklistTemplate.findFirst.mockImplementation(async ({ where }: { where: TemplateWhere }) => (
    ownsTemplate(where.id, where) ? { id: where.id } : null
  ))

  // Project checklist and tasks.
  mocks.tx.projectChecklist.findFirst.mockImplementation(async ({ where }: { where: { siteId: string; companyId: string } }) => {
    const row = Object.values(store.checklists).find((c) => c.siteId === where.siteId && c.companyId === where.companyId)
    return row ? { ...row, _count: { stages: 1 } } : null
  })
  mocks.tx.projectChecklist.deleteMany.mockImplementation(async ({ where }: { where: { id: string; siteId: string; companyId: string } }) => {
    const row = store.checklists[where.id]
    if (!row || row.siteId !== where.siteId || row.companyId !== where.companyId) return { count: 0 }
    delete store.checklists[row.id]
    for (const task of Object.values(store.projectTasks)) if (task.checklistId === row.id) delete store.projectTasks[task.id]
    return { count: 1 }
  })
  mocks.tx.projectChecklistTask.findFirst.mockImplementation(async ({ where }: { where: { id: string; category: { stage: { checklist: { siteId: string; companyId: string } } } } }) => {
    const bound = where.category?.stage?.checklist
    if (!bound?.siteId || !bound.companyId) throw new Error('test: task lookup must bind site and company')
    const row = store.projectTasks[where.id]
    if (!row || row.siteId !== bound.siteId || row.companyId !== bound.companyId) return null
    return {
      ...row, isClientDone: false, isNeglected: false, completedAt: null,
      category: { name: 'Slab', stage: { name: 'Structure', checklistId: row.checklistId } },
      _count: { sitePhotos: 2, attachments: 1 },
    }
  })
  mocks.tx.projectChecklistTask.deleteMany.mockImplementation(async ({ where }: { where: { id: string; categoryId: string } }) => {
    const row = store.projectTasks[where.id]
    if (!row || row.categoryId !== where.categoryId) return { count: 0 }
    delete store.projectTasks[row.id]
    return { count: 1 }
  })
  mocks.tx.projectChecklistTask.count.mockResolvedValue(3)
  mocks.tx.sitePhoto.count.mockResolvedValue(2)

  // Template tree.
  mocks.tx.checklistStage.findFirst.mockImplementation(async ({ where }: { where: { id: string; template: TemplateWhere } }) => {
    if (!stageInTemplate(where.id, where.template)) return null
    const stage = store.stages[where.id]
    return { ...stage, template: { name: store.templates[stage.templateId].name }, _count: { categories: 1 } }
  })
  mocks.tx.checklistStage.deleteMany.mockImplementation(async ({ where }: { where: { id: string; templateId: string } }) => {
    const stage = store.stages[where.id]
    if (!stage || stage.templateId !== where.templateId) return { count: 0 }
    delete store.stages[stage.id]
    return { count: 1 }
  })
  mocks.tx.checklistCategory.findFirst.mockImplementation(async ({ where }: { where: { id: string; stage: { template: TemplateWhere } } }) => {
    if (!categoryInTemplate(where.id, where.stage?.template)) return null
    const category = store.categories[where.id]
    const stage = store.stages[category.stageId]
    return { ...category, stage: { name: stage.name, template: { name: store.templates[stage.templateId].name } }, _count: { tasks: 1 } }
  })
  mocks.tx.checklistCategory.deleteMany.mockImplementation(async ({ where }: { where: { id: string; stageId: string; stage: { templateId: string } } }) => {
    const category = store.categories[where.id]
    if (!category || category.stageId !== where.stageId || store.stages[category.stageId]?.templateId !== where.stage.templateId) return { count: 0 }
    delete store.categories[category.id]
    return { count: 1 }
  })
  mocks.tx.checklistTask.findFirst.mockImplementation(async ({ where }: { where: { id: string; category: { stage: { template: TemplateWhere } } } }) => {
    const task = store.templateTasks[where.id]
    if (!task || !categoryInTemplate(task.categoryId, where.category?.stage?.template)) return null
    const category = store.categories[task.categoryId]
    const stage = store.stages[category.stageId]
    return { ...task, category: { name: category.name, stageId: stage.id, stage: { name: stage.name, template: { name: store.templates[stage.templateId].name } } } }
  })
  mocks.tx.checklistTask.deleteMany.mockImplementation(async ({ where }: { where: { id: string; categoryId: string; category: { stage: { templateId: string } } } }) => {
    const task = store.templateTasks[where.id]
    const category = task && store.categories[task.categoryId]
    if (!task || task.categoryId !== where.categoryId || store.stages[category!.stageId]?.templateId !== where.category.stage.templateId) return { count: 0 }
    delete store.templateTasks[task.id]
    return { count: 1 }
  })
  mocks.tx.checklistTask.count.mockResolvedValue(4)

  mocks.tx.auditLog.create.mockImplementation(async ({ data }: { data: Omit<AuditRow, 'id'> }) => {
    if (failAudit) throw new Error('audit store unavailable')
    const row = { id: `audit_${store.audit.length + 1}`, ...data }
    store.audit.push(row)
    return row
  })
  // Rollback semantics: a callback that throws leaves the store as it was.
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => {
    const snapshot = structuredClone(store)
    try {
      return await fn(mocks.tx)
    } catch (error) {
      store = snapshot
      throw error
    }
  })
})

type Invoke = (confirmation: unknown) => Promise<unknown>
const call = (fn: unknown) => fn as (...args: unknown[]) => Promise<unknown>

/** Each destructive action on an in-scope target, with its canonical confirmation text. */
const DELETES: Array<[string, Invoke, string]> = [
  ['deleteChecklistTask', (c) => call(checklists.deleteChecklistTask)('site_1', 'task_1', c), 'Pour slab'],
  ['deleteProjectChecklist', (c) => call(checklists.deleteProjectChecklist)('site_1', c), 'Tower A'],
  ['deleteStage', (c) => call(templates.deleteStage)('stage_1', 'template_1', c), 'Foundation'],
  ['deleteCategory', (c) => call(templates.deleteCategory)('category_1', 'template_1', c), 'Excavation'],
  ['deleteTask', (c) => call(templates.deleteTask)('ttask_1', 'template_1', c), 'Mark out'],
]

describe('checklist deletes require server-side confirmation', () => {
  it.each(DELETES)('%s refuses a missing confirmation before reading the target', async (_name, invoke) => {
    const before = structuredClone(store)
    for (const missing of [undefined, null, '', '   ', 42, { toString: () => 'Pour slab' }]) {
      await expect(invoke(missing)).rejects.toThrow(/confirmation text did not match/)
    }
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(targetDeletes()).toBe(0)
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expect(store).toEqual(before)
  })

  it.each(DELETES)('%s refuses text that does not match the current name', async (_name, invoke, name) => {
    const before = structuredClone(store)
    for (const wrong of [name.toUpperCase(), `${name}!`, 'delete', 'Tower B']) {
      await expect(invoke(wrong)).rejects.toThrow(/confirmation text did not match/)
    }
    expect(targetDeletes()).toBe(0)
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expect(store).toEqual(before)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it.each(DELETES)('%s accepts the exact name, ignoring surrounding whitespace', async (_name, invoke, name) => {
    await invoke(`  ${name} `)
    expect(targetDeletes()).toBe(1)
    expect(store.audit).toHaveLength(2)
  })
})

describe('checklist deletes bind the exact tenant and parent', () => {
  it.each([
    ['a task of another site of the company', 'site_1', 'task_site_2'],
    ['a task of another tenant', 'site_1', 'task_foreign'],
    ['an unknown task', 'site_1', 'task_missing'],
  ])('deleteChecklistTask refuses %s even with its name', async (_label, siteId, taskId) => {
    const before = structuredClone(store)
    await expect(checklists.deleteChecklistTask(siteId, taskId, 'Pour slab')).rejects.toThrow(/access denied/)
    expect(targetDeletes()).toBe(0)
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expect(store).toEqual(before)
  })

  it.each([
    ['a foreign site', 'site_foreign', 'Foreign Tower'],
    ['an unknown site', 'site_missing', 'Tower A'],
  ])('deleteProjectChecklist refuses %s before any transaction', async (_label, siteId, name) => {
    await expect(checklists.deleteProjectChecklist(siteId, name)).rejects.toThrow(/access denied/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(store.checklists[`checklist_${siteId}`]).toEqual(freshStore().checklists[`checklist_${siteId}`])
  })

  it('deleteProjectChecklist refuses another tenant\'s manager', async () => {
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER', 'company_2'))
    await expect(checklists.deleteProjectChecklist('site_1', 'Tower A')).rejects.toThrow(/access denied/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(store.checklists.checklist_site_1).toBeDefined()
  })

  it.each(['SITE_ENGINEER', 'SUPERVISOR', 'CLIENT'])('project checklist deletes refuse a %s on its own site', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(checklists.deleteChecklistTask('site_1', 'task_1', 'Pour slab')).rejects.toThrow(/FORBIDDEN/)
    await expect(checklists.deleteProjectChecklist('site_1', 'Tower A')).rejects.toThrow(/FORBIDDEN/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it.each([
    ['deleteStage', () => templates.deleteStage('stage_other', 'template_1', 'Foundation')],
    ['deleteCategory', () => templates.deleteCategory('category_other', 'template_1', 'Excavation')],
    ['deleteTask', () => templates.deleteTask('ttask_other', 'template_1', 'Mark out')],
    ['deleteStage', () => templates.deleteStage('stage_foreign', 'template_1', 'Foundation')],
    ['deleteCategory', () => templates.deleteCategory('category_foreign', 'template_1', 'Excavation')],
    ['deleteTask', () => templates.deleteTask('ttask_foreign', 'template_1', 'Mark out')],
  ])('%s refuses an item under a different template, even with its name', async (_name, invoke) => {
    const before = structuredClone(store)
    await expect(invoke()).rejects.toThrow(/access denied/)
    expect(targetDeletes()).toBe(0)
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expect(store).toEqual(before)
  })

  it.each([
    ['deleteStage', (t: string) => templates.deleteStage('stage_foreign', t, 'Foundation')],
    ['deleteCategory', (t: string) => templates.deleteCategory('category_foreign', t, 'Excavation')],
    ['deleteTask', (t: string) => templates.deleteTask('ttask_foreign', t, 'Mark out')],
  ])('%s refuses a foreign or global template before any transaction', async (_name, invoke) => {
    for (const templateId of ['template_foreign', 'template_global']) {
      await expect(invoke(templateId)).rejects.toThrow(/access denied/)
    }
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('checklist deletes are atomic with an immutable audit event', () => {
  it('deleteChecklistTask removes the task and appends one CHECKLIST DELETE event', async () => {
    await expect(checklists.deleteChecklistTask('site_1', 'task_1', 'Pour slab')).resolves.toEqual({ success: true })
    expect(store.projectTasks.task_1).toBeUndefined()
    expect(store.projectTasks.task_site_2).toBeDefined()
    expect(store.audit).toHaveLength(2)
    expect(store.audit[1]).toMatchObject({
      userId: 'user_project_manager', companyId: 'company_1', module: 'CHECKLIST', action: 'DELETE', recordId: 'site_1',
      before: {
        taskId: 'task_1', taskName: 'Pour slab', siteId: 'site_1', checklistId: 'checklist_site_1',
        status: 'COMPLETED', photoCount: 2, attachmentCount: 1,
      },
    })
  })

  it('deleteProjectChecklist removes the checklist and its tasks and records what was removed', async () => {
    await expect(checklists.deleteProjectChecklist('site_1', 'Tower A')).resolves.toEqual({ success: true })
    expect(store.checklists.checklist_site_1).toBeUndefined()
    expect(store.projectTasks.task_1).toBeUndefined()
    expect(store.checklists.checklist_site_2).toBeDefined()
    expect(store.audit[1]).toMatchObject({
      userId: 'user_project_manager', companyId: 'company_1', module: 'CHECKLIST', action: 'DELETE', recordId: 'site_1',
      before: { checklistId: 'checklist_site_1', siteId: 'site_1', siteName: 'Tower A', taskCount: 3, photoCount: 2 },
    })
  })

  it.each([
    ['deleteStage', () => templates.deleteStage('stage_1', 'template_1', 'Foundation'), 'STAGE', { stageId: 'stage_1', name: 'Foundation', categoryCount: 1, taskCount: 4 }],
    ['deleteCategory', () => templates.deleteCategory('category_1', 'template_1', 'Excavation'), 'CATEGORY', { categoryId: 'category_1', stageId: 'stage_1', name: 'Excavation', taskCount: 1 }],
    ['deleteTask', () => templates.deleteTask('ttask_1', 'template_1', 'Mark out'), 'TASK', { taskId: 'ttask_1', categoryId: 'category_1', name: 'Mark out' }],
  ] as const)('%s appends one CHECKLIST_TEMPLATE DELETE event', async (_name, invoke, kind, snapshot) => {
    await invoke()
    expect(store.audit).toHaveLength(2)
    expect(store.audit[1]).toMatchObject({
      userId: 'user_project_manager', companyId: 'company_1', module: 'CHECKLIST_TEMPLATE', action: 'DELETE', recordId: 'template_1',
      before: { kind, templateId: 'template_1', templateName: 'Residential', ...snapshot },
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/checklists/template_1')
  })

  it.each(DELETES)('%s rolls the delete back when the audit write fails', async (_name, invoke, name) => {
    failAudit = true
    const before = structuredClone(store)
    await expect(invoke(name)).rejects.toThrow(/audit store unavailable/)
    expect(targetDeletes()).toBe(1)
    expect(store).toEqual(before)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it.each(DELETES)('%s writes no audit event when the guarded delete matches nothing', async (_name, invoke, name) => {
    for (const fn of [mocks.tx.projectChecklist, mocks.tx.projectChecklistTask, mocks.tx.checklistStage, mocks.tx.checklistCategory, mocks.tx.checklistTask]) {
      fn.deleteMany.mockResolvedValue({ count: 0 })
    }
    await expect(invoke(name)).rejects.toThrow(/access denied/)
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
  })

  it.each(DELETES)('%s never deletes or rewrites prior audit history', async (_name, invoke, name) => {
    const history = structuredClone(store.audit)
    await invoke(name)
    expect(destructiveAuditCalls()).toBe(0)
    expect(store.audit.slice(0, history.length)).toEqual(history)
  })

  it.each(DELETES)('%s audit event carries no secrets or session material', async (_name, invoke, name) => {
    await invoke(name)
    const serialized = JSON.stringify(store.audit.at(-1)?.before)
    for (const leak of ['email', 'password', 'token', 'secret', '@acme.test']) expect(serialized).not.toContain(leak)
  })
})
