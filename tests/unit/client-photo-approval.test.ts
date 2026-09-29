import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression for `clientApproveTaskPhoto` (src/actions/checklists.ts) confirming a task
 * with a bare, unaudited update.
 *
 * The action loaded the photo once on the root client, then issued
 * `projectChecklistTask.update({ where: { id: photo.taskId } })`: the write carried no
 * site, company or client binding, any current task state (already confirmed, too) was
 * overwritten, and no audit record was written at all.
 *
 * Now the photo is re-read on the transaction client, bound to an active site of the
 * client's live company that is explicitly assigned to the client; the task must be on
 * that site's checklist and not yet client-confirmed; the guarded write repeats that
 * binding and the observed state and must match exactly one row; and the required audit
 * record shares the transaction, so an audit failure rolls the confirmation back.
 *
 * The transaction mock stages every write issued on `tx` and commits it only when the
 * callback resolves.
 */
const mocks = vi.hoisted(() => {
  const committed: Array<{ model: string; args: Record<string, unknown> }> = []
  let staged: typeof committed = []

  const tx = {
    sitePhoto: { findFirst: vi.fn() },
    projectChecklistTask: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }

  return {
    requireUser: vi.fn(),
    revalidatePath: vi.fn(),
    committed,
    tx,
    stage(model: string, args: Record<string, unknown>) {
      staged.push({ model, args })
    },
    async runTransaction(run: (client: typeof tx) => unknown) {
      staged = []
      try {
        const result = await run(tx)
        committed.push(...staged)
        return result
      } finally {
        staged = []
      }
    },
    prisma: {
      $transaction: vi.fn(),
      sitePhoto: { findFirst: vi.fn() },
      projectChecklistTask: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      auditLog: { create: vi.fn() },
    },
  }
})

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { clientApproveTaskPhoto } = await import('@/actions/checklists')

const CLIENT = { id: 'client_1', name: 'Cora', email: 'cora@client.test', role: 'CLIENT', companyId: 'company_1' }

type Photo = { id: string; siteId: string; companyId: string; taskId: string | null; approvedForClient: boolean; site: SiteRow }
type SiteRow = { id: string; companyId: string; clientUserId: string | null; deletedAt: Date | null; companyStatus: string }
type Task = { id: string; name: string; status: string; isClientDone: boolean; completedAt: Date | null; siteId: string; companyId: string }

const SITE_1: SiteRow = { id: 'site_1', companyId: 'company_1', clientUserId: 'client_1', deletedAt: null, companyStatus: 'ACTIVE' }
const SITE_OTHER_CLIENT: SiteRow = { id: 'site_2', companyId: 'company_1', clientUserId: 'client_2', deletedAt: null, companyStatus: 'ACTIVE' }
const SITE_FOREIGN: SiteRow = { id: 'site_3', companyId: 'company_2', clientUserId: 'client_1', deletedAt: null, companyStatus: 'ACTIVE' }

let photos: Photo[]
let tasks: Task[]

type SiteWhere = {
  clientUserId: string
  companyId: string
  deletedAt: null
  company: { deletedAt: null; status: { notIn: string[] } }
}
type PhotoWhere = { id: string; approvedForClient: boolean; site: SiteWhere }
type TaskWhere = {
  id: string
  isClientDone?: boolean
  status?: string
  category: { stage: { checklist: { siteId: string; companyId: string } } }
}

function matchesSite(site: SiteRow, where: SiteWhere) {
  return site.clientUserId === where.clientUserId &&
    site.companyId === where.companyId &&
    site.deletedAt === where.deletedAt &&
    !where.company.status.notIn.includes(site.companyStatus)
}

