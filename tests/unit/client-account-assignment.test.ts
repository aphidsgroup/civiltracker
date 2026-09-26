import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const tx = {
    user: { create: vi.fn() },
    companyMember: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    site: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  const prisma = {
    company: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    companyMember: { findUnique: vi.fn() },
    site: { findMany: vi.fn() },
    $transaction: vi.fn(),
  }
  return { tx, prisma, requirePermission: vi.fn(), requireUser: vi.fn(), revalidatePath: vi.fn(), redirect: vi.fn() }
})

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/audit', () => ({ logActivity: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/link', () => ({ default: () => null }))

const { createClientUser, assignClientSites } = await import('@/app/(dashboard)/client-accounts/page')

const companyId = 'company_1'
const actor = { id: 'admin_1', name: 'Admin', email: 'admin@example.test', role: 'COMPANY_ADMIN', companyId }

function form(values: Record<string, string | string[]>) {
  const result = new FormData()
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) result.append(key, item)
  }
  return result
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(actor)
  mocks.requireUser.mockResolvedValue(actor)
  mocks.prisma.company.findUnique.mockResolvedValue({ id: companyId, userLimit: 10, _count: { members: 1 } })
  mocks.prisma.user.findUnique.mockResolvedValue(null)
  mocks.prisma.site.findMany.mockResolvedValue([{ id: 'site_1' }])
  mocks.tx.user.create.mockResolvedValue({ id: 'client_1' })
  mocks.tx.site.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.$transaction.mockImplementation(async (callback: (client: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx))
})

describe('client account site assignments', () => {
  it('rejects missing site access before creating a client user', async () => {
    await expect(createClientUser(form({ name: 'Client', email: 'client@example.test', password: 'secure-password' }))).rejects.toThrow(/select at least one/i)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('creates client membership and exact Site.clientUserId allow-list atomically', async () => {
    await createClientUser(form({ name: 'Client', email: 'client@example.test', password: 'secure-password', siteIds: ['site_1'] }))
    expect(mocks.prisma.site.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['site_1'] }, companyId, deletedAt: null, status: 'ACTIVE' },
    }))
    expect(mocks.tx.companyMember.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'client_1', companyId, role: 'CLIENT', siteIds: ['site_1'] }),
    }))
    expect(mocks.tx.site.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: { in: ['site_1'] }, companyId, deletedAt: null, status: 'ACTIVE',
        OR: [{ clientUserId: null }, { clientUserId: 'client_1' }],
      },
      data: { clientUserId: 'client_1' },
    }))
  })

  it('aborts when the transactional site assignment affects fewer sites than validated', async () => {
    mocks.tx.site.updateMany.mockResolvedValue({ count: 0 })
    await expect(createClientUser(form({ name: 'Client', email: 'client@example.test', password: 'secure-password', siteIds: ['site_1'] }))).rejects.toThrow(/changed before client access/i)
  })

  it('rejects an attempt to take a site already assigned to another client', async () => {
    mocks.tx.site.updateMany.mockResolvedValue({ count: 0 })
    await expect(createClientUser(form({ name: 'Client', email: 'client@example.test', password: 'secure-password', siteIds: ['site_1'] }))).rejects.toThrow(/changed before client access/i)
    expect(mocks.tx.site.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: [{ clientUserId: null }, { clientUserId: 'client_1' }] }),
    }))
  })

  it('clears prior assignments then atomically writes the selected active company sites', async () => {
    mocks.prisma.companyMember.findUnique.mockResolvedValue({
      id: 'member_1', userId: 'client_1', companyId, role: 'CLIENT', isActive: true, siteIds: ['old_site'],
      user: { id: 'client_1', name: 'Client', email: 'client@example.test' },
    })
    await assignClientSites(form({ memberId: 'member_1', siteIds: ['site_1'] }))
    expect(mocks.tx.site.updateMany).toHaveBeenNthCalledWith(1, { where: { companyId, clientUserId: 'client_1' }, data: { clientUserId: null } })
    expect(mocks.tx.site.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: { clientUserId: 'client_1' } }))
    expect(mocks.tx.companyMember.update).toHaveBeenCalledWith(expect.objectContaining({ data: { siteIds: ['site_1'] } }))
  })
})
