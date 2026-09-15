import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireChecklistSite: vi.fn(),
  requireChecklistCategory: vi.fn(),
  requireChecklistTask: vi.fn(),
  requireProjectChecklist: vi.fn(),
  requireChecklistPhoto: vi.fn(),
  prisma: {
    projectChecklistCategory: { findFirst: vi.fn(), update: vi.fn() },
    projectChecklistTask: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    projectChecklist: { findFirst: vi.fn(), delete: vi.fn() },
    sitePhoto: { findFirst: vi.fn(), update: vi.fn() },
  },
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/auth/checklist-site', () => ({
  requireChecklistSite: mocks.requireChecklistSite,
  requireChecklistCategory: mocks.requireChecklistCategory,
  requireChecklistTask: mocks.requireChecklistTask,
  requireProjectChecklist: mocks.requireProjectChecklist,
  requireChecklistPhoto: mocks.requireChecklistPhoto,
}))
vi.mock('@/lib/prisma', () => ({ default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: vi.fn() }))

const actions = await import('@/actions/checklists')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireChecklistSite.mockResolvedValue({ user: { id: 'user_1', companyId: 'company_1' }, site: { id: 'site_1', companyId: 'company_1' } })
  const denied = new Error('FORBIDDEN: Checklist target not found or access denied')
  mocks.requireChecklistCategory.mockRejectedValue(denied)
  mocks.requireChecklistTask.mockRejectedValue(denied)
  mocks.requireProjectChecklist.mockRejectedValue(denied)
  mocks.requireChecklistPhoto.mockRejectedValue(denied)
  mocks.prisma.projectChecklistCategory.findFirst.mockResolvedValue(null)
  mocks.prisma.projectChecklistTask.findFirst.mockResolvedValue(null)
  mocks.prisma.projectChecklist.findFirst.mockResolvedValue(null)
  mocks.prisma.sitePhoto.findFirst.mockResolvedValue(null)
})

describe('remaining project checklist tenant authorization', () => {
  it.each([
    ['toggleCategoryNeglect', () => actions.toggleCategoryNeglect('site_1', 'foreign_category', true), () => mocks.prisma.projectChecklistCategory.update],
    ['addCustomTask', () => actions.addCustomTask('site_1', 'foreign_category', 'Task'), () => mocks.prisma.projectChecklistTask.create],
    ['editChecklistTask', () => actions.editChecklistTask('site_1', 'foreign_task', 'Name'), () => mocks.prisma.projectChecklistTask.update],
    ['deleteChecklistTask', () => actions.deleteChecklistTask('site_1', 'foreign_task'), () => mocks.prisma.projectChecklistTask.delete],
    ['deleteProjectChecklist', () => actions.deleteProjectChecklist('site_1'), () => mocks.prisma.projectChecklist.delete],
    ['approvePhotoAction', () => actions.approvePhotoAction('foreign_photo'), () => mocks.prisma.sitePhoto.update],
    ['rejectPhotoAction', () => actions.rejectPhotoAction('foreign_photo'), () => mocks.prisma.sitePhoto.update],
  ])('%s rejects a foreign target before mutation', async (_name, invoke, mutation) => {
    await expect(invoke()).rejects.toThrow(/access denied/i)
    expect(mutation()).not.toHaveBeenCalled()
  })
})
