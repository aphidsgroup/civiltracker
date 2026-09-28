import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHECKLIST_TASK_NAME_MAX_LENGTH, parseChecklistTaskName } from '@/lib/validation/checklists'

/**
 * Regression for checklist task names stored exactly as the browser sent them.
 *
 * `addCustomTask` and `editChecklistTask` wrote the raw `name` argument: a blank or
 * whitespace-only name, one with line breaks, NUL, bidi overrides or zero-width marks, or
 * an unbounded string all reached the database and the CHECKLIST audit event.
 *
 * Now the name is validated and normalized on the server before the gate runs (NFC,
 * inner whitespace collapsed, trimmed, no control or format characters, 1..200
 * characters), so an invalid name opens no transaction and writes nothing. A valid name is
 * stored and audited in its normalized form, and the target is still re-read on exactly
 * the authorized site's checklist inside the transaction.
 *
 * The live gates are stubbed; their rules are covered by checklist-mutation-permission
 * and checklist-assigned-site-scope.
 */
const mocks = vi.hoisted(() => ({
  requireChecklistCategory: vi.fn(),
  requireChecklistTask: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    projectChecklistCategory: { findFirst: vi.fn() },
    projectChecklistTask: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: vi.fn() }))
vi.mock('@/lib/auth/checklist-site', () => ({
  requireChecklistSite: vi.fn(),
  requireChecklistCategory: mocks.requireChecklistCategory,
  requireChecklistTask: mocks.requireChecklistTask,
  requireChecklistPhoto: vi.fn(),
  listChecklistSites: vi.fn(),
}))
vi.mock('@/lib/auth/site-mutation', () => ({ requireAssignedSiteMutation: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const actions = await import('@/actions/checklists')

const USER = { id: 'user_pm', role: 'PROJECT_MANAGER', companyId: 'company_1' }
const SITE = { id: 'site_1', companyId: 'company_1' }
const ON_SITE_CHECKLIST = { checklist: { siteId: 'site_1', companyId: 'company_1' } }

const INVALID_NAMES: [string, unknown][] = [
  ['an empty string', ''],
  ['whitespace only', '  　 '],
  ['a line break', 'Pour\nslab'],
  ['a carriage return', 'Pour slab\r'],
  ['a tab', 'Pour\tslab'],
  ['a NUL byte', 'Pour\u0000slab'],
  ['an escape sequence', 'Pour \u001b[31mslab'],
  ['a C1 control', 'Pour\u0085slab'],
  ['a bidi override', 'Pour ‮slab'],
  ['a zero-width space', 'Pour​slab'],
  ['a byte-order mark', '﻿Pour slab'],
  ['a line separator', 'Pour slab'],
  ['an over-long name', 'x'.repeat(CHECKLIST_TASK_NAME_MAX_LENGTH + 1)],
  ['an unbounded name', ' '.repeat(10_000) + 'x'],
  ['a non-string', 42],
  ['null', null],
  ['an object', { toString: () => 'Pour slab' }],
]

const WRITES = [
  ['addCustomTask', (name: unknown) => actions.addCustomTask('site_1', 'cat_1', name as string)],
  ['editChecklistTask', (name: unknown) => actions.editChecklistTask('site_1', 'task_1', name as string)],
] as const

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireChecklistCategory.mockResolvedValue({ user: USER, site: SITE, category: { id: 'cat_1' } })
  mocks.requireChecklistTask.mockResolvedValue({ user: USER, site: SITE, task: { id: 'task_1', name: 'Pour slab' } })
  mocks.prisma.projectChecklistCategory.findFirst.mockResolvedValue({ id: 'cat_1' })
  mocks.prisma.projectChecklistTask.findFirst.mockResolvedValue({ id: 'task_1', name: 'Pour slab' })
  mocks.prisma.projectChecklistTask.create.mockImplementation(async ({ data }: { data: { name: string } }) => ({ id: 'task_new', name: data.name }))
  mocks.prisma.projectChecklistTask.update.mockResolvedValue({ id: 'task_1' })
  mocks.prisma.auditLog.create.mockResolvedValue({ id: 'audit_1' })
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.prisma) => unknown) => fn(mocks.prisma))
})

