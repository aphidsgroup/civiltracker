import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression for `assignClientSites` racing `removeClientAccount`.
 *
 * The assignment checked the membership was an active CLIENT, then cleared and rewrote the
 * client's `Site.clientUserId` pointers in a separate default-isolation transaction. A
 * removal committing in between deactivated the client and cleared its pointers, and the
 * stale assignment then restored them: a deactivated CLIENT kept portal access to sites.
 *
 * Now both actions run as a SERIALIZABLE transaction retried on `P2034`, and the
 * assignment's first write is a membership update guarded on `role: 'CLIENT'` and
 * `isActive: true`, before any site pointer is touched. These tests drive the two actions
 * through controlled interleavings against a snapshot model of the database in which a
 * transaction updating a row committed after its snapshot is rolled back with `P2034`
 * (PostgreSQL's first-updater-wins rule), and check that no ordering ends with a
 * deactivated or demoted client holding a site pointer, a rewritten allow-list, or an
 * assignment audit record.
 */
type Row = Record<string, unknown>
type Table = 'members' | 'sites'
type Db = Record<Table, Record<string, Row>> & { audit: Row[]; versions: Record<string, number> }
type Interleave = { at: 'beforeSnapshot' | 'afterSnapshot'; run: () => Promise<unknown> }

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  prisma: {
    companyMember: { findUnique: vi.fn() },
    site: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/audit', () => ({ logActivity: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/link', () => ({ default: () => null }))
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn() } }))

const { assignClientSites, removeClientAccount } = await import('@/app/(dashboard)/client-accounts/page')

const companyId = 'company_1'
const actor = { id: 'admin_1', name: 'Admin', email: 'admin@example.test', role: 'COMPANY_ADMIN', companyId }
const site = (id: string, clientUserId: string | null) => ({ id, companyId, deletedAt: null, status: 'ACTIVE', clientUserId })

/** The assignment's guarded membership write, for a client whose allow-list is `site_2`. */
const assignmentGuard = {
  id: 'member_client', companyId, userId: 'client_1', role: 'CLIENT', isActive: true,
  siteIds: { equals: ['site_2'] },
}

let db: Db
let interleave: Interleave | null
let memberWriteAttempts: Row[]

function seed(): Db {
  return {
    members: {
      member_client: { id: 'member_client', userId: 'client_1', companyId, role: 'CLIENT', isActive: true, siteIds: ['site_2'] },
    },
    sites: {
      site_1: site('site_1', null),
      site_2: site('site_2', 'client_1'),
      site_3: site('site_3', null),
    },
    audit: [],
    versions: {},
  }
}

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') return (expected as Row[]).some(branch => matches(row, branch))
    if (expected && typeof expected === 'object') {
      const condition = expected as { in?: unknown[]; equals?: unknown[] }
      if (condition.in) return condition.in.includes(row[key])
      if (condition.equals) return JSON.stringify(row[key]) === JSON.stringify(condition.equals)
    }
    return row[key] === expected
  })
}

/** A write committed by some other session, outside the actions under test. */
function commitMemberChange(id: string, data: Row) {
  Object.assign(db.members[id], data)
  db.versions[`members:${id}`] = (db.versions[`members:${id}`] ?? 0) + 1
}

class SerializationFailure extends Error {
  code = 'P2034'
}

/*
 * One SERIALIZABLE interactive transaction: reads and writes go to a snapshot taken when
 * it begins; updating a row another transaction committed since then fails with P2034;
 * only a callback that resolves commits its rows and audit records.
 */
