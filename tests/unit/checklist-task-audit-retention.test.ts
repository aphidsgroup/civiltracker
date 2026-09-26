import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for checklist task ticks erasing their own audit history.
 *
 * `toggleTaskStatus` updated the task, then wrote a CHECKLIST TICK audit row with a
 * separate bare write. On untick it loaded every CHECKLIST audit row of the site and
 * `deleteMany`'d the task's TICK rows and *every* UNTICK row of the site: any field user
 * with `dpr.create` could erase who completed a task and when. The status write and the
 * audit write were not atomic, so a failed audit write left an unaudited transition.
 *
 * Now the task is re-resolved on the authorized site's checklist, updated and audited on
 * one transaction client. A tick appends a CHECKLIST TICK event, an untick appends a
 * CHECKLIST UNTICK event, and no audit row is ever deleted or rewritten. Every event
 * names the actor, company, site and task with the previous and new status. An audit
 * failure rolls the status back, and a malformed, foreign, deleted or unassigned task is
 * refused before any write.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module`, `@/lib/auth/site-mutation` and
 * `@/lib/auth/checklist-site` are real.
 */
type TaskRow = {
  id: string
  name: string
  status: string
  isClientDone: boolean
  isNeglected: boolean
  completedAt: Date | null
  completedById: string | null
  checklist: { siteId: string; companyId: string }
}
type AuditRow = { id: string; userId: string; companyId: string | null; action: string; module: string; recordId: string | null; before?: unknown; after?: unknown }
type Store = { tasks: Record<string, TaskRow>; audit: AuditRow[] }

const mocks = vi.hoisted(() => {
  const forbidden = (name: string) => vi.fn(async () => {
    throw new Error(`test: ${name} must not be called`)
  })
  return {
    requireUser: vi.fn(),
    revalidatePath: vi.fn(),
    tx: {
      projectChecklistTask: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      auditLog: { create: vi.fn(), findMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    },
    prisma: {
      company: { findUnique: vi.fn() },
      companyMember: { findFirst: vi.fn() },
      site: { findFirst: vi.fn() },
      // Task and audit writes belong on the transaction client only.
      projectChecklistTask: { findFirst: forbidden('prisma.projectChecklistTask.findFirst'), update: forbidden('prisma.projectChecklistTask.update') },
      auditLog: {
        create: forbidden('prisma.auditLog.create'), findMany: forbidden('prisma.auditLog.findMany'),
        delete: forbidden('prisma.auditLog.delete'), deleteMany: forbidden('prisma.auditLog.deleteMany'),
      },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const actions = await import('@/actions/checklists')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', deletedAt: null, assignedEngineerId: null, engineerId: null, clientUserId: null },
  { id: 'site_2', companyId: 'company_1', deletedAt: null, assignedEngineerId: null, engineerId: null, clientUserId: null },
  { id: 'site_dead', companyId: 'company_1', deletedAt: new Date('2026-01-01'), assignedEngineerId: null, engineerId: null, clientUserId: null },
  { id: 'site_foreign', companyId: 'company_2', deletedAt: null, assignedEngineerId: null, engineerId: null, clientUserId: null },
]

function task(id: string, siteId: string, companyId: string, status = 'PENDING'): TaskRow {
  return {
    id, name: `Task ${id}`, status, isClientDone: false, isNeglected: false,
    completedAt: status === 'COMPLETED' ? new Date('2026-09-01') : null,
    completedById: status === 'COMPLETED' ? 'user_earlier' : null,
    checklist: { siteId, companyId },
  }
}

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

let store: Store
let failAudit: boolean

function freshStore(): Store {
  return {
    tasks: {
      task_1: task('task_1', 'site_1', 'company_1'),
      task_done: task('task_done', 'site_1', 'company_1', 'COMPLETED'),
      task_site_2: task('task_site_2', 'site_2', 'company_1'),
      task_dead: task('task_dead', 'site_dead', 'company_1'),
      task_foreign: task('task_foreign', 'site_foreign', 'company_2'),
    },
    // Prior history of site_1, including another task's untick: none of it may vanish.
    audit: [
      { id: 'audit_old_tick', userId: 'user_earlier', companyId: 'company_1', action: 'TICK', module: 'CHECKLIST', recordId: 'site_1', after: { taskId: 'task_done', taskName: 'Task task_done', status: 'COMPLETED' } },
      { id: 'audit_other_untick', userId: 'user_earlier', companyId: 'company_1', action: 'UNTICK', module: 'CHECKLIST', recordId: 'site_1', after: { taskId: 'task_other', status: 'PENDING' } },
    ],
  }
}

function matchesTaskWhere(row: TaskRow, where: Record<string, unknown>) {
  const keys = Object.keys(where).sort().join(',')
  if (keys !== 'category,id') throw new Error(`test: unexpected task where keys ${keys}`)
  const checklist = (where.category as { stage?: { checklist?: Record<string, unknown> } })?.stage?.checklist
  if (!checklist || !checklist.siteId || !checklist.companyId) throw new Error('test: task lookup must bind site and company')
  return row.id === where.id && row.checklist.siteId === checklist.siteId && row.checklist.companyId === checklist.companyId
}

function pick(row: TaskRow, select?: Record<string, boolean>) {
  if (!select) return { ...row }
  return Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, row[key as keyof TaskRow]]))
}

function auditWrites() {
  const { auditLog } = mocks.tx
  return auditLog.create.mock.calls.length + destructiveAuditCalls()
}

function destructiveAuditCalls() {
  const { auditLog } = mocks.tx
  return [auditLog.delete, auditLog.deleteMany, auditLog.update, auditLog.updateMany, auditLog.upsert]
    .reduce((sum, fn) => sum + fn.mock.calls.length, 0)
}

function taskWrites() {
  return mocks.tx.projectChecklistTask.update.mock.calls.length + mocks.tx.projectChecklistTask.updateMany.mock.calls.length
}

beforeEach(() => {
  vi.clearAllMocks()
  store = freshStore()
  failAudit = false
  mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER'))
  mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['SITES', 'TASKS'], status: 'ACTIVE' })
  mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: ['site_1'] })
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)

  mocks.tx.projectChecklistTask.findFirst.mockImplementation(async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
    const row = Object.values(store.tasks).find((candidate) => matchesTaskWhere(candidate, where))
    return row ? pick(row, select) : null
  })
  mocks.tx.projectChecklistTask.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Partial<TaskRow> }) => {
    const row = store.tasks[where.id]
    if (!row) throw new Error('P2025: Record to update not found')
    Object.assign(row, data)
    return { ...row }
  })
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

describe('checklist tick and untick append immutable audit events', () => {
  it('a tick completes the task and appends a CHECKLIST TICK event in one transaction', async () => {
    await expect(actions.toggleTaskStatus('site_1', 'task_1', 'COMPLETED')).resolves.toEqual({ success: true })

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(store.tasks.task_1).toMatchObject({ status: 'COMPLETED', completedById: 'user_project_manager' })
    expect(store.tasks.task_1.completedAt).toBeInstanceOf(Date)
    expect(store.audit).toHaveLength(3)
    expect(store.audit[2]).toMatchObject({
      userId: 'user_project_manager',
      companyId: 'company_1',
      module: 'CHECKLIST',
      action: 'TICK',
      recordId: 'site_1',
      before: { taskId: 'task_1', status: 'PENDING' },
      after: { taskId: 'task_1', taskName: 'Task task_1', siteId: 'site_1', status: 'COMPLETED' },
    })
  })

  it('an untick appends a CHECKLIST UNTICK event and never deletes history', async () => {
    const before = structuredClone(store.audit)
    await expect(actions.toggleTaskStatus('site_1', 'task_done', 'PENDING')).resolves.toEqual({ success: true })

    expect(destructiveAuditCalls()).toBe(0)
    expect(mocks.tx.auditLog.findMany).not.toHaveBeenCalled()
    expect(store.audit.slice(0, before.length)).toEqual(before)
    expect(store.audit).toHaveLength(before.length + 1)
    expect(store.audit.at(-1)).toMatchObject({
      userId: 'user_project_manager',
      companyId: 'company_1',
      module: 'CHECKLIST',
      action: 'UNTICK',
      recordId: 'site_1',
      before: { taskId: 'task_done', status: 'COMPLETED' },
      after: { taskId: 'task_done', taskName: 'Task task_done', siteId: 'site_1', status: 'PENDING' },
    })
    expect(store.tasks.task_done).toMatchObject({ status: 'PENDING', completedAt: null, completedById: null })
  })

  it('tick, untick, tick keeps every event in order', async () => {
    await actions.toggleTaskStatus('site_1', 'task_1', 'COMPLETED')
    await actions.toggleTaskStatus('site_1', 'task_1', 'PENDING')
    await actions.toggleTaskStatus('site_1', 'task_1', 'COMPLETED')

    expect(destructiveAuditCalls()).toBe(0)
    expect(store.audit.map((row) => row.id)).toEqual(['audit_old_tick', 'audit_other_untick', 'audit_3', 'audit_4', 'audit_5'])
    expect(store.audit.slice(2).map((row) => row.action)).toEqual(['TICK', 'UNTICK', 'TICK'])
  })

  it('a field user ticking progress is the recorded actor', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    await actions.toggleTaskStatus('site_1', 'task_1', 'COMPLETED')
    expect(store.audit.at(-1)).toMatchObject({ userId: 'user_site_engineer', companyId: 'company_1', action: 'TICK' })
  })

  it('the event carries no secrets or session material', async () => {
    await actions.toggleTaskStatus('site_1', 'task_1', 'COMPLETED')
    const serialized = JSON.stringify(store.audit.at(-1))
    for (const leak of ['email', 'password', 'passwordHash', 'token', 'secret', '@acme.test']) {
      expect(serialized).not.toContain(leak)
    }
  })
})

describe('checklist status transition is atomic with its audit event', () => {
  it.each([
    ['tick', 'task_1', 'COMPLETED'],
    ['untick', 'task_done', 'PENDING'],
  ] as const)('an audit failure on %s rolls the status back', async (_label, taskId, status) => {
    failAudit = true
    const beforeTask = structuredClone(store.tasks[taskId])
    const beforeAudit = structuredClone(store.audit)

    await expect(actions.toggleTaskStatus('site_1', taskId, status)).rejects.toThrow(/audit store unavailable/)

    expect(mocks.tx.projectChecklistTask.update).toHaveBeenCalledTimes(1)
    expect(store.tasks[taskId]).toEqual(beforeTask)
    expect(store.audit).toEqual(beforeAudit)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe('checklist status transition refuses bad targets before any write', () => {
  it.each([
    ['a task of another site', 'site_1', 'task_site_2'],
    ['a task of another tenant', 'site_1', 'task_foreign'],
    ['an unknown task', 'site_1', 'task_missing'],
  ])('refuses %s', async (_label, siteId, taskId) => {
    await expect(actions.toggleTaskStatus(siteId, taskId, 'COMPLETED')).rejects.toThrow(/access denied/)
    expect(taskWrites()).toBe(0)
    expect(auditWrites()).toBe(0)
  })

  it.each([
    ['a deleted site', 'site_dead', 'task_dead'],
    ['a foreign site', 'site_foreign', 'task_foreign'],
  ])('refuses a task on %s before the task is read', async (_label, siteId, taskId) => {
    await expect(actions.toggleTaskStatus(siteId, taskId, 'COMPLETED')).rejects.toThrow(/access denied/)
    expect(mocks.tx.projectChecklistTask.findFirst).not.toHaveBeenCalled()
    expect(taskWrites()).toBe(0)
    expect(auditWrites()).toBe(0)
  })

  it.each(['SITE_ENGINEER', 'SUPERVISOR'])('refuses a %s on an unassigned site', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(actions.toggleTaskStatus('site_2', 'task_site_2', 'COMPLETED')).rejects.toThrow(/FORBIDDEN/)
    expect(mocks.tx.projectChecklistTask.findFirst).not.toHaveBeenCalled()
    expect(taskWrites()).toBe(0)
    expect(auditWrites()).toBe(0)
  })

  it.each([
    ['an unknown status', 'site_1', 'task_1', 'DONE', false, false],
    ['a non-string status', 'site_1', 'task_1', { toString: () => 'COMPLETED' }, false, false],
    ['a non-string task id', 'site_1', { id: 'task_1' }, 'COMPLETED', false, false],
    ['an empty task id', 'site_1', '', 'COMPLETED', false, false],
    ['a non-string site id', ['site_1'], 'task_1', 'COMPLETED', false, false],
    ['a non-boolean client-done flag', 'site_1', 'task_1', 'PENDING', 'true', false],
    ['a non-boolean neglected flag', 'site_1', 'task_1', 'PENDING', false, 1],
  ])('refuses %s before any read or write', async (_label, siteId, taskId, status, isClientDone, isNeglected) => {
    const call = actions.toggleTaskStatus as unknown as (...args: unknown[]) => Promise<unknown>
    await expect(call(siteId, taskId, status, isClientDone, isNeglected)).rejects.toThrow(/Invalid/)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(taskWrites()).toBe(0)
    expect(auditWrites()).toBe(0)
  })
})
