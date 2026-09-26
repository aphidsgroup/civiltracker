import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  prisma: {
    site: { findFirst: vi.fn() },
    projectChecklistTask: { findFirst: vi.fn() },
    sitePhoto: { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ default: mocks.prisma }))

const { requireChecklistSite, requireChecklistTask, requireChecklistPhoto } = await import('@/lib/auth/checklist-site')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({ id: 'user_1', role: 'COMPANY_ADMIN', companyId: 'company_1' })
  mocks.prisma.site.findFirst.mockResolvedValue({ id: 'site_1', companyId: 'company_1' })
  mocks.prisma.projectChecklistTask.findFirst.mockResolvedValue({ id: 'task_1', name: 'Task' })
  mocks.prisma.sitePhoto.findFirst.mockResolvedValue({
    id: 'photo_1', siteId: 'site_1', companyId: 'company_1',
    site: { companyId: 'company_1' },
    task: { category: { stage: { checklist: { siteId: 'site_1', companyId: 'company_1' } } } },
  })
})

describe('checklist site resolver', () => {
  it('requires an exact active site in the live caller company', async () => {
    await requireChecklistSite('site_1')
    expect(mocks.prisma.site.findFirst).toHaveBeenCalledWith({
      where: { id: 'site_1', deletedAt: null, companyId: 'company_1' },
      select: { id: true, companyId: true },
    })
  })

  it('binds a client caller to their exact assigned site', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'client_1', role: 'CLIENT', companyId: 'company_1' })
    await requireChecklistSite('site_1')
    expect(mocks.prisma.site.findFirst).toHaveBeenCalledWith({
      where: { id: 'site_1', deletedAt: null, companyId: 'company_1', clientUserId: 'client_1' },
      select: { id: true, companyId: true },
    })
  })

  it('binds a task through its checklist to the verified site and company', async () => {
    await requireChecklistTask('site_1', 'task_1')
    expect(mocks.prisma.projectChecklistTask.findFirst).toHaveBeenCalledWith({
      where: { id: 'task_1', category: { stage: { checklist: { siteId: 'site_1', companyId: 'company_1' } } } },
      select: { id: true, name: true },
    })
  })

  it('requires a manager and rejects a checklist-linked photo with a mismatched task path', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'client_1', role: 'CLIENT', companyId: 'company_1' })
    await expect(requireChecklistPhoto('photo_1')).rejects.toThrow(/authorized manager/i)

    mocks.requireUser.mockResolvedValue({ id: 'manager_1', role: 'COMPANY_ADMIN', companyId: 'company_1' })
    mocks.prisma.sitePhoto.findFirst.mockResolvedValue({
      id: 'bad_photo', siteId: 'site_1', companyId: 'company_1',
      site: { companyId: 'company_1' },
      task: { category: { stage: { checklist: { siteId: 'foreign_site', companyId: 'company_2' } } } },
    })
    await expect(requireChecklistPhoto('bad_photo')).rejects.toThrow(/not linked to its site/i)
  })
})