async function runTransaction(fn: (tx: unknown) => Promise<unknown>) {
  const hook = interleave
  interleave = null
  if (hook?.at === 'beforeSnapshot') await hook.run()
  const snapshot: Record<Table, Record<string, Row>> = structuredClone({ members: db.members, sites: db.sites })
  const seen = { ...db.versions }
  if (hook?.at === 'afterSnapshot') await hook.run()

  const written = new Set<string>()
  const audit: Row[] = []
  const updateMany = (table: Table) => async ({ where, data }: { where: Row; data: Row }) => {
    const ids = Object.values(snapshot[table]).filter(row => matches(row, where)).map(row => String(row.id))
    for (const id of ids) {
      const key = `${table}:${id}`
      if ((db.versions[key] ?? 0) !== (seen[key] ?? 0)) throw new SerializationFailure('could not serialize access due to concurrent update')
      Object.assign(snapshot[table][id], data)
      written.add(key)
    }
    return { count: ids.length }
  }
  const tx = {
    companyMember: {
      updateMany: async (args: { where: Row; data: Row }) => {
        memberWriteAttempts.push(args.where)
        return updateMany('members')(args)
      },
    },
    site: {
      findMany: async ({ where }: { where: Row }) =>
        Object.values(snapshot.sites).filter(row => matches(row, where)).map(row => ({ id: row.id })),
      updateMany: updateMany('sites'),
    },
    auditLog: {
      create: async ({ data }: { data: Row }) => {
        audit.push(data)
        return data
      },
    },
  }

  const result = await fn(tx)
  for (const key of written) {
    const [table, id] = key.split(':') as [Table, string]
    db[table][id] = structuredClone(snapshot[table][id])
    db.versions[key] = (db.versions[key] ?? 0) + 1
  }
  db.audit.push(...audit)
  return result
}

function form(values: Record<string, string | string[]>) {
  const result = new FormData()
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) result.append(key, item)
  }
  return result
}

const assignForm = () => form({ memberId: 'member_client', siteIds: ['site_1', 'site_3'] })
const removeForm = () => form({ memberId: 'member_client', dangerConfirmText: 'Client Co' })
const assignmentGuardAttempts = () => memberWriteAttempts.filter(where => 'siteIds' in where)
const pointersTo = (userId: string) => Object.values(db.sites).filter(row => row.clientUserId === userId).map(row => row.id)
const assignmentAudits = () => db.audit.filter(entry => 'siteIds' in (entry.after as Row))

beforeEach(() => {
  vi.clearAllMocks()
  db = seed()
  interleave = null
  memberWriteAttempts = []
  mocks.requirePermission.mockResolvedValue(actor)
  mocks.requireUser.mockResolvedValue(actor)
  mocks.prisma.companyMember.findUnique.mockImplementation(async ({ where }: { where: { id: string; companyId?: string } }) => {
    const row = db.members[where.id]
    if (!row || (where.companyId && row.companyId !== where.companyId)) return null
    return { ...structuredClone(row), user: { id: row.userId, name: 'Client Co', email: 'client@example.test' } }
  })
  mocks.prisma.site.findMany.mockImplementation(async ({ where }: { where: Row }) =>
    Object.values(db.sites).filter(row => matches(row, where)).map(row => ({ id: row.id })))
  mocks.prisma.$transaction.mockImplementation(runTransaction)
})

function expectEverySerializable() {
  expect(mocks.prisma.$transaction.mock.calls.length).toBeGreaterThan(0)
  for (const [, options] of mocks.prisma.$transaction.mock.calls) {
    expect(options).toEqual({ isolationLevel: 'Serializable' })
  }
}

describe('assignClientSites: valid assignment', () => {
  it('replaces the allow-list and site pointers and audits it in one serializable transaction', async () => {
    await assignClientSites(assignForm())

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expectEverySerializable()
    expect(assignmentGuardAttempts()).toEqual([assignmentGuard])
    expect(db.members.member_client).toMatchObject({ role: 'CLIENT', isActive: true, siteIds: ['site_1', 'site_3'] })
    expect(pointersTo('client_1')).toEqual(['site_1', 'site_3'])
    expect(db.sites.site_2.clientUserId).toBeNull()
    expect(db.audit).toEqual([expect.objectContaining({
      companyId, userId: 'admin_1', action: 'UPDATE', module: 'USER', recordId: 'client_1',
      before: { siteIds: ['site_2'] },
      after: expect.objectContaining({ siteIds: ['site_1', 'site_3'] }),
    })])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/client-accounts')
  })
})