function matchesTask(task: Task, where: TaskWhere) {
  const checklist = where.category.stage.checklist
  return task.id === where.id &&
    task.siteId === checklist.siteId &&
    task.companyId === checklist.companyId &&
    (where.isClientDone === undefined || task.isClientDone === where.isClientDone) &&
    (where.status === undefined || task.status === where.status)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.committed.length = 0
  photos = [
    { id: 'photo_1', siteId: 'site_1', companyId: 'company_1', taskId: 'task_1', approvedForClient: true, site: SITE_1 },
    { id: 'photo_unapproved', siteId: 'site_1', companyId: 'company_1', taskId: 'task_1', approvedForClient: false, site: SITE_1 },
    { id: 'photo_other_client', siteId: 'site_2', companyId: 'company_1', taskId: 'task_2', approvedForClient: true, site: SITE_OTHER_CLIENT },
    { id: 'photo_foreign_company', siteId: 'site_3', companyId: 'company_2', taskId: 'task_3', approvedForClient: true, site: SITE_FOREIGN },
    { id: 'photo_foreign_task', siteId: 'site_1', companyId: 'company_1', taskId: 'task_2', approvedForClient: true, site: SITE_1 },
    { id: 'photo_no_task', siteId: 'site_1', companyId: 'company_1', taskId: null, approvedForClient: true, site: SITE_1 },
    { id: 'photo_mismatch', siteId: 'site_1', companyId: 'company_2', taskId: 'task_1', approvedForClient: true, site: SITE_1 },
  ]
  tasks = [
    { id: 'task_1', name: 'Slab casting', status: 'IN_PROGRESS', isClientDone: false, completedAt: null, siteId: 'site_1', companyId: 'company_1' },
    { id: 'task_2', name: 'Plastering', status: 'PENDING', isClientDone: false, completedAt: null, siteId: 'site_2', companyId: 'company_1' },
    { id: 'task_3', name: 'Roofing', status: 'PENDING', isClientDone: false, completedAt: null, siteId: 'site_3', companyId: 'company_2' },
  ]

  mocks.requireUser.mockResolvedValue(CLIENT)
  mocks.prisma.$transaction.mockImplementation(mocks.runTransaction)
  mocks.tx.sitePhoto.findFirst.mockImplementation(async ({ where }: { where: PhotoWhere }) => {
    const photo = photos.find((p) => p.id === where.id && p.approvedForClient === where.approvedForClient && matchesSite(p.site, where.site))
    return photo ? { id: photo.id, siteId: photo.siteId, companyId: photo.companyId, taskId: photo.taskId, site: { id: photo.site.id, companyId: photo.site.companyId } } : null
  })
  mocks.tx.projectChecklistTask.findFirst.mockImplementation(async ({ where }: { where: TaskWhere }) => {
    const task = tasks.find((t) => matchesTask(t, where))
    return task ? { id: task.id, name: task.name, status: task.status, isClientDone: task.isClientDone, completedAt: task.completedAt } : null
  })
  mocks.tx.projectChecklistTask.updateMany.mockImplementation(async (args: { where: TaskWhere }) => {
    mocks.stage('projectChecklistTask.updateMany', args)
    return { count: tasks.filter((t) => matchesTask(t, args.where)).length }
  })
  mocks.tx.auditLog.create.mockImplementation(async (args: Record<string, unknown>) => {
    mocks.stage('auditLog.create', args)
    return { id: 'audit_1' }
  })
})

function rootWrites() {
  const { prisma, tx } = mocks
  return [prisma.projectChecklistTask.update, prisma.projectChecklistTask.updateMany, prisma.auditLog.create, tx.projectChecklistTask.update]
    .reduce((sum, fn) => sum + fn.mock.calls.length, 0)
}

function expectNothingWritten() {
  expect(mocks.tx.projectChecklistTask.updateMany).not.toHaveBeenCalled()
  expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
  expect(mocks.committed).toEqual([])
  expect(rootWrites()).toBe(0)
  expect(mocks.revalidatePath).not.toHaveBeenCalled()
}

