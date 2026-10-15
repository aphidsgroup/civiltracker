import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireUser: vi.fn(),
  prisma: {},
  cloudinary: { uploader: { upload: vi.fn() } },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/cloudinary', () => ({
  default: mocks.cloudinary,
  getCloudinaryFolder: vi.fn(),
}))

const { POST } = await import('@/app/api/upload/route')

describe('POST /api/upload authorization', () => {
  it('rejects a stale JWT from a removed member before parsing an upload', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'removed-user', companyId: 'company_1' } })
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    const response = await POST(new Request('http://localhost/api/upload', { method: 'POST' }))

    expect(response.status).toBe(401)
    expect(mocks.cloudinary.uploader.upload).not.toHaveBeenCalled()
  })
})
