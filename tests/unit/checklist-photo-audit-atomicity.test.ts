import { beforeEach, describe, expect, it, vi } from 'vitest'
import { matchesWhere } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for checklist structure changes and photo workflows committing without a
 * durable audit trail.
 *
 * Enabling a checklist, neglecting a category, adding or renaming a task, moderating a
 * photo's client visibility and attaching a checklist or mobile site photo were bare
 * writes: nothing recorded who changed what, and a later failure could not roll the
 * change back. Now each of them re-reads its target on exactly the authorized site and
 * tenant inside one transaction, writes the change, and appends an audit event on the
 * same transaction client. The event names the server-derived actor, company, site and
 * record with safe before/after metadata (never a stored or client-sent URL); an audit
 * failure throws and the state change rolls back.
 *
 * The live gates (`@/lib/auth/checklist-site`, `@/lib/auth/site-mutation`) are stubbed
 * here to return an authorized principal; their scope rules are covered by
 * checklist-mutation-permission, checklist-assigned-site-scope,
 * checklist-photo-media-asset, mobile-photo-authorization and client-photo-approval.
 */
type Store = {
  checklists: Row[]
  stages: Row[]
  categories: Row[]
  tasks: Row[]
  photos: Row[]
  sites: Row[]
  assets: Row[]
  audit: Row[]
}

