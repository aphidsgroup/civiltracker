import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  prisma: { site: { findMany: vi.fn(), findFirst: vi.fn() } },
}))

vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))

const { getClientPortalSites, getClientPortalSite } = await import('@/lib/auth/client-portal')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({ id: 'client_user_1', role: 'CLIENT' })
})

describe('client portal site resolution', () => {
  it('loads only sites explicitly assigned to the authenticated client user', async () => {
    mocks.prisma.site.findMany.mockResolvedValue([])

    await getClientPortalSites()

    expect(mocks.prisma.site.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        clientUserId: 'client_user_1',
        deletedAt: null,
        company: { deletedAt: null, status: { notIn: ['SUSPENDED', 'CANCELLED'] } },
      }),
    }))
  })

  it('rejects a non-client role before querying client sites', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'employee_1', role: 'SITE_ENGINEER', companyId: 'company_1' })

    await expect(getClientPortalSites()).rejects.toThrow(/client portal access required/i)
    expect(mocks.prisma.site.findMany).not.toHaveBeenCalled()
  })

  it('scopes a requested portal site to the authenticated client user', async () => {
    mocks.prisma.site.findFirst.mockResolvedValue(null)

    await getClientPortalSite('site_1')

    expect(mocks.prisma.site.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'site_1', clientUserId: 'client_user_1', deletedAt: null }),
    }))
  })
})
