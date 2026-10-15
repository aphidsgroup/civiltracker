import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn() },
    companyMember: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))

const { requireUser } = await import('@/lib/auth/require-user')

const sessionUser = {
  id: 'user_1',
  email: 'engineer@acme.test',
  name: 'Engineer',
  role: 'SITE_ENGINEER',
  companyId: 'company_1',
  companySlug: 'acme',
  companyName: 'Acme Constructions',
}

function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_1',
    email: 'engineer@acme.test',
    name: 'Engineer',
    role: 'SITE_ENGINEER',
    isActive: true,
    companyMembers: [{
      companyId: 'company_1',
      role: 'SITE_ENGINEER',
      moduleControls: ['/mobile'],
      company: { slug: 'acme', name: 'Acme Constructions', status: 'ACTIVE', deletedAt: null },
    }],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ user: sessionUser })
  mocks.prisma.user.findUnique.mockResolvedValue(activeUser())
  mocks.prisma.companyMember.findFirst.mockResolvedValue(activeUser().companyMembers[0])
})

describe('requireUser: live principal validation', () => {
  it('queries only the JWT-selected active membership', async () => {
    await requireUser()

    expect(mocks.prisma.companyMember.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user_1', companyId: 'company_1', isActive: true },
    }))
  })

  it('rejects a non-super-admin JWT without an explicit tenant context before querying membership', async () => {
    mocks.auth.mockResolvedValue({ user: { ...sessionUser, companyId: undefined } })

    await expect(requireUser()).rejects.toThrow(/company context required/i)
    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated request', async () => {
    mocks.auth.mockResolvedValue(null)
    await expect(requireUser()).rejects.toThrow(/authentication required/i)
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('rejects a stale JWT after the User has been deactivated', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(activeUser({ isActive: false }))
    await expect(requireUser()).rejects.toThrow(/account is inactive/i)
  })

  it('rejects a stale JWT after the CompanyMember access is removed or deactivated', async () => {
    mocks.prisma.companyMember.findFirst.mockResolvedValue(null)
    await expect(requireUser()).rejects.toThrow(/active company membership/i)
  })

  it('rejects a stale JWT when the company is suspended, cancelled, or soft-deleted', async () => {
    for (const company of [
      { slug: 'acme', name: 'Acme', status: 'SUSPENDED', deletedAt: null },
      { slug: 'acme', name: 'Acme', status: 'CANCELLED', deletedAt: null },
      { slug: 'acme', name: 'Acme', status: 'ACTIVE', deletedAt: new Date() },
    ]) {
      mocks.prisma.companyMember.findFirst.mockResolvedValue({ companyId: 'company_1', role: 'SITE_ENGINEER', moduleControls: null, company })
      await expect(requireUser()).rejects.toThrow(/company access is inactive/i)
    }
  })

  it('uses the current database membership role rather than a stale JWT role', async () => {
    mocks.auth.mockResolvedValue({ user: { ...sessionUser, role: 'COMPANY_ADMIN' } })
    await expect(requireUser()).resolves.toMatchObject({ role: 'SITE_ENGINEER', companyId: 'company_1' })
  })

  it('rejects a JWT SUPER_ADMIN claim when the database user has been demoted without a tenant context', async () => {
    mocks.auth.mockResolvedValue({ user: { ...sessionUser, role: 'SUPER_ADMIN', companyId: undefined } })
    mocks.prisma.user.findUnique.mockResolvedValue(activeUser({ role: 'SITE_ENGINEER' }))

    await expect(requireUser()).rejects.toThrow(/company context required/i)
  })

  it('allows an active SUPER_ADMIN without a company membership', async () => {
    mocks.auth.mockResolvedValue({ user: { ...sessionUser, role: 'SUPER_ADMIN', companyId: undefined } })
    mocks.prisma.user.findUnique.mockResolvedValue(activeUser({ role: 'SUPER_ADMIN', companyMembers: [] }))
    await expect(requireUser()).resolves.toMatchObject({ id: 'user_1', role: 'SUPER_ADMIN' })
  })
})