describe('parseChecklistTaskName', () => {
  it('normalizes to NFC, collapses inner whitespace and trims', () => {
    expect(parseChecklistTaskName('  Cure   slab  café  ')).toBe('Cure slab café')
  })

  it('accepts a name at exactly the maximum length', () => {
    const name = 'x'.repeat(CHECKLIST_TASK_NAME_MAX_LENGTH)
    expect(parseChecklistTaskName(name)).toBe(name)
  })

  it.each(INVALID_NAMES)('rejects %s', (_label, raw) => {
    expect(() => parseChecklistTaskName(raw)).toThrow('Invalid checklist task name')
  })
})

describe.each(WRITES)('%s task name validation', (_action, write) => {
  it.each(INVALID_NAMES)('rejects %s before the gate, any transaction or write', async (_label, raw) => {
    await expect(write(raw)).rejects.toThrow('Invalid checklist task name')

    expect(mocks.requireChecklistCategory).not.toHaveBeenCalled()
    expect(mocks.requireChecklistTask).not.toHaveBeenCalled()
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.prisma.projectChecklistCategory.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.projectChecklistTask.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.projectChecklistTask.create).not.toHaveBeenCalled()
    expect(mocks.prisma.projectChecklistTask.update).not.toHaveBeenCalled()
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe('valid names are stored and audited normalized on the authorized checklist', () => {
  it('addCustomTask re-reads the parent category on the site checklist and stores the normalized name', async () => {
    await expect(actions.addCustomTask('site_1', 'cat_1', '  Extra   check ')).resolves.toEqual({ success: true })

    expect(mocks.requireChecklistCategory).toHaveBeenCalledWith('site_1', 'cat_1', 'manage')
    expect(mocks.prisma.projectChecklistCategory.findFirst).toHaveBeenCalledWith({
      where: { id: 'cat_1', stage: ON_SITE_CHECKLIST },
      select: { id: true },
    })
    expect(mocks.prisma.projectChecklistTask.create).toHaveBeenCalledWith({
      data: { categoryId: 'cat_1', name: 'Extra check', order: 999 },
      select: { id: true, name: true },
    })
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        module: 'CHECKLIST',
        action: 'CREATE',
        after: { change: 'TASK_CREATED', taskId: 'task_new', taskName: 'Extra check', categoryId: 'cat_1', siteId: 'site_1' },
      }),
    })
  })

  it('editChecklistTask re-reads the task on the site checklist and stores the normalized name', async () => {
    await expect(actions.editChecklistTask('site_1', 'task_1', ' Roof  slab  ')).resolves.toEqual({ success: true })

    expect(mocks.requireChecklistTask).toHaveBeenCalledWith('site_1', 'task_1', 'manage')
    expect(mocks.prisma.projectChecklistTask.findFirst).toHaveBeenCalledWith({
      where: { id: 'task_1', category: { stage: ON_SITE_CHECKLIST } },
      select: { id: true, name: true },
    })
    expect(mocks.prisma.projectChecklistTask.update).toHaveBeenCalledWith({
      where: { id: 'task_1' }, data: { name: 'Roof slab' }, select: { id: true },
    })
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        module: 'CHECKLIST',
        action: 'UPDATE',
        before: { taskId: 'task_1', siteId: 'site_1', taskName: 'Pour slab' },
        after: { change: 'TASK_RENAMED', taskId: 'task_1', siteId: 'site_1', taskName: 'Roof slab' },
      }),
    })
  })

  it('a parent category outside the authorized checklist is refused before any task write', async () => {
    mocks.prisma.projectChecklistCategory.findFirst.mockResolvedValue(null)
    await expect(actions.addCustomTask('site_1', 'cat_1', 'Extra')).rejects.toThrow(/access denied/)
    expect(mocks.prisma.projectChecklistTask.create).not.toHaveBeenCalled()
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
  })
})
