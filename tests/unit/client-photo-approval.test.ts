import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  prisma: {
    sitePhoto: { findFirst: vi.fn() },
    projectChecklistTask: { update: vi.fn() },
  },
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { clientApproveTaskPhoto } = await import('@/actions/checklists')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({ id: 'client_1', role: 'CLIENT' })
})

describe('clientApproveTaskPhoto', () => {
  it('requires an approved photo from a site explicitly assigned to the authenticated client', async () => {
    mocks.prisma.sitePhoto.findFirst.mockResolvedValue({ id: 'photo_1', taskId: 'task_1', siteId: 'site_1' })

    await clientApproveTaskPhoto('photo_1')

    expect(mocks.prisma.sitePhoto.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'photo_1',
        approvedForClient: true,
        site: { clientUserId: 'client_1', deletedAt: null },
      }),
    }))
  })

  it('rejects a non-client role before looking up a photo', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'employee_1', role: 'SITE_ENGINEER', companyId: 'company_1' })

    await expect(clientApproveTaskPhoto('photo_1')).rejects.toThrow(/client portal access required/i)
    expect(mocks.prisma.sitePhoto.findFirst).not.toHaveBeenCalled()
  })

  it('does not update a task when the photo is not approved for the client', async () => {
    mocks.prisma.sitePhoto.findFirst.mockResolvedValue(null)

    await expect(clientApproveTaskPhoto('unapproved-photo')).rejects.toThrow(/photo not found or access denied/i)
    expect(mocks.prisma.projectChecklistTask.update).not.toHaveBeenCalled()
  })

  it('does not update a task when the photo is not assigned to the client', async () => {
    mocks.prisma.sitePhoto.findFirst.mockResolvedValue(null)

    await expect(clientApproveTaskPhoto('other-photo')).rejects.toThrow(/photo not found or access denied/i)
    expect(mocks.prisma.projectChecklistTask.update).not.toHaveBeenCalled()
  })
})
