import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for client-visibility moderation reading the photo before any permission.
 *
 * `approvePhotoAction` / `rejectPhotoAction` went through `requireChecklistPhoto`, which
 * read the photo by id across the caller's company first and only then compared the role
 * against a hard-coded manager list. The TASKS module was never consulted and the caller's
 * checklist site scope was never applied, so a field role or a company with checklists
 * disabled still triggered a photo read (and the role list could drift from the
 * permission vocabulary).
 *
 * Now the live `tasks.manage` grant and the TASKS module are checked, and the caller's
 * checklist site scope resolved, before the photo is read; the photo is read only on a
 * live site inside that scope, and the transactional write repeats that binding.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module` and `@/lib/auth/checklist-site` are real.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    company: { findUnique: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findFirst: vi.fn() },
    sitePhoto: { findFirst: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const actions = await import('@/actions/checklists')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', deletedAt: null, assignedEngineerId: null, engineerId: null },
  { id: 'site_dead', companyId: 'company_1', deletedAt: new Date('2026-01-01'), assignedEngineerId: null, engineerId: null },
  { id: 'site_other', companyId: 'company_2', deletedAt: null, assignedEngineerId: null, engineerId: null },
]

const PHOTOS: Row[] = [
  { id: 'photo_1', companyId: 'company_1', siteId: 'site_1', taskId: null, approvedForClient: false, approvedById: null },
  { id: 'photo_dead', companyId: 'company_1', siteId: 'site_dead', taskId: null, approvedForClient: false, approvedById: null },
  { id: 'photo_foreign', companyId: 'company_2', siteId: 'site_other', taskId: null, approvedForClient: false, approvedById: null },
]

function relation(row: Row, key: string) {
  if (key === 'site' && 'siteId' in row) return SITES.find((site) => site.id === row.siteId) ?? null
  return undefined
}

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

const MODERATIONS = [
  ['approvePhotoAction', (id: string) => actions.approvePhotoAction(id)],
  ['rejectPhotoAction', (id: string) => actions.rejectPhotoAction(id)],
] as const

let modules: unknown

function expectNoPhotoReadOrWrite() {
  expect(mocks.prisma.sitePhoto.findFirst).not.toHaveBeenCalled()
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  expect(mocks.prisma.sitePhoto.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
  expect(mocks.revalidatePath).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['SITES', 'TASKS']
  mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER'))
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  // Field roles are assigned to no site in this company.
  mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: [] })
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)
  const photos = inMemoryDelegate(PHOTOS, relation)
  mocks.prisma.sitePhoto.findFirst.mockImplementation(async (args: { where: Row }) => {
    const row = await photos.findFirst(args)
    return row ? { ...row, site: { companyId: SITES.find((site) => site.id === row.siteId)!.companyId }, task: null } : null
  })
  mocks.prisma.sitePhoto.updateMany.mockImplementation(photos.updateMany)
  mocks.prisma.auditLog.create.mockResolvedValue({ id: 'audit_1' })
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.prisma) => unknown) => fn(mocks.prisma))
})

describe.each(MODERATIONS)('%s: gate before any photo read', (_name, moderate) => {
  it('refuses a revoked principal', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Account is inactive'))
    await expect(moderate('photo_1')).rejects.toThrow(/UNAUTHORIZED/)
    expectNoPhotoReadOrWrite()
  })

  it.each(['SITE_ENGINEER', 'SUPERVISOR'])('refuses a field %s on a site it is not assigned to', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(moderate('photo_1')).rejects.toThrow(/requires tasks\.manage/)
    expect(mocks.prisma.company.findUnique).not.toHaveBeenCalled()
    expectNoPhotoReadOrWrite()
  })

  it.each(['CLIENT', 'ACCOUNTANT', 'PURCHASE_MANAGER', 'VENDOR', 'SUBCONTRACTOR'])('refuses live %s', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(moderate('photo_1')).rejects.toThrow(/requires tasks\.manage/)
    expectNoPhotoReadOrWrite()
  })

  it('refuses a manager when the TASKS module is disabled', async () => {
    modules = ['SITES']
    await expect(moderate('photo_1')).rejects.toThrow(/Module TASKS is not enabled/)
    expectNoPhotoReadOrWrite()
  })

  it('refuses a manager of a suspended company', async () => {
    mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: modules, status: 'SUSPENDED' })
    await expect(moderate('photo_1')).rejects.toThrow(/suspended/)
    expectNoPhotoReadOrWrite()
  })

  it.each([
    ['a non-string id', 42],
    ['an empty id', ''],
    ['an over-long id', 'p'.repeat(65)],
  ])('refuses %s without reading', async (_label, photoId) => {
    await expect(moderate(photoId as string)).rejects.toThrow(/Site photo not found or access denied/)
    expectNoPhotoReadOrWrite()
  })
})

describe.each(MODERATIONS)('%s: scoped photo binding', (name, moderate) => {
  it.each(['photo_dead', 'photo_foreign', 'missing'])('refuses %s without writing', async (photoId) => {
    await expect(moderate(photoId)).rejects.toThrow(/Site photo not found or access denied/)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.prisma.sitePhoto.updateMany).not.toHaveBeenCalled()
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
  })

  it('reads and writes the photo only on a live site of the caller scope, auditing in the transaction', async () => {
    await expect(moderate('photo_1')).resolves.toEqual({ success: true })

    const scopedSite = { companyId: 'company_1', deletedAt: null }
    expect(mocks.prisma.sitePhoto.findFirst.mock.calls[0][0].where).toEqual({ id: 'photo_1', companyId: 'company_1', site: scopedSite })
    expect(mocks.prisma.sitePhoto.updateMany.mock.calls[0][0].where).toEqual({
      id: 'photo_1', companyId: 'company_1', siteId: 'site_1', site: scopedSite,
    })
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user_project_manager',
        companyId: 'company_1',
        module: 'SITE_PHOTO',
        action: name === 'approvePhotoAction' ? 'APPROVE' : 'REJECT',
        recordId: 'photo_1',
      }),
    })
  })
})
