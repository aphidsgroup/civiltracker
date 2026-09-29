import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for checklist reads that checked the site scope but no read grant or module.
 *
 * `getPendingTasks` and `getPendingChecklistPhotos` went through `requireChecklistSite` /
 * `listChecklistSites` with no mutation, so the principal gate was skipped: a VENDOR (or
 * any live company member) read pending tasks of every company site, the TASKS module was
 * never consulted, and a CLIENT was bound to its site even after its company was suspended.
 *
 * Now every checklist read needs `tasks.manage`, `dpr.view` or `clientPortal.view` on the
 * live role and TASKS on the live company before any site is read; field roles stay on
 * their assigned live sites and a CLIENT on the exact live sites assigned to it while its
 * company is active.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module`, `@/lib/auth/site-mutation`,
 * `@/lib/auth/client-portal` and `@/lib/auth/checklist-site` are real.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  prisma: {
    company: { findUnique: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findFirst: vi.fn(), findMany: vi.fn() },
    projectChecklist: { findFirst: vi.fn() },
    projectChecklistTask: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { getPendingTasks, getPendingChecklistPhotos } = await import('@/actions/checklists')

const SITES: Row[] = [
  { id: 'site_mine', companyId: 'company_1', deletedAt: null, assignedEngineerId: 'user_site_engineer', engineerId: null, clientUserId: 'user_client' },
  { id: 'site_listed', companyId: 'company_1', deletedAt: null, assignedEngineerId: null, engineerId: null, clientUserId: null },
  { id: 'site_theirs', companyId: 'company_1', deletedAt: null, assignedEngineerId: 'user_other', engineerId: null, clientUserId: 'user_other_client' },
  { id: 'site_dead', companyId: 'company_1', deletedAt: new Date('2026-01-01'), assignedEngineerId: 'user_site_engineer', engineerId: null, clientUserId: 'user_client' },
  { id: 'site_foreign', companyId: 'company_2', deletedAt: null, assignedEngineerId: 'user_site_engineer', engineerId: null, clientUserId: 'user_client' },
]

let modules: unknown
let companyStatus: string

function principal(role: string) {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId: 'company_1' }
}

function checklistReads() {
  return mocks.prisma.projectChecklist.findFirst.mock.calls.length + mocks.prisma.projectChecklistTask.findMany.mock.calls.length
}

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['SITES', 'TASKS']
  companyStatus = 'ACTIVE'
  mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: ['site_listed'] })
  const sites = inMemoryDelegate(SITES, (_row, key) => (key === 'company' ? { deletedAt: null, status: companyStatus } : undefined))
  mocks.prisma.site.findFirst.mockImplementation(sites.findFirst)
  mocks.prisma.site.findMany.mockImplementation(sites.findMany)
  mocks.prisma.projectChecklist.findFirst.mockResolvedValue(null)
  mocks.prisma.projectChecklistTask.findMany.mockResolvedValue([])
})

describe('checklist read grant', () => {
  it.each(['VENDOR', 'SUBCONTRACTOR', 'ACCOUNTANT', 'PURCHASE_MANAGER'])(
    'denies a %s every checklist read before any site or checklist query',
    async (role) => {
      mocks.requireUser.mockResolvedValue(principal(role))
      await expect(getPendingTasks('site_mine')).rejects.toThrow(/FORBIDDEN: Checklist read requires/)
      await expect(getPendingChecklistPhotos('site_mine')).rejects.toThrow(/FORBIDDEN: Checklist read requires/)
      await expect(getPendingChecklistPhotos()).rejects.toThrow(/FORBIDDEN: Checklist read requires/)
      expect(mocks.prisma.company.findUnique).not.toHaveBeenCalled()
      expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
      expect(mocks.prisma.site.findMany).not.toHaveBeenCalled()
      expect(checklistReads()).toBe(0)
    },
  )
})

describe('checklist reads need the TASKS module', () => {
  it.each(['COMPANY_ADMIN', 'PROJECT_MANAGER', 'SITE_ENGINEER', 'SUPERVISOR', 'CLIENT'])(
    'denies a %s direct reads when TASKS is disabled',
    async (role) => {
      mocks.requireUser.mockResolvedValue(principal(role))
      modules = { TASKS: false, SITES: true }
      await expect(getPendingTasks('site_mine')).rejects.toThrow(/Module TASKS is not enabled/)
      await expect(getPendingChecklistPhotos('site_mine')).rejects.toThrow(/Module TASKS is not enabled/)
      await expect(getPendingChecklistPhotos()).rejects.toThrow(/Module TASKS is not enabled/)
      expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
      expect(mocks.prisma.site.findMany).not.toHaveBeenCalled()
      expect(checklistReads()).toBe(0)
    },
  )
})

describe('field roles read only assigned live sites', () => {
  it.each(['SITE_ENGINEER', 'SUPERVISOR'])('limits a %s to its assigned sites', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(getPendingTasks('site_listed')).resolves.toEqual([])
    for (const siteId of ['site_theirs', 'site_dead', 'site_foreign']) {
      await expect(getPendingTasks(siteId)).rejects.toThrow(/FORBIDDEN/)
      await expect(getPendingChecklistPhotos(siteId)).rejects.toThrow(/FORBIDDEN/)
    }
    expect(mocks.prisma.projectChecklist.findFirst).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.projectChecklistTask.findMany).not.toHaveBeenCalled()

    await getPendingChecklistPhotos()
    const where = mocks.prisma.projectChecklistTask.findMany.mock.calls[0][0].where
    const expected = role === 'SITE_ENGINEER' ? ['site_mine', 'site_listed'] : ['site_listed']
    expect(where.category.stage.checklist).toEqual({ companyId: 'company_1', siteId: { in: expected } })
  })
})

describe('clients read only their exact active client sites', () => {
  beforeEach(() => mocks.requireUser.mockResolvedValue(principal('CLIENT')))

  it('reads the site assigned to the client and nothing else', async () => {
    await expect(getPendingTasks('site_mine')).resolves.toEqual([])
    for (const siteId of ['site_listed', 'site_theirs', 'site_dead', 'site_foreign']) {
      await expect(getPendingTasks(siteId)).rejects.toThrow(/FORBIDDEN/)
    }
    expect(mocks.prisma.site.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'site_mine', clientUserId: 'user_client', companyId: 'company_1', deletedAt: null,
        company: { deletedAt: null, status: { notIn: ['SUSPENDED', 'CANCELLED'] } },
      },
    }))

    await getPendingChecklistPhotos()
    const where = mocks.prisma.projectChecklistTask.findMany.mock.calls[0][0].where
    expect(where.category.stage.checklist).toEqual({ companyId: 'company_1', siteId: { in: ['site_mine'] } })
  })

  it('loses its site once the site company is no longer active', async () => {
    companyStatus = 'SUSPENDED'
    await expect(getPendingTasks('site_mine')).rejects.toThrow(/FORBIDDEN/)
    await expect(getPendingChecklistPhotos()).resolves.toEqual([])
    expect(checklistReads()).toBe(0)
  })
})