const mocks = vi.hoisted(() => {
  const forbidden = (name: string) => vi.fn(async () => {
    throw new Error(`test: ${name} must run on the transaction client`)
  })
  return {
    requireChecklistSite: vi.fn(),
    requireChecklistCategory: vi.fn(),
    requireChecklistTask: vi.fn(),
    requireChecklistPhoto: vi.fn(),
    requireAssignedSiteMutation: vi.fn(),
    revalidatePath: vi.fn(),
    tx: {
      checklistTemplate: { findFirst: vi.fn() },
      projectChecklist: { findFirst: vi.fn(), create: vi.fn() },
      projectChecklistCategory: { findFirst: vi.fn(), update: vi.fn() },
      projectChecklistTask: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
      mediaAsset: { findFirst: vi.fn(), updateMany: vi.fn() },
      sitePhoto: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      auditLog: { create: vi.fn() },
    },
    prisma: {
      checklistTemplate: { findFirst: forbidden('prisma.checklistTemplate.findFirst') },
      projectChecklist: { findFirst: forbidden('prisma.projectChecklist.findFirst'), create: forbidden('prisma.projectChecklist.create') },
      projectChecklistCategory: { findFirst: forbidden('prisma.projectChecklistCategory.findFirst'), update: forbidden('prisma.projectChecklistCategory.update') },
      projectChecklistTask: { findFirst: forbidden('prisma.projectChecklistTask.findFirst'), create: forbidden('prisma.projectChecklistTask.create'), update: forbidden('prisma.projectChecklistTask.update') },
      mediaAsset: { findFirst: forbidden('prisma.mediaAsset.findFirst'), updateMany: forbidden('prisma.mediaAsset.updateMany') },
      sitePhoto: { findFirst: forbidden('prisma.sitePhoto.findFirst'), create: forbidden('prisma.sitePhoto.create'), update: forbidden('prisma.sitePhoto.update'), updateMany: forbidden('prisma.sitePhoto.updateMany') },
      auditLog: { create: forbidden('prisma.auditLog.create') },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: vi.fn() }))
vi.mock('@/lib/auth/checklist-site', () => ({
  requireChecklistSite: mocks.requireChecklistSite,
  requireChecklistCategory: mocks.requireChecklistCategory,
  requireChecklistTask: mocks.requireChecklistTask,
  requireChecklistPhoto: mocks.requireChecklistPhoto,
  listChecklistSites: vi.fn(),
}))
vi.mock('@/lib/auth/site-mutation', () => ({ requireAssignedSiteMutation: mocks.requireAssignedSiteMutation }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const actions = await import('@/actions/checklists')
const { uploadMobileSitePhotoAction } = await import('@/actions/mobile-photo')

const USER = { id: 'user_pm', name: 'Priya', email: 'priya@acme.test', role: 'PROJECT_MANAGER', companyId: 'company_1' }
const SITE = { id: 'site_1', companyId: 'company_1' }
const SECRET_URL = 'https://res.cloudinary.com/demo/image/upload/v1/secret-photo.jpg'
const SECRET_PUBLIC_ID = 'civil-tracker/acme/site_1/SITE_PHOTO/secret'

const TEMPLATE = {
  id: 'tpl_1',
  stages: [
    { name: 'Structure', order: 1, weight: 50, categories: [
      { name: 'Slab', order: 1, tasks: [{ name: 'Pour', order: 1, isRequired: true }, { name: 'Cure', order: 2, isRequired: false }] },
    ] },
    { name: 'Finish', order: 2, weight: 50, categories: [
      { name: 'Paint', order: 1, tasks: [{ name: 'Prime', order: 1, isRequired: true }] },
    ] },
  ],
}


let store: Store
let failAudit: boolean
let nextId: number

function freshStore(): Store {
  return {
    sites: [
      { id: 'site_1', companyId: 'company_1', deletedAt: null },
      { id: 'site_2', companyId: 'company_1', deletedAt: null },
    ],
    checklists: [{ id: 'checklist_1', siteId: 'site_1', companyId: 'company_1', templateId: 'tpl_1' }],
    stages: [{ id: 'stage_1', checklistId: 'checklist_1', name: 'Structure' }],
    categories: [{ id: 'cat_1', stageId: 'stage_1', name: 'Slab', isNeglected: false }],
    tasks: [{ id: 'task_1', categoryId: 'cat_1', name: 'Pour slab', order: 1, status: 'PENDING' }],
    photos: [
      { id: 'photo_1', companyId: 'company_1', siteId: 'site_1', taskId: 'task_1', approvedForClient: false, approvedById: null, approvedAt: null, secureUrl: SECRET_URL, cloudinaryPublicId: 'bound/photo_1' },
      { id: 'photo_shown', companyId: 'company_1', siteId: 'site_1', taskId: null, approvedForClient: true, approvedById: 'user_admin', approvedAt: new Date('2026-09-01T00:00:00Z'), secureUrl: SECRET_URL, cloudinaryPublicId: 'bound/photo_shown' },
    ],
    assets: [
      { id: 'asset_1', companyId: 'company_1', siteId: 'site_1', module: 'SITE_PHOTO', uploadedById: 'user_pm', secureUrl: SECRET_URL, cloudinaryPublicId: SECRET_PUBLIC_ID, consumedAt: null, consumedBy: null, consumedRecordId: null },
    ],
    audit: [{ id: 'audit_old', module: 'CHECKLIST', action: 'TICK', recordId: 'site_1' }],
  }
}

function relation(row: Row, key: string): Row | null | undefined {
  if (key === 'category' && 'categoryId' in row) return store.categories.find((c) => c.id === row.categoryId) ?? null
  if (key === 'stage' && 'stageId' in row) return store.stages.find((s) => s.id === row.stageId) ?? null
  if (key === 'checklist' && 'checklistId' in row) return store.checklists.find((c) => c.id === row.checklistId) ?? null
  if (key === 'site' && 'siteId' in row && 'secureUrl' in row) return store.sites.find((s) => s.id === row.siteId) ?? null
  return undefined
}

function pick(row: Row, select?: Record<string, unknown>) {
  if (!select) return { ...row }
  return Object.fromEntries(Object.keys(select).filter((key) => select[key] === true).map((key) => [key, row[key]]))
}

function found(rows: Row[], args: { where: Row; select?: Record<string, unknown> }) {
  const row = rows.find((candidate) => matchesWhere(candidate, args.where, relation))
  return row ? pick(row, args.select) : null
}

function countNested(data: Row) {
  const stages = ((data.stages as Row)?.create ?? []) as Row[]
  const categories = stages.flatMap((stage) => ((stage.categories as Row)?.create ?? []) as Row[])
  const tasks = categories.flatMap((category) => ((category.tasks as Row)?.create ?? []) as Row[])
  return { stages: stages.length, categories: categories.length, tasks: tasks.length }
}

function newAudit() {
  return store.audit.slice(1)
}

beforeEach(() => {
  vi.clearAllMocks()
  store = freshStore()
  failAudit = false
  nextId = 1

  mocks.requireChecklistSite.mockResolvedValue({ user: USER, site: SITE })
  mocks.requireChecklistCategory.mockResolvedValue({ user: USER, site: SITE, category: { id: 'cat_1' } })
  mocks.requireChecklistTask.mockResolvedValue({ user: USER, site: SITE, task: { id: 'task_1', name: 'Pour slab' } })
  mocks.requireChecklistPhoto.mockImplementation(async (photoId: string) => {
    const photo = store.photos.find((row) => row.id === photoId)
    if (!photo) throw new Error('FORBIDDEN: Site photo not found or access denied')
    return { user: USER, photo: { ...photo, site: { companyId: 'company_1' }, task: null } }
  })
  mocks.requireAssignedSiteMutation.mockResolvedValue({ user: USER, site: SITE })

  const { tx } = mocks
  tx.checklistTemplate.findFirst.mockResolvedValue(TEMPLATE)
  tx.projectChecklist.findFirst.mockImplementation(async (args) => found(store.checklists, args))
  tx.projectChecklist.create.mockImplementation(async ({ data }: { data: Row }) => {
    const row = { id: `checklist_new_${nextId++}`, siteId: data.siteId, companyId: data.companyId, templateId: data.templateId, nested: countNested(data) }
    store.checklists.push(row)
    return { id: row.id }
  })
  tx.projectChecklistCategory.findFirst.mockImplementation(async (args) => found(store.categories, args))
  tx.projectChecklistCategory.update.mockImplementation(async ({ where, data }: { where: Row; data: Row }) => {
    const row = store.categories.find((c) => c.id === where.id)
    if (!row) throw new Error('P2025')
    Object.assign(row, data)
    return { id: row.id }
  })
  tx.projectChecklistTask.findFirst.mockImplementation(async (args) => found(store.tasks, args))
  tx.projectChecklistTask.create.mockImplementation(async ({ data }: { data: Row }) => {
    const row = { id: `task_new_${nextId++}`, status: 'PENDING', ...data }
    store.tasks.push(row)
    return { id: row.id, name: row.name }
  })
  tx.projectChecklistTask.update.mockImplementation(async ({ where, data }: { where: Row; data: Row }) => {
    const row = store.tasks.find((t) => t.id === where.id)
    if (!row) throw new Error('P2025')
    Object.assign(row, data)
    return { id: row.id }
  })
  tx.mediaAsset.findFirst.mockImplementation(async (args) => found(store.assets, args))
  tx.mediaAsset.updateMany.mockImplementation(async ({ where, data }: { where: Row; data: Row }) => {
    const rows = store.assets.filter((row) => matchesWhere(row, where))
    rows.forEach((row) => Object.assign(row, data))
    return { count: rows.length }
  })
  tx.sitePhoto.findFirst.mockImplementation(async (args) => found(store.photos, args))
  tx.sitePhoto.create.mockImplementation(async ({ data }: { data: Row }) => {
    const row = { id: `photo_new_${nextId++}`, approvedForClient: false, ...data }
    store.photos.push(row)
    return { id: row.id }
  })
  tx.sitePhoto.updateMany.mockImplementation(async ({ where, data }: { where: Row; data: Row }) => {
    const rows = store.photos.filter((row) => matchesWhere(row, where, relation))
    rows.forEach((row) => Object.assign(row, data))
    return { count: rows.length }
  })
  tx.auditLog.create.mockImplementation(async ({ data }: { data: Row }) => {
    if (failAudit) throw new Error('audit store unavailable')
    const row = { id: `audit_${nextId++}`, ...data }
    store.audit.push(row)
    return row
  })
  // Rollback semantics: a callback that throws leaves the store as it was.
  mocks.prisma.$transaction.mockImplementation(async (fn: (client: typeof mocks.tx) => unknown) => {
    const snapshot = structuredClone(store)
    try {
      return await fn(mocks.tx)
    } catch (error) {
      store = snapshot
      throw error
    }
  })
})

function expectNoLeak(row: Row | undefined) {
  const serialized = JSON.stringify(row)
  for (const leak of [SECRET_URL, SECRET_PUBLIC_ID, 'res.cloudinary.com', 'https://', 'priya@acme.test', 'password', 'token']) {
    expect(serialized).not.toContain(leak)
  }
}

describe('checklist structure changes are audited in the same transaction', () => {
  it('enabling a checklist clones the template and appends a CHECKLIST CREATE event', async () => {
    store.checklists = []
    await expect(actions.enableChecklistForProject('site_1', 'tpl_1')).resolves.toEqual({ success: true })

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(store.checklists).toHaveLength(1)
    expect(newAudit()).toHaveLength(1)
    expect(newAudit()[0]).toMatchObject({
      userId: 'user_pm',
      companyId: 'company_1',
      module: 'CHECKLIST',
      action: 'CREATE',
      recordId: 'site_1',
      after: {
        change: 'CHECKLIST_ENABLED',
        checklistId: store.checklists[0].id,
        templateId: 'tpl_1',
        siteId: 'site_1',
        stageCount: 2,
        categoryCount: 2,
        taskCount: 3,
      },
    })
    expectNoLeak(newAudit()[0])
  })

  it('refuses a second checklist without writing or auditing', async () => {
    await expect(actions.enableChecklistForProject('site_1', 'tpl_1')).rejects.toThrow(/already enabled/)
    expect(mocks.tx.projectChecklist.create).not.toHaveBeenCalled()
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('neglecting a category appends a CHECKLIST UPDATE event with before/after state', async () => {
    await expect(actions.toggleCategoryNeglect('site_1', 'cat_1', true)).resolves.toEqual({ success: true })

    expect(store.categories[0].isNeglected).toBe(true)
    expect(newAudit()).toEqual([expect.objectContaining({
      userId: 'user_pm',
      companyId: 'company_1',
      module: 'CHECKLIST',
      action: 'UPDATE',
      recordId: 'site_1',
      before: { categoryId: 'cat_1', siteId: 'site_1', isNeglected: false },
      after: { change: 'CATEGORY_NEGLECT', categoryId: 'cat_1', categoryName: 'Slab', siteId: 'site_1', isNeglected: true },
    })])
  })

  it('adding a task appends a CHECKLIST CREATE event naming the new task and its category', async () => {
    await expect(actions.addCustomTask('site_1', 'cat_1', 'Extra check')).resolves.toEqual({ success: true })

    const created = store.tasks.find((row) => row.name === 'Extra check')
    expect(created).toMatchObject({ categoryId: 'cat_1', order: 999 })
    expect(newAudit()).toEqual([expect.objectContaining({
      userId: 'user_pm',
      companyId: 'company_1',
      module: 'CHECKLIST',
      action: 'CREATE',
      recordId: 'site_1',
      after: { change: 'TASK_CREATED', taskId: created!.id, taskName: 'Extra check', categoryId: 'cat_1', siteId: 'site_1' },
    })])
  })

  it('renaming a task appends a CHECKLIST UPDATE event with the old and new name', async () => {
    await expect(actions.editChecklistTask('site_1', 'task_1', 'Pour roof slab')).resolves.toEqual({ success: true })

    expect(store.tasks[0].name).toBe('Pour roof slab')
    expect(newAudit()).toEqual([expect.objectContaining({
      userId: 'user_pm',
      companyId: 'company_1',
      module: 'CHECKLIST',
      action: 'UPDATE',
      recordId: 'site_1',
      before: { taskId: 'task_1', siteId: 'site_1', taskName: 'Pour slab' },
      after: { change: 'TASK_RENAMED', taskId: 'task_1', siteId: 'site_1', taskName: 'Pour roof slab' },
    })])
  })

  it('re-reads the category and task on the authorized site inside the transaction', async () => {
    mocks.requireChecklistCategory.mockResolvedValue({ user: USER, site: { id: 'site_2', companyId: 'company_1' }, category: { id: 'cat_1' } })
    mocks.requireChecklistTask.mockResolvedValue({ user: USER, site: { id: 'site_2', companyId: 'company_1' }, task: { id: 'task_1', name: 'Pour slab' } })

    await expect(actions.toggleCategoryNeglect('site_2', 'cat_1', true)).rejects.toThrow(/access denied/)
    await expect(actions.addCustomTask('site_2', 'cat_1', 'Extra')).rejects.toThrow(/access denied/)
    await expect(actions.editChecklistTask('site_2', 'task_1', 'Renamed')).rejects.toThrow(/access denied/)

    expect(mocks.tx.projectChecklistCategory.update).not.toHaveBeenCalled()
    expect(mocks.tx.projectChecklistTask.create).not.toHaveBeenCalled()
    expect(mocks.tx.projectChecklistTask.update).not.toHaveBeenCalled()
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
  })

  it.each([
    ['enableChecklistForProject', () => { store.checklists = []; return actions.enableChecklistForProject('site_1', 'tpl_1') }],
    ['toggleCategoryNeglect', () => actions.toggleCategoryNeglect('site_1', 'cat_1', true)],
    ['addCustomTask', () => actions.addCustomTask('site_1', 'cat_1', 'Extra')],
    ['editChecklistTask', () => actions.editChecklistTask('site_1', 'task_1', 'Renamed')],
  ] as const)('%s rolls back when its audit event cannot be written', async (_name, invoke) => {
    failAudit = true
    const pending = invoke()
    const before = structuredClone(store)

    await expect(pending).rejects.toThrow(/audit store unavailable/)

    expect(mocks.tx.auditLog.create).toHaveBeenCalledTimes(1)
    expect(store).toEqual(before)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe('client visibility moderation is audited atomically', () => {
  it('approving a photo sets client visibility and appends a SITE_PHOTO APPROVE event', async () => {
    await expect(actions.approvePhotoAction('photo_1')).resolves.toEqual({ success: true })

    const photo = store.photos.find((row) => row.id === 'photo_1')!
    expect(photo).toMatchObject({ approvedForClient: true, approvedById: 'user_pm' })
    expect(photo.approvedAt).toBeInstanceOf(Date)
    expect(newAudit()).toEqual([expect.objectContaining({
      userId: 'user_pm',
      companyId: 'company_1',
      module: 'SITE_PHOTO',
      action: 'APPROVE',
      recordId: 'photo_1',
      before: { photoId: 'photo_1', siteId: 'site_1', taskId: 'task_1', approvedForClient: false, approvedById: null },
      after: { photoId: 'photo_1', siteId: 'site_1', taskId: 'task_1', approvedForClient: true, approvedById: 'user_pm', approvedAt: (photo.approvedAt as Date).toISOString() },
    })])
    expectNoLeak(newAudit()[0])
  })

  it('rejecting a photo hides it from the client and appends a SITE_PHOTO REJECT event', async () => {
    await expect(actions.rejectPhotoAction('photo_shown')).resolves.toEqual({ success: true })

    expect(store.photos.find((row) => row.id === 'photo_shown')).toMatchObject({ approvedForClient: false, approvedById: null, approvedAt: null })
    expect(newAudit()).toEqual([expect.objectContaining({
      userId: 'user_pm',
      companyId: 'company_1',
      module: 'SITE_PHOTO',
      action: 'REJECT',
      recordId: 'photo_shown',
      before: { photoId: 'photo_shown', siteId: 'site_1', taskId: null, approvedForClient: true, approvedById: 'user_admin' },
      after: { photoId: 'photo_shown', siteId: 'site_1', taskId: null, approvedForClient: false, approvedById: null, approvedAt: null },
    })])
    expectNoLeak(newAudit()[0])
  })

  it('binds the visibility write to the authorized photo, company and site', async () => {
    await actions.approvePhotoAction('photo_1')
    expect(mocks.tx.sitePhoto.update).not.toHaveBeenCalled()
    expect(mocks.tx.sitePhoto.updateMany.mock.calls[0][0].where).toMatchObject({
      id: 'photo_1', companyId: 'company_1', siteId: 'site_1', site: { companyId: 'company_1', deletedAt: null },
    })
  })

  it('does not write or audit when the photo site is deleted before the write', async () => {
    store.sites[0].deletedAt = new Date('2026-09-02')
    await expect(actions.approvePhotoAction('photo_1')).rejects.toThrow(/access denied/)
    expect(mocks.tx.sitePhoto.updateMany).not.toHaveBeenCalled()
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expect(store.photos[0].approvedForClient).toBe(false)
  })

  it.each([
    ['approvePhotoAction', 'photo_1', () => actions.approvePhotoAction('photo_1')],
    ['rejectPhotoAction', 'photo_shown', () => actions.rejectPhotoAction('photo_shown')],
  ] as const)('%s rolls the visibility change back when the audit fails', async (_name, photoId, invoke) => {
    failAudit = true
    const before = structuredClone(store.photos.find((row) => row.id === photoId))

    await expect(invoke()).rejects.toThrow(/audit store unavailable/)

    expect(mocks.tx.sitePhoto.updateMany).toHaveBeenCalledTimes(1)
    expect(store.photos.find((row) => row.id === photoId)).toEqual(before)
    expect(newAudit()).toEqual([])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe('photo attachment is audited atomically without storing URLs in the event', () => {
  it('a checklist photo appends a SITE_PHOTO CREATE event naming the asset, task and site', async () => {
    await expect(actions.uploadChecklistPhotoAction('task_1', 'site_1', 'asset_1')).resolves.toEqual({ success: true })

    const created = store.photos.find((row) => String(row.id).startsWith('photo_new'))!
    expect(created).toMatchObject({ secureUrl: SECRET_URL, cloudinaryPublicId: SECRET_PUBLIC_ID, taskId: 'task_1' })
    expect(newAudit()).toEqual([expect.objectContaining({
      userId: 'user_pm',
      companyId: 'company_1',
      module: 'SITE_PHOTO',
      action: 'CREATE',
      recordId: created.id,
      after: { change: 'CHECKLIST_PHOTO_ATTACHED', photoId: created.id, mediaAssetId: 'asset_1', taskId: 'task_1', siteId: 'site_1' },
    })])
    expectNoLeak(newAudit()[0])
  })

  it('a mobile site photo appends a SITE_PHOTO CREATE event naming the asset and site', async () => {
    const result = await uploadMobileSitePhotoAction({ siteId: 'site_1', mediaAssetId: 'asset_1', caption: 'Slab https://evil.test/x', gps: '13.08, 80.27' })

    const created = store.photos.find((row) => String(row.id).startsWith('photo_new'))!
    expect(result).toEqual({ success: true, id: created.id })
    expect(newAudit()).toEqual([expect.objectContaining({
      userId: 'user_pm',
      companyId: 'company_1',
      module: 'SITE_PHOTO',
      action: 'CREATE',
      recordId: created.id,
      after: { change: 'SITE_PHOTO_ATTACHED', photoId: created.id, mediaAssetId: 'asset_1', siteId: 'site_1', hasCaption: true, hasGps: true },
    })])
    expectNoLeak(newAudit()[0])
    expect(JSON.stringify(newAudit()[0])).not.toContain('evil.test')
  })

  it('a mobile site photo reads its asset on the transaction client', async () => {
    await uploadMobileSitePhotoAction({ siteId: 'site_1', mediaAssetId: 'asset_1', caption: '', gps: '' })
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.mediaAsset.findFirst).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['uploadChecklistPhotoAction', () => actions.uploadChecklistPhotoAction('task_1', 'site_1', 'asset_1')],
    ['uploadMobileSitePhotoAction', () => uploadMobileSitePhotoAction({ siteId: 'site_1', mediaAssetId: 'asset_1', caption: 'x', gps: '' })],
  ] as const)('%s rolls the photo back when the audit fails', async (_name, invoke) => {
    failAudit = true
    const before = structuredClone(store.photos)

    await expect(invoke()).rejects.toThrow(/audit store unavailable/)

    expect(mocks.tx.sitePhoto.create).toHaveBeenCalledTimes(1)
    expect(store.photos).toEqual(before)
    expect(newAudit()).toEqual([])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    // The one-time claim rolled back with the photo, so the upload can be attached again.
    expect(store.assets[0]).toMatchObject({ consumedAt: null, consumedBy: null, consumedRecordId: null })
    failAudit = false
    await expect(invoke()).resolves.toMatchObject({ success: true })
  })

  it.each([
    ['uploadChecklistPhotoAction', 'CHECKLIST_PHOTO', () => actions.uploadChecklistPhotoAction('task_1', 'site_1', 'asset_1')],
    ['uploadMobileSitePhotoAction', 'SITE_PHOTO', () => uploadMobileSitePhotoAction({ siteId: 'site_1', mediaAssetId: 'asset_1', caption: 'x', gps: '' })],
  ] as const)('%s claims the upload for the created photo, and a second use is refused', async (_name, purpose, invoke) => {
    await invoke()
    const created = store.photos.find((row) => String(row.id).startsWith('photo_new'))!
    expect(store.assets[0]).toMatchObject({ consumedBy: purpose, consumedRecordId: created.id })
    expect(store.assets[0].consumedAt).toBeInstanceOf(Date)

    await expect(invoke()).rejects.toThrow(/already attached/)
    expect(mocks.tx.sitePhoto.create).toHaveBeenCalledTimes(1)
    expect(newAudit()).toHaveLength(1)
  })

  it('refuses a foreign asset without writing or auditing', async () => {
    await expect(uploadMobileSitePhotoAction({ siteId: 'site_1', mediaAssetId: 'asset_missing', caption: '', gps: '' })).rejects.toThrow(/Uploaded photo not found/)
    await expect(actions.uploadChecklistPhotoAction('task_1', 'site_1', 'asset_missing')).rejects.toThrow(/Uploaded photo not found/)
    expect(mocks.tx.sitePhoto.create).not.toHaveBeenCalled()
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
  })
})
