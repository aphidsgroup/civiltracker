import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireChecklistSite: vi.fn(),
  requireChecklistTask: vi.fn(),
  requireAssignedSiteMutation: vi.fn(),
  prisma: {
    projectChecklist: { findFirst: vi.fn(), create: vi.fn() },
    checklistTemplate: { findFirst: vi.fn() },
    projectChecklistTask: { findFirst: vi.fn(), update: vi.fn() },
    mediaAsset: { findFirst: vi.fn() },
    sitePhoto: { findFirst: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth/checklist-site', () => ({
  requireChecklistSite: mocks.requireChecklistSite,
  requireChecklistTask: mocks.requireChecklistTask,
}))
vi.mock('@/lib/auth/site-mutation', () => ({ requireAssignedSiteMutation: mocks.requireAssignedSiteMutation }))
vi.mock('@/lib/prisma', () => ({ default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: vi.fn() }))

const actions = await import('@/actions/checklists')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireChecklistSite.mockResolvedValue({ user: { id: 'user_1', companyId: 'company_1' }, site: { id: 'site_1', companyId: 'company_1' } })
  mocks.requireChecklistTask.mockResolvedValue({ user: { id: 'user_1', companyId: 'company_1' }, site: { id: 'site_1', companyId: 'company_1' }, task: { id: 'task_1', name: 'Task' } })
  mocks.prisma.projectChecklist.findFirst.mockResolvedValue(null)
  mocks.prisma.checklistTemplate.findFirst.mockResolvedValue({ id: 'template_1', stages: [] })
  mocks.prisma.projectChecklistTask.findFirst.mockResolvedValue({ id: 'task_1', name: 'Task' })
  mocks.prisma.auditLog.findMany.mockResolvedValue([])
  mocks.requireAssignedSiteMutation.mockResolvedValue({ user: { id: 'user_1', companyId: 'company_1' }, site: { id: 'site_1', companyId: 'company_1' } })
  mocks.prisma.mediaAsset.findFirst.mockResolvedValue({ secureUrl: 'https://res.cloudinary.com/demo/x.jpg', cloudinaryPublicId: 'x' })
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.prisma) => unknown) => fn(mocks.prisma))
})

describe('project checklist tenant authorization', () => {
  it('binds checklist enablement to a live authorized site and tenant-owned template', async () => {
    await actions.enableChecklistForProject('site_1', 'template_1')
    expect(mocks.requireChecklistSite).toHaveBeenCalledWith('site_1', 'manage')
    expect(mocks.prisma.checklistTemplate.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'template_1', OR: [{ companyId: 'company_1' }, { isGlobal: true }] },
    }))
  })

  it('scopes pending task reads to a live verified site and company', async () => {
    await actions.getPendingTasks('site_1')
    expect(mocks.requireChecklistSite).toHaveBeenCalledWith('site_1')
    expect(mocks.prisma.projectChecklist.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { siteId: 'site_1', companyId: 'company_1' },
    }))
  })

  it('rejects a task not linked to the authorized site before status mutation', async () => {
    mocks.requireChecklistTask.mockRejectedValue(new Error('FORBIDDEN: Checklist task not found or access denied'))
    await expect(actions.toggleTaskStatus('site_1', 'foreign_task', 'COMPLETED')).rejects.toThrow(/access denied/i)
    expect(mocks.prisma.projectChecklistTask.update).not.toHaveBeenCalled()
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
  })

  it('scopes audit cleanup to the verified site and tenant', async () => {
    await actions.toggleTaskStatus('site_1', 'task_1', 'PENDING')
    expect(mocks.prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { module: 'CHECKLIST', recordId: 'site_1', companyId: 'company_1' },
    }))
  })

  it('rejects a photo task not linked to the authorized site before creation', async () => {
    mocks.prisma.projectChecklistTask.findFirst.mockResolvedValue(null)
    await expect(actions.uploadChecklistPhotoAction('foreign_task', 'site_1', 'asset_1')).rejects.toThrow(/access denied/i)
    expect(mocks.prisma.projectChecklistTask.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'foreign_task', category: { stage: { checklist: { siteId: 'site_1', companyId: 'company_1' } } } },
    }))
    expect(mocks.prisma.mediaAsset.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
  })
})