describe('clientApproveTaskPhoto: ownership', () => {
  it('rejects a non-client role before looking up a photo', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'employee_1', role: 'SITE_ENGINEER', companyId: 'company_1' })
    await expect(clientApproveTaskPhoto('photo_1')).rejects.toThrow(/client portal access required/i)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.tx.sitePhoto.findFirst).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  it.each([
    ['a photo not approved for the client', 'photo_unapproved'],
    ['a photo on a site assigned to another client', 'photo_other_client'],
    ['a photo on a site of another company', 'photo_foreign_company'],
    ['an unknown photo', 'photo_ghost'],
  ])('refuses %s without writing', async (_label, photoId) => {
    await expect(clientApproveTaskPhoto(photoId)).rejects.toThrow(/photo not found or access denied/i)
    expectNothingWritten()
  })

  it('binds the photo to an active site of the live company explicitly assigned to the client', async () => {
    await clientApproveTaskPhoto('photo_1')
    expect(mocks.tx.sitePhoto.findFirst.mock.calls[0][0].where).toEqual({
      id: 'photo_1',
      approvedForClient: true,
      site: {
        clientUserId: 'client_1',
        companyId: 'company_1',
        deletedAt: null,
        company: { deletedAt: null, status: { notIn: ['SUSPENDED', 'CANCELLED'] } },
      },
    })
  })

  it('refuses a site of a suspended company', async () => {
    photos[0].site = { ...SITE_1, companyStatus: 'SUSPENDED' }
    await expect(clientApproveTaskPhoto('photo_1')).rejects.toThrow(/photo not found or access denied/i)
    expectNothingWritten()
  })

  it('refuses a photo whose company differs from its authorized site', async () => {
    await expect(clientApproveTaskPhoto('photo_mismatch')).rejects.toThrow(/company does not match/i)
    expectNothingWritten()
  })

  it('refuses a photo linked to a task of another site', async () => {
    await expect(clientApproveTaskPhoto('photo_foreign_task')).rejects.toThrow(/not linked to the authorized site/i)
    expect(mocks.tx.projectChecklistTask.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'task_2', category: { stage: { checklist: { siteId: 'site_1', companyId: 'company_1' } } },
    })
    expectNothingWritten()
  })

  it('refuses a photo that is not linked to a checklist task', async () => {
    await expect(clientApproveTaskPhoto('photo_no_task')).rejects.toThrow(/not linked to a checklist task/i)
    expectNothingWritten()
  })

  it.each([
    ['a non-string id', 42 as unknown as string],
    ['an empty id', ''],
    ['an over-long id', 'p'.repeat(200)],
  ])('refuses %s before opening a transaction', async (_label, photoId) => {
    await expect(clientApproveTaskPhoto(photoId)).rejects.toThrow(/photo not found or access denied/i)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('clientApproveTaskPhoto: transition', () => {
  it('refuses a task the client has already confirmed', async () => {
    tasks[0] = { ...tasks[0], status: 'COMPLETED', isClientDone: true }
    await expect(clientApproveTaskPhoto('photo_1')).rejects.toThrow(/already confirmed/i)
    expectNothingWritten()
  })

  it('refuses when the task changes between the re-read and the guarded write', async () => {
    mocks.tx.projectChecklistTask.updateMany.mockResolvedValue({ count: 0 })
    await expect(clientApproveTaskPhoto('photo_1')).rejects.toThrow(/changed/i)
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expect(mocks.committed).toEqual([])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe('clientApproveTaskPhoto: required audit', () => {
  it('rolls the confirmation back when the audit write fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit store unavailable'))

    await expect(clientApproveTaskPhoto('photo_1')).rejects.toThrow('audit store unavailable')

    expect(mocks.tx.projectChecklistTask.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.committed).toEqual([])
    expect(rootWrites()).toBe(0)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('commits the guarded confirmation and its audit record, then revalidates', async () => {
    await expect(clientApproveTaskPhoto('photo_1')).resolves.toEqual({ success: true })

    expect(rootWrites()).toBe(0)
    expect(mocks.committed).toHaveLength(2)

    const [write, audit] = mocks.committed
    expect(write.model).toBe('projectChecklistTask.updateMany')
    expect(write.args).toEqual({
      where: {
        id: 'task_1',
        isClientDone: false,
        status: 'IN_PROGRESS',
        category: { stage: { checklist: { siteId: 'site_1', companyId: 'company_1' } } },
      },
      data: { isClientDone: true, status: 'COMPLETED', completedAt: expect.any(Date) },
    })

    expect(audit).toEqual({
      model: 'auditLog.create',
      args: {
        data: {
          userId: 'client_1',
          companyId: 'company_1',
          module: 'CHECKLIST',
          action: 'CLIENT_APPROVE',
          recordId: 'site_1',
          before: { taskId: 'task_1', siteId: 'site_1', photoId: 'photo_1', status: 'IN_PROGRESS', isClientDone: false },
          after: { taskId: 'task_1', taskName: 'Slab casting', siteId: 'site_1', photoId: 'photo_1', status: 'COMPLETED', isClientDone: true },
        },
      },
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/client-portal')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/client-portal/photos')
  })

  it('keeps the original completion time of a task already completed by staff', async () => {
    const completedAt = new Date('2026-09-01T10:00:00.000Z')
    tasks[0] = { ...tasks[0], status: 'COMPLETED', completedAt }

    await expect(clientApproveTaskPhoto('photo_1')).resolves.toEqual({ success: true })

    const [write] = mocks.committed
    expect(write.args).toMatchObject({
      where: { id: 'task_1', isClientDone: false, status: 'COMPLETED' },
      data: { isClientDone: true, status: 'COMPLETED', completedAt },
    })
  })
})
