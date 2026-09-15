import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireChecklistSite: vi.fn(),
  prisma: { sitePhoto: { create: vi.fn() } },
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/auth/checklist-site', () => ({ requireChecklistSite: mocks.requireChecklistSite }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { uploadMobileSitePhotoAction } = await import('@/actions/mobile-photo')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireChecklistSite.mockResolvedValue({ user: { id: 'user_1' }, site: { id: 'site_1', companyId: 'company_1' } })
})

describe('uploadMobileSitePhotoAction', () => {
  it('rejects an unauthorized site before creating photo metadata', async () => {
    mocks.requireChecklistSite.mockRejectedValue(new Error('FORBIDDEN: Site not found or access denied'))
    await expect(uploadMobileSitePhotoAction({ siteId: 'foreign_site', imageUrl: 'https://example.test/photo', caption: '', gps: '' })).rejects.toThrow(/access denied/i)
    expect(mocks.prisma.sitePhoto.create).not.toHaveBeenCalled()
  })

  it('derives the site and company only from the verified resolver', async () => {
    await uploadMobileSitePhotoAction({ siteId: 'site_1', imageUrl: 'https://example.test/photo', caption: '', gps: '' })
    expect(mocks.requireChecklistSite).toHaveBeenCalledWith('site_1')
    expect(mocks.prisma.sitePhoto.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ siteId: 'site_1', companyId: 'company_1', uploadedById: 'user_1' }),
    }))
  })
})