describe('assignClientSites racing a deactivation', () => {
  it('retries a stale assignment that conflicts with a committed removal, then refuses it', async () => {
    // The assignment's pre-read and snapshot both see an active CLIENT; the removal
    // commits before the assignment's first write.
    interleave = { at: 'afterSnapshot', run: () => removeClientAccount(removeForm()) }

    await expect(assignClientSites(assignForm())).rejects.toThrow(/changed before site access could be updated/)

    // assignment (P2034) -> removal -> assignment retry, all SERIALIZABLE.
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(3)
    expectEverySerializable()
    // The retry re-ran the role/isActive guard on the committed row, before any site write.
    expect(assignmentGuardAttempts()).toEqual([assignmentGuard, assignmentGuard])
    expect(db.members.member_client).toMatchObject({ role: 'CLIENT', isActive: false, siteIds: ['site_2'] })
    expect(pointersTo('client_1')).toEqual([])
    expect(assignmentAudits()).toEqual([])
    expect(db.audit).toEqual([expect.objectContaining({
      recordId: 'client_1',
      before: expect.objectContaining({ isActive: true, clientSiteIds: ['site_2'] }),
      after: expect.objectContaining({ isActive: false, clientSiteIds: [] }),
    })])
    // Only the removal completed.
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['deactivated', { isActive: false }],
    ['no longer a CLIENT', { role: 'SITE_ENGINEER' }],
  ])('retries and refuses without touching any site when the client was %s after the snapshot', async (_label, change) => {
    const before = structuredClone(db)
    interleave = { at: 'afterSnapshot', run: async () => commitMemberChange('member_client', change) }

    await expect(assignClientSites(assignForm())).rejects.toThrow(/changed before site access could be updated/)

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2)
    expectEverySerializable()
    expect(assignmentGuardAttempts()).toEqual([assignmentGuard, assignmentGuard])
    expect(db.members.member_client).toEqual({ ...before.members.member_client, ...change })
    expect(db.sites).toEqual(before.sites)
    expect(db.audit).toEqual([])
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses without restoring pointers when the removal committed after the pre-read', async () => {
    interleave = { at: 'beforeSnapshot', run: () => removeClientAccount(removeForm()) }

    await expect(assignClientSites(assignForm())).rejects.toThrow(/changed before site access could be updated/)

    expectEverySerializable()
    expect(assignmentGuardAttempts()).toEqual([assignmentGuard])
    expect(db.members.member_client).toMatchObject({ isActive: false, siteIds: ['site_2'] })
    expect(pointersTo('client_1')).toEqual([])
    expect(assignmentAudits()).toEqual([])
  })

  it('makes a stale removal retry and clear the pointers an assignment committed first', async () => {
    // The removal's snapshot predates the assignment's commit.
    interleave = { at: 'afterSnapshot', run: () => assignClientSites(assignForm()) }

    await removeClientAccount(removeForm())

    // removal (P2034) -> assignment -> removal retry.
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(3)
    expectEverySerializable()
    expect(db.members.member_client).toMatchObject({ isActive: false, siteIds: ['site_1', 'site_3'] })
    expect(pointersTo('client_1')).toEqual([])
    expect(db.audit).toEqual([
      expect.objectContaining({ after: expect.objectContaining({ siteIds: ['site_1', 'site_3'] }) }),
      expect.objectContaining({
        before: expect.objectContaining({ isActive: true, clientSiteIds: ['site_1', 'site_3'] }),
        after: expect.objectContaining({ isActive: false, clientSiteIds: [] }),
      }),
    ])
  })
})
