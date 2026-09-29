import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression for `removeClientAccount` deactivating arbitrary company members.
 *
 * The action looked the member up by id within the company and deactivated it without
 * checking its role, so any company.manage holder could deactivate a peer COMPANY_ADMIN,
 * an employee, or themselves from the client-accounts screen, and a deactivated client
 * kept every `Site.clientUserId` pointer to its login.
 *
 * Now the target must be an active CLIENT in the actor's live company, never the actor,
 * and within the actor's role hierarchy. The deactivation is a guarded updateMany that
 * must hit exactly one row, and the site pointers and mandatory audit record are written
 * in the same transaction, so any failure rolls everything back.
 */
type Row = Record<string, unknown>
type Store = {
  members: Record<string, Row>
  users: Record<string, Row>
  sites: Record<string, Row>
  audit: Row[]
}

const mocks = vi.hoisted(() => {
  const tx = {
    companyMember: { update: vi.fn(), updateMany: vi.fn() },
    site: { findMany: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    tx,
    requirePermission: vi.fn(),
    requireUser: vi.fn(),
    logActivity: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`)
    }),
    prisma: {
      companyMember: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      site: { findMany: vi.fn(), updateMany: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(),
    },
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/link', () => ({ default: () => null }))
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn() } }))

const { removeClientAccount } = await import('@/app/(dashboard)/client-accounts/page')

const companyId = 'company_1'
const actor = { id: 'admin_1', name: 'Admin', email: 'admin@example.test', role: 'COMPANY_ADMIN', companyId }

let store: Store

function seed(): Store {
  return {
    users: {
      admin_1: { id: 'admin_1', name: 'Admin', email: 'admin@example.test' },
      admin_2: { id: 'admin_2', name: 'Peer Admin', email: 'peer@example.test' },
      engineer_1: { id: 'engineer_1', name: 'Engineer', email: 'engineer@example.test' },
      client_1: { id: 'client_1', name: 'Client Co', email: 'client@example.test' },
      client_2: { id: 'client_2', name: 'Other Client', email: 'other@example.test' },
      client_x: { id: 'client_x', name: 'Foreign Client', email: 'foreign@example.test' },
    },
    members: {
      member_admin_self: { id: 'member_admin_self', userId: 'admin_1', companyId, role: 'COMPANY_ADMIN', isActive: true, siteIds: [] },
      member_admin_peer: { id: 'member_admin_peer', userId: 'admin_2', companyId, role: 'COMPANY_ADMIN', isActive: true, siteIds: [] },
      member_engineer: { id: 'member_engineer', userId: 'engineer_1', companyId, role: 'SITE_ENGINEER', isActive: true, siteIds: ['site_1'] },
      member_client: { id: 'member_client', userId: 'client_1', companyId, role: 'CLIENT', isActive: true, siteIds: ['site_1', 'site_2'] },
      member_client_other: { id: 'member_client_other', userId: 'client_2', companyId, role: 'CLIENT', isActive: true, siteIds: ['site_3'] },
      member_client_foreign: { id: 'member_client_foreign', userId: 'client_x', companyId: 'company_2', role: 'CLIENT', isActive: true, siteIds: [] },
    },
    sites: {
      site_1: { id: 'site_1', companyId, clientUserId: 'client_1' },
      site_2: { id: 'site_2', companyId, clientUserId: 'client_1' },
      site_3: { id: 'site_3', companyId, clientUserId: 'client_2' },
      site_4: { id: 'site_4', companyId, clientUserId: null },
      // Same user id pointer in another tenant must never be touched by this company.
      site_foreign: { id: 'site_foreign', companyId: 'company_2', clientUserId: 'client_1' },
    },
    audit: [],
  }
}

function removeForm(memberId: string, typed: string) {
  const result = new FormData()
  result.append('memberId', memberId)
  result.append('dangerConfirmText', typed)
  return result
}

function nameOf(memberId: string) {
  const member = store.members[memberId]
  return String(store.users[member.userId as string].name)
}

beforeEach(() => {
  vi.clearAllMocks()
  store = seed()
  mocks.requirePermission.mockResolvedValue(actor)
  mocks.requireUser.mockResolvedValue(actor)

  mocks.prisma.companyMember.findUnique.mockImplementation(async ({ where }: { where: { id: string; companyId?: string } }) => {
    const row = store.members[where.id]
    if (!row || (where.companyId && row.companyId !== where.companyId)) return null
    return { ...structuredClone(row), user: structuredClone(store.users[row.userId as string]) }
  })
  mocks.tx.companyMember.updateMany.mockImplementation(async ({ where, data }: { where: Row; data: Row }) => {
    const row = store.members[where.id as string]
    const matches = Boolean(row) && Object.entries(where).every(([key, value]) => row[key] === value)
    if (matches) Object.assign(row, data)
    return { count: matches ? 1 : 0 }
  })
  mocks.tx.site.findMany.mockImplementation(async ({ where }: { where: { companyId: string; clientUserId: string } }) =>
    Object.values(store.sites)
      .filter(site => site.companyId === where.companyId && site.clientUserId === where.clientUserId)
      .map(site => ({ id: site.id })))
  mocks.tx.site.updateMany.mockImplementation(async ({ where, data }: { where: { id: { in: string[] }; companyId: string; clientUserId: string }; data: Row }) => {
    let count = 0
    for (const id of where.id.in) {
      const site = store.sites[id]
      if (site && site.companyId === where.companyId && site.clientUserId === where.clientUserId) {
        Object.assign(site, data)
        count += 1
      }
    }
    return { count }
  })
  mocks.tx.auditLog.create.mockImplementation(async ({ data }: { data: Row }) => {
    store.audit.push(data)
    return data
  })
  // An interactive transaction: every tx write is undone when the callback rejects.
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => {
    const snapshot = structuredClone(store)
    try {
      return await fn(mocks.tx)
    } catch (error) {
      store = snapshot
      throw error
    }
  })
})

function noBareWrites() {
  expect(mocks.prisma.companyMember.update).not.toHaveBeenCalled()
  expect(mocks.prisma.companyMember.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.site.updateMany).not.toHaveBeenCalled()
  expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled()
  expect(mocks.tx.companyMember.update).not.toHaveBeenCalled()
  expect(mocks.logActivity).not.toHaveBeenCalled()
}

function expectUntouched() {
  expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  expect(store).toEqual(seed())
  expect(mocks.revalidatePath).not.toHaveBeenCalled()
  noBareWrites()
}

describe('removeClientAccount: target authorization', () => {
  it('refuses to deactivate a peer company admin, even with the exact confirmation text', async () => {
    await expect(removeClientAccount(removeForm('member_admin_peer', nameOf('member_admin_peer'))))
      .rejects.toThrow(/client account not found/i)
    expectUntouched()
  })

  it('refuses to deactivate a non-client employee', async () => {
    await expect(removeClientAccount(removeForm('member_engineer', nameOf('member_engineer'))))
      .rejects.toThrow(/client account not found/i)
    expectUntouched()
  })

  it('refuses to deactivate the acting admin', async () => {
    await expect(removeClientAccount(removeForm('member_admin_self', nameOf('member_admin_self'))))
      .rejects.toThrow(/client account not found/i)
    expectUntouched()
  })

  it('refuses self-deactivation even if the actor holds a CLIENT membership row', async () => {
    store.members.member_client.userId = 'admin_1'
    store.users.admin_1.name = 'Client Co'
    const before = structuredClone(store)

    await expect(removeClientAccount(removeForm('member_client', 'Client Co'))).rejects.toThrow(/your own login/i)

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(store).toEqual(before)
    noBareWrites()
  })

  it('obeys the role hierarchy for the live actor role', async () => {
    mocks.requirePermission.mockResolvedValue({ ...actor, role: 'CLIENT' })

    await expect(removeClientAccount(removeForm('member_client', 'Client Co'))).rejects.toThrow(/permission/i)
    expectUntouched()
  })

  it('refuses a client that belongs to another company', async () => {
    await expect(removeClientAccount(removeForm('member_client_foreign', 'Foreign Client')))
      .rejects.toThrow(/client account not found/i)
    expect(mocks.prisma.companyMember.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'member_client_foreign', companyId },
    }))
    expectUntouched()
  })

  it('refuses a missing or malformed member id', async () => {
    const empty = new FormData()
    empty.append('dangerConfirmText', 'Client Co')
    await expect(removeClientAccount(empty)).rejects.toThrow(/client account not found/i)
    expect(mocks.prisma.companyMember.findUnique).not.toHaveBeenCalled()
    expectUntouched()
  })

  it('keeps the company.manage gate on the live principal', async () => {
    mocks.requirePermission.mockRejectedValue(new Error('FORBIDDEN: Missing required permission "company.manage"'))

    await expect(removeClientAccount(removeForm('member_client', 'Client Co'))).rejects.toThrow(/FORBIDDEN/)
    expect(mocks.requirePermission).toHaveBeenCalledWith('company.manage')
    expect(mocks.prisma.companyMember.findUnique).not.toHaveBeenCalled()
    expectUntouched()
  })
})

describe('removeClientAccount: stale, retry and race safety', () => {
  it('treats a retry on an already inactive client as a no-op with no audit', async () => {
    store.members.member_client.isActive = false
    const before = structuredClone(store)

    await removeClientAccount(removeForm('member_client', 'Client Co'))

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(store).toEqual(before)
    expect(store.audit).toEqual([])
    noBareWrites()
  })

  it('fails and rolls back when the client is deactivated concurrently', async () => {
    mocks.tx.companyMember.updateMany.mockResolvedValueOnce({ count: 0 })

    await expect(removeClientAccount(removeForm('member_client', 'Client Co'))).rejects.toThrow(/changed before/i)

    expect(mocks.tx.site.updateMany).not.toHaveBeenCalled()
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
    expect(store).toEqual(seed())
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('fails and rolls back when the member was promoted out of CLIENT after the read', async () => {
    const realFindUnique = mocks.prisma.companyMember.findUnique.getMockImplementation()!
    mocks.prisma.companyMember.findUnique.mockImplementationOnce(async args => {
      const snapshot = await realFindUnique(args)
      store.members.member_client.role = 'COMPANY_ADMIN'
      return snapshot
    })

    await expect(removeClientAccount(removeForm('member_client', 'Client Co'))).rejects.toThrow(/changed before/i)

    expect(store.members.member_client).toMatchObject({ role: 'COMPANY_ADMIN', isActive: true })
    expect(store.sites.site_1.clientUserId).toBe('client_1')
    expect(store.audit).toEqual([])
  })

  it('fails and rolls back the deactivation when a site pointer changes mid-transaction', async () => {
    mocks.tx.site.updateMany.mockResolvedValueOnce({ count: 1 })

    await expect(removeClientAccount(removeForm('member_client', 'Client Co'))).rejects.toThrow(/site access changed/i)

    expect(mocks.tx.companyMember.updateMany).toHaveBeenCalledTimes(1)
    expect(store).toEqual(seed())
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('keeps the typed name/email confirmation', async () => {
    await expect(removeClientAccount(removeForm('member_client', 'Someone Else'))).rejects.toThrow(/confirmation/i)
    expectUntouched()
  })
})

describe('removeClientAccount: valid client deactivation', () => {
  it('deactivates the client, clears exactly its own site pointers and audits in one transaction', async () => {
    await removeClientAccount(removeForm('member_client', 'Client Co'))

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.companyMember.updateMany).toHaveBeenCalledWith({
      where: { id: 'member_client', companyId, userId: 'client_1', role: 'CLIENT', isActive: true },
      data: { isActive: false },
    })
    expect(mocks.tx.site.findMany).toHaveBeenCalledWith({
      where: { companyId, clientUserId: 'client_1' },
      select: { id: true },
    })
    expect(mocks.tx.site.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['site_1', 'site_2'] }, companyId, clientUserId: 'client_1' },
      data: { clientUserId: null },
    })

    const expected = seed()
    expected.members.member_client.isActive = false
    expected.sites.site_1.clientUserId = null
    expected.sites.site_2.clientUserId = null
    expect({ ...store, audit: [] }).toEqual(expected)
    // Other clients, unassigned sites and other tenants keep their pointers.
    expect(store.sites.site_3.clientUserId).toBe('client_2')
    expect(store.sites.site_foreign.clientUserId).toBe('client_1')
    expect(store.members.member_admin_peer.isActive).toBe(true)

    expect(store.audit).toEqual([expect.objectContaining({
      companyId, userId: 'admin_1', action: 'UPDATE', module: 'USER', recordId: 'client_1',
      before: expect.objectContaining({ memberId: 'member_client', isActive: true, role: 'CLIENT', clientSiteIds: ['site_1', 'site_2'] }),
      after: expect.objectContaining({ memberId: 'member_client', isActive: false, role: 'CLIENT', clientSiteIds: [] }),
    })])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/client-accounts')
    noBareWrites()
  })

  it('deactivates a client with no site pointers without a site write', async () => {
    store.sites.site_1.clientUserId = null
    store.sites.site_2.clientUserId = null

    await removeClientAccount(removeForm('member_client', 'Client Co'))

    expect(mocks.tx.site.updateMany).not.toHaveBeenCalled()
    expect(store.members.member_client.isActive).toBe(false)
    expect(store.audit).toHaveLength(1)
  })

  it('rolls back the deactivation and site clearing when the audit write fails', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit store down'))

    await expect(removeClientAccount(removeForm('member_client', 'Client Co'))).rejects.toThrow(/audit store down/)

    expect(mocks.tx.companyMember.updateMany).toHaveBeenCalledTimes(1)
    expect(mocks.tx.site.updateMany).toHaveBeenCalledTimes(1)
    expect(store).toEqual(seed())
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    noBareWrites()
  })
})
