/**
 * Regression tests for the employee invitation / role-escalation hardening slice.
 *
 * These run against the server actions directly (Prisma + auth mocked) because the
 * authorization boundary must live in the server action, not in the page or the proxy.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const tx = {
    user: { create: vi.fn(), update: vi.fn() },
    companyMember: { create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  const prisma = {
    company: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    companyMember: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    site: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  }
  return {
    tx,
    prisma,
    auth: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn(),
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({
  requireUser: async () => {
    const session = await mocks.auth()
    if (!session?.user) throw new Error('UNAUTHORIZED: Authentication required')
    return session.user
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))

const { inviteEmployee, updateEmployee, removeEmployeeFromCompany } = await import('@/actions/users')
const { canAssignRole, canManageMemberWithRole, INVITABLE_EMPLOYEE_ROLES } = await import(
  '@/lib/permissions'
)

const COMPANY_ID = 'company_1'

type Actor = { role: string; companyId?: string | null }

function signIn(actor: Actor | null) {
  mocks.auth.mockResolvedValue(
    actor
      ? {
          user: {
            id: 'actor_1',
            email: 'admin@acme.test',
            name: 'Admin',
            role: actor.role,
            companyId: actor.companyId === undefined ? COMPANY_ID : actor.companyId,
          },
        }
      : null,
  )
}

function inviteForm(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    name: 'Ravi Kumar',
    email: 'ravi@acme.test',
    phone: '+91 98765 43210',
    password: 'Str0ngPass!',
    role: 'SITE_ENGINEER',
    siteIds: ['site_owned'],
    moduleControls: JSON.stringify(['/dashboard', '/sites']),
    ...overrides,
  }

  const fd = new FormData()
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) fd.append(key, String(item))
    } else {
      fd.set(key, String(value))
    }
  }
  return fd
}

function updateForm(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    memberId: 'member_target',
    role: 'SUPERVISOR',
    isActive: 'true',
    siteIds: ['site_owned'],
    moduleControls: JSON.stringify(['/dashboard']),
    ...overrides,
  }

  const fd = new FormData()
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) fd.append(key, String(item))
    } else {
      fd.set(key, String(value))
    }
  }
  return fd
}

function removeForm(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    memberId: 'member_target',
    dangerConfirmText: 'Target User',
    ...overrides,
  }

  const fd = new FormData()
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue
    fd.set(key, String(value))
  }
  return fd
}

function noUserWasCreated() {
  expect(mocks.tx.user.create).not.toHaveBeenCalled()
  expect(mocks.prisma.user.update).not.toHaveBeenCalled()
  expect(mocks.tx.companyMember.create).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()

  signIn({ role: 'COMPANY_ADMIN' })

  mocks.prisma.$transaction.mockImplementation(
    async (cb: (client: typeof mocks.tx) => Promise<unknown>) => cb(mocks.tx),
  )
  mocks.prisma.company.findUnique.mockResolvedValue({
    id: COMPANY_ID,
    name: 'Acme Constructions',
    status: 'ACTIVE',
    userLimit: 10,
    deletedAt: null,
    _count: { members: 3 },
  })
  mocks.prisma.user.findUnique.mockResolvedValue(null)
  mocks.prisma.companyMember.count.mockResolvedValue(3)
  mocks.prisma.site.findMany.mockResolvedValue([{ id: 'site_owned' }])
  mocks.prisma.companyMember.findUnique.mockResolvedValue({
    id: 'member_target',
    userId: 'user_target',
    companyId: COMPANY_ID,
    role: 'SITE_ENGINEER',
    isActive: true,
    siteIds: [],
    user: { id: 'user_target', name: 'Target User', email: 'target@acme.test' },
  })
  mocks.tx.user.create.mockResolvedValue({ id: 'user_new', email: 'ravi@acme.test' })
  mocks.tx.companyMember.create.mockResolvedValue({ id: 'member_new' })
})

describe('permissions: role hierarchy helpers', () => {
  it('never lets a non super admin assign SUPER_ADMIN', () => {
    expect(canAssignRole('COMPANY_ADMIN', 'SUPER_ADMIN')).toBe(false)
    expect(canAssignRole('PROJECT_MANAGER', 'SUPER_ADMIN')).toBe(false)
    expect(canAssignRole('SUPER_ADMIN', 'SUPER_ADMIN')).toBe(true)
  })

  it('forbids assigning an equal or higher role', () => {
    expect(canAssignRole('COMPANY_ADMIN', 'COMPANY_ADMIN')).toBe(false)
    expect(canAssignRole('PROJECT_MANAGER', 'COMPANY_ADMIN')).toBe(false)
    expect(canAssignRole('COMPANY_ADMIN', 'PROJECT_MANAGER')).toBe(true)
  })

  it('forbids managing a member of equal or higher rank', () => {
    expect(canManageMemberWithRole('COMPANY_ADMIN', 'COMPANY_ADMIN')).toBe(false)
    expect(canManageMemberWithRole('COMPANY_ADMIN', 'SITE_ENGINEER')).toBe(true)
    expect(canManageMemberWithRole('SUPER_ADMIN', 'COMPANY_ADMIN')).toBe(true)
  })

  it('excludes portal/external and super admin roles from employee invites', () => {
    expect(INVITABLE_EMPLOYEE_ROLES).not.toContain('CLIENT')
    expect(INVITABLE_EMPLOYEE_ROLES).not.toContain('VENDOR')
    expect(INVITABLE_EMPLOYEE_ROLES).not.toContain('SUBCONTRACTOR')
    expect(INVITABLE_EMPLOYEE_ROLES).not.toContain('SUPER_ADMIN')
    expect(INVITABLE_EMPLOYEE_ROLES).toContain('SITE_ENGINEER')
  })
})

describe('inviteEmployee: authentication and authorization', () => {
  it('rejects anonymous callers', async () => {
    signIn(null)
    await expect(inviteEmployee(inviteForm())).rejects.toThrow(/unauthorized/i)
    noUserWasCreated()
  })

  it('rejects authenticated users without company.manage', async () => {
    signIn({ role: 'SITE_ENGINEER' })
    await expect(inviteEmployee(inviteForm())).rejects.toThrow(/forbidden/i)
    noUserWasCreated()
  })

  it('rejects a caller with no company membership', async () => {
    signIn({ role: 'COMPANY_ADMIN', companyId: null })
    await expect(inviteEmployee(inviteForm())).rejects.toThrow(/compan/i)
    noUserWasCreated()
  })
})

describe('inviteEmployee: company status gate', () => {
  it.each(['SUSPENDED', 'CANCELLED'])('rejects invites while the company is %s', async status => {
    mocks.prisma.company.findUnique.mockResolvedValue({
      id: COMPANY_ID,
      name: 'Acme Constructions',
      status,
      userLimit: 10,
      deletedAt: null,
      _count: { members: 3 },
    })
    await expect(inviteEmployee(inviteForm())).rejects.toThrow(/suspended|cancelled/i)
    noUserWasCreated()
  })
})

describe('inviteEmployee: role hierarchy', () => {
  it.each(['CLIENT', 'VENDOR', 'SUBCONTRACTOR', 'SUPER_ADMIN'])(
    'refuses to create a %s through the employee invite path',
    async role => {
      await expect(inviteEmployee(inviteForm({ role }))).rejects.toThrow(/role/i)
      noUserWasCreated()
    },
  )

  it('refuses to create a peer COMPANY_ADMIN', async () => {
    await expect(inviteEmployee(inviteForm({ role: 'COMPANY_ADMIN' }))).rejects.toThrow(/role/i)
    noUserWasCreated()
  })

  it('lets a SUPER_ADMIN create a COMPANY_ADMIN', async () => {
    signIn({ role: 'SUPER_ADMIN' })
    await expect(inviteEmployee(inviteForm({ role: 'COMPANY_ADMIN' }))).resolves.toBeUndefined()
    expect(mocks.tx.user.create).toHaveBeenCalledTimes(1)
  })
})

describe('inviteEmployee: payload validation', () => {
  it('rejects a malformed email', async () => {
    await expect(inviteEmployee(inviteForm({ email: 'not-an-email' }))).rejects.toThrow()
    noUserWasCreated()
  })

  it('rejects a short password', async () => {
    await expect(inviteEmployee(inviteForm({ password: 'abc' }))).rejects.toThrow()
    noUserWasCreated()
  })

  it('rejects a missing name', async () => {
    await expect(inviteEmployee(inviteForm({ name: '' }))).rejects.toThrow()
    noUserWasCreated()
  })

  it('rejects an unknown role value', async () => {
    await expect(inviteEmployee(inviteForm({ role: 'GOD_MODE' }))).rejects.toThrow(/role/i)
    noUserWasCreated()
  })

  it('rejects a duplicate email', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'existing', email: 'ravi@acme.test' })
    await expect(inviteEmployee(inviteForm())).rejects.toThrow(/email/i)
    noUserWasCreated()
  })
})

describe('inviteEmployee: submitted site ownership', () => {
  it('rejects site ids that do not belong to the caller company', async () => {
    mocks.prisma.site.findMany.mockResolvedValue([{ id: 'site_owned' }])
    await expect(
      inviteEmployee(inviteForm({ siteIds: ['site_owned', 'site_from_other_company'] })),
    ).rejects.toThrow(/site/i)
    noUserWasCreated()
  })

  it('scopes the ownership lookup to the caller company', async () => {
    await inviteEmployee(inviteForm())
    expect(mocks.prisma.site.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: COMPANY_ID }),
      }),
    )
  })
})

describe('inviteEmployee: user limit', () => {
  it('rejects when the company has reached its user limit', async () => {
    mocks.prisma.company.findUnique.mockResolvedValue({
      id: COMPANY_ID,
      name: 'Acme Constructions',
      status: 'ACTIVE',
      userLimit: 3,
      deletedAt: null,
      _count: { members: 3 },
    })
    await expect(inviteEmployee(inviteForm())).rejects.toThrow(/limit/i)
    noUserWasCreated()
  })
})

describe('inviteEmployee: successful invite', () => {
  it('creates the user, membership and audit log in one durable transaction', async () => {
    await inviteEmployee(inviteForm())

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.user.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.companyMember.create).toHaveBeenCalledTimes(1)
    // Durable: the audit entry is written with the transaction client, so a failed
    // log rolls the invite back instead of being silently swallowed.
    expect(mocks.tx.auditLog.create).toHaveBeenCalledTimes(1)

    const userArgs = mocks.tx.user.create.mock.calls[0][0]
    expect(userArgs.data.email).toBe('ravi@acme.test')
    expect(userArgs.data.role).toBe('SITE_ENGINEER')
    expect(userArgs.data.passwordHash).not.toBe('Str0ngPass!')
    expect(userArgs.data.passwordHash).toMatch(/^\$2[aby]\$/)
    expect(userArgs.data).not.toHaveProperty('password')

    const memberArgs = mocks.tx.companyMember.create.mock.calls[0][0]
    expect(memberArgs.data.companyId).toBe(COMPANY_ID)
    expect(memberArgs.data.role).toBe('SITE_ENGINEER')
    expect(memberArgs.data.siteIds).toEqual(['site_owned'])

    const auditArgs = mocks.tx.auditLog.create.mock.calls[0][0]
    expect(auditArgs.data.companyId).toBe(COMPANY_ID)
    expect(auditArgs.data.userId).toBe('actor_1')
    expect(auditArgs.data.module).toBe('USER')
  })
})

describe('updateEmployee: company status gate', () => {
  it.each(['SUSPENDED', 'CANCELLED'])('rejects updates while the company is %s', async status => {
    mocks.prisma.company.findUnique.mockResolvedValue({
      id: COMPANY_ID,
      name: 'Acme Constructions',
      status,
      userLimit: 10,
      deletedAt: null,
      _count: { members: 3 },
    })
    await expect(updateEmployee(updateForm())).rejects.toThrow(/suspended|cancelled/i)
    expect(mocks.tx.companyMember.update).not.toHaveBeenCalled()
  })

  it('rejects updates for a soft-deleted company', async () => {
    mocks.prisma.company.findUnique.mockResolvedValue({ id: COMPANY_ID, status: 'ACTIVE', deletedAt: new Date() })
    await expect(updateEmployee(updateForm())).rejects.toThrow(/company not found/i)
    expect(mocks.tx.companyMember.update).not.toHaveBeenCalled()
  })
})

describe('updateEmployee: role escalation on existing members', () => {
  it('rejects callers without company.manage', async () => {
    signIn({ role: 'PROJECT_MANAGER' })
    await expect(updateEmployee(updateForm())).rejects.toThrow(/forbidden/i)
    expect(mocks.tx.companyMember.update).not.toHaveBeenCalled()
  })

  it('refuses to promote a member to an equal or higher role', async () => {
    await expect(updateEmployee(updateForm({ role: 'COMPANY_ADMIN' }))).rejects.toThrow(/role/i)
    expect(mocks.tx.companyMember.update).not.toHaveBeenCalled()
  })

  it.each(['CLIENT', 'VENDOR', 'SUBCONTRACTOR'])('refuses to convert an employee into external role %s', async role => {
    await expect(updateEmployee(updateForm({ role }))).rejects.toThrow(/employee|role/i)
    expect(mocks.tx.companyMember.update).not.toHaveBeenCalled()
  })

  it('refuses to modify a member who already outranks the caller', async () => {
    mocks.prisma.companyMember.findUnique.mockResolvedValue({
      id: 'member_target',
      userId: 'user_target',
      companyId: COMPANY_ID,
      role: 'COMPANY_ADMIN',
      isActive: true,
      siteIds: [],
      user: { id: 'user_target', name: 'Peer Admin', email: 'peer@acme.test' },
    })
    await expect(updateEmployee(updateForm({ role: 'SUPERVISOR' }))).rejects.toThrow(/role|permis/i)
    expect(mocks.tx.companyMember.update).not.toHaveBeenCalled()
  })

  it('rejects members from another company', async () => {
    mocks.prisma.companyMember.findUnique.mockResolvedValue(null)
    await expect(updateEmployee(updateForm())).rejects.toThrow(/not found|compan/i)
    expect(mocks.tx.companyMember.update).not.toHaveBeenCalled()
  })

  it('rejects site ids owned by another company', async () => {
    mocks.prisma.site.findMany.mockResolvedValue([])
    await expect(updateEmployee(updateForm({ siteIds: ['site_from_other_company'] }))).rejects.toThrow(
      /site/i,
    )
    expect(mocks.tx.companyMember.update).not.toHaveBeenCalled()
  })

  it('applies an allowed role change, syncs the login role and records it durably', async () => {
    await updateEmployee(updateForm({ role: 'SUPERVISOR' }))

    expect(mocks.tx.companyMember.update).toHaveBeenCalledTimes(1)
    const args = mocks.tx.companyMember.update.mock.calls[0][0]
    expect(args.where).toEqual(
      expect.objectContaining({ id: 'member_target', companyId: COMPANY_ID }),
    )
    expect(args.data.role).toBe('SUPERVISOR')

    // The session role is read from User.role, so it must move with the membership role.
    expect(mocks.tx.user.update).toHaveBeenCalledTimes(1)
    expect(mocks.tx.user.update.mock.calls[0][0].data.role).toBe('SUPERVISOR')

    expect(mocks.tx.auditLog.create).toHaveBeenCalledTimes(1)
    expect(mocks.tx.auditLog.create.mock.calls[0][0].data.module).toBe('USER')
  })
})

describe('removeEmployeeFromCompany: access revocation guardrails', () => {
  it.each(['SUSPENDED', 'CANCELLED'])('rejects removal while the company is %s', async status => {
    mocks.prisma.company.findUnique.mockResolvedValue({ id: COMPANY_ID, status, deletedAt: null })
    await expect(removeEmployeeFromCompany(removeForm())).rejects.toThrow(/suspended|cancelled/i)
    expect(mocks.tx.companyMember.update).not.toHaveBeenCalled()
  })

  it('rejects removal for a soft-deleted company', async () => {
    mocks.prisma.company.findUnique.mockResolvedValue({ id: COMPANY_ID, status: 'ACTIVE', deletedAt: new Date() })
    await expect(removeEmployeeFromCompany(removeForm())).rejects.toThrow(/company not found/i)
    expect(mocks.tx.companyMember.update).not.toHaveBeenCalled()
  })

  it('rejects a wrong typed confirmation before changing access', async () => {
    await expect(removeEmployeeFromCompany(removeForm({ dangerConfirmText: 'Wrong Name' }))).rejects.toThrow(/confirmation/i)
    expect(mocks.tx.companyMember.update).not.toHaveBeenCalled()
  })

  it('rejects removing a peer or higher-ranked member', async () => {
    mocks.prisma.companyMember.findUnique.mockResolvedValue({
      id: 'member_target', userId: 'user_target', companyId: COMPANY_ID, role: 'COMPANY_ADMIN', isActive: true,
      siteIds: [], user: { id: 'user_target', name: 'Peer Admin', email: 'peer@acme.test' },
    })
    await expect(removeEmployeeFromCompany(removeForm({ dangerConfirmText: 'Peer Admin' }))).rejects.toThrow(/role|permis/i)
    expect(mocks.tx.companyMember.update).not.toHaveBeenCalled()
  })

  it('rejects self-removal', async () => {
    mocks.prisma.companyMember.findUnique.mockResolvedValue({
      id: 'member_target', userId: 'actor_1', companyId: COMPANY_ID, role: 'SITE_ENGINEER', isActive: true,
      siteIds: [], user: { id: 'actor_1', name: 'Admin', email: 'admin@acme.test' },
    })
    await expect(removeEmployeeFromCompany(removeForm({ dangerConfirmText: 'Admin' }))).rejects.toThrow(/own access/i)
    expect(mocks.tx.companyMember.update).not.toHaveBeenCalled()
  })

  it('rejects a member from another company', async () => {
    mocks.prisma.companyMember.findUnique.mockResolvedValue({
      id: 'member_target', userId: 'user_other', companyId: 'company_other', role: 'SITE_ENGINEER', isActive: true,
      siteIds: [], user: { id: 'user_other', name: 'Other User', email: 'other@example.test' },
    })
    await expect(removeEmployeeFromCompany(removeForm({ dangerConfirmText: 'Other User' }))).rejects.toThrow(/not found|company/i)
    expect(mocks.tx.companyMember.update).not.toHaveBeenCalled()
  })

  it('deactivates only a managed company member and records the access change transactionally', async () => {
    await removeEmployeeFromCompany(removeForm())
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tx.companyMember.update).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'member_target', companyId: COMPANY_ID }),
      data: expect.objectContaining({ isActive: false }),
    }))
    expect(mocks.tx.user.update).not.toHaveBeenCalled()
    expect(mocks.prisma.user.update).not.toHaveBeenCalled()
    expect(mocks.tx.auditLog.create).toHaveBeenCalledTimes(1)
  })
})

describe('employee management pages use only hardened mutations', () => {
  const invitePageSource = readFileSync(
    path.join(process.cwd(), 'src/app/(dashboard)/settings/users/invite/page.tsx'),
    'utf8',
  )
  const editPageSource = readFileSync(
    path.join(process.cwd(), 'src/app/(dashboard)/settings/users/[id]/page.tsx'),
    'utf8',
  )

  it('keeps invitation authorization out of the page module', () => {
    expect(invitePageSource).not.toMatch(/'use server'/)
    expect(invitePageSource).toMatch(/import\s*\{[^}]*inviteEmployee[^}]*\}\s*from\s*'@\/actions\/users'/)
    expect(invitePageSource).toMatch(/action=\{inviteEmployee\}/)
    expect(invitePageSource).not.toMatch(/prisma\.(user|companyMember)\.(create|update)/)
  })

  it('keeps employee edits and access removals on hardened server actions', () => {
    expect(editPageSource).not.toMatch(/async function updateUser/)
    expect(editPageSource).not.toMatch(/async function removeFromCompany/)
    expect(editPageSource).toMatch(/import\s*\{[^}]*updateEmployee[^}]*\}\s*from\s*'@\/actions\/users'/)
    expect(editPageSource).toMatch(/import\s*\{[^}]*removeEmployeeFromCompany[^}]*\}\s*from\s*'@\/actions\/users'/)
    expect(editPageSource).toMatch(/action=\{updateEmployee\}/)
    expect(editPageSource).toMatch(/action=\{removeEmployeeFromCompany\}/)
    expect(editPageSource).not.toMatch(/<option value="CLIENT">/)
  })
})
