import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression for the mobile approval and menu pages that authorized on the JWT alone.
 *
 * `/mobile/approvals` and `/mobile/approvals/[id]` only checked that a session existed,
 * then read the company's approval queue; the detail page derived its approve/pay buttons
 * from the token role and rendered whatever the action returned. `/mobile/more` shaped
 * itself on the token role. A revoked member with an unexpired token, a principal with no
 * company, a demoted role or a company with APPROVALS switched off still got the queue.
 *
 * Now the approval pages run `resolveTenantPageAccess` (approvals.view + APPROVALS) on the
 * live principal before their first query, the detail page binds the row to exactly the
 * live company, and the menu runs `resolveTenantPrincipal` and never reads the token.
 *
 * `@/lib/permissions` and `@/lib/pages/tenant-page-access` are real.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireUser: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  getApprovalsAction: vi.fn(),
  getApprovalByIdAction: vi.fn(),
  prisma: {
    company: { findFirst: vi.fn() },
    site: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('@/actions/approvals', () => ({
  getApprovalsAction: mocks.getApprovalsAction,
  getApprovalByIdAction: mocks.getApprovalByIdAction,
}))
vi.mock('@/components/approvals/ApprovalDetailActions', () => ({ default: () => null }))
vi.mock('@/components/responsive/MobileCardList', () => ({ default: () => null }))

const { default: MobileApprovalsPage } = await import('@/app/(mobile)/mobile/approvals/page')
const { default: MobileApprovalDetailPage } = await import('@/app/(mobile)/mobile/approvals/[id]/page')
const { default: MobileMorePage } = await import('@/app/(mobile)/mobile/more/page')

const ALL_MODULES = ['SITES', 'APPROVALS', 'BILLS', 'EXPENSES', 'DPR']

function principal(role: string, companyId: string | null = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

function approval(companyId = 'company_1') {
  return {
    approval: {
      id: 'appr_1', companyId, currentStatus: 'PENDING', entityType: 'EXPENSE', priority: 'NORMAL', title: 'Cement',
      description: null, rejectionReason: null, amount: 100, site: { name: 'Site A' },
      requestedBy: { name: 'Eng', role: 'SITE_ENGINEER' }, comments: [],
    },
    entityData: { billAttachments: [] },
  }
}

function expectNoApprovalReads() {
  expect(mocks.getApprovalsAction).not.toHaveBeenCalled()
  expect(mocks.getApprovalByIdAction).not.toHaveBeenCalled()
}

/** Finds a prop anywhere in a rendered element tree. */
function findProp(node: unknown, prop: string): unknown {
  if (!node || typeof node !== 'object') return undefined
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findProp(child, prop)
      if (found !== undefined) return found
    }
    return undefined
  }
  const props = (node as { props?: Record<string, unknown> }).props
  if (!props) return undefined
  if (prop in props) return props[prop]
  return findProp(props.children, prop)
}

function hrefs(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) hrefs(child, out)
    return out
  }
  const props = (node as { props?: Record<string, unknown> }).props
  if (!props) return out
  if (typeof props.href === 'string') out.push(props.href)
  hrefs(props.children, out)
  return out
}

function text(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) text(child, out)
    return out
  }
  const props = (node as { props?: Record<string, unknown> }).props
  if (props) text(props.children, out)
  return out
}

let modules: unknown

beforeEach(() => {
  vi.clearAllMocks()
  modules = ALL_MODULES
  // The token still names an admin of another company; nothing may ever read it.
  mocks.auth.mockResolvedValue({ user: { id: 'user_token', role: 'COMPANY_ADMIN', companyId: 'company_2' } })
  mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))
  mocks.prisma.company.findFirst.mockImplementation(async () => ({ modulesJson: modules }))
  mocks.getApprovalsAction.mockResolvedValue([])
  mocks.getApprovalByIdAction.mockResolvedValue(approval())
})

const APPROVAL_PAGES = [
  {
    path: '/mobile/approvals',
    render: () => MobileApprovalsPage({ searchParams: Promise.resolve({}) }),
  },
  {
    path: '/mobile/approvals/appr_1',
    render: () => MobileApprovalDetailPage({ params: Promise.resolve({ id: 'appr_1' }) }),
  },
]

describe.each(APPROVAL_PAGES)('$path', ({ render }) => {
  it('refuses a revoked principal whose token is still valid, before any approval read', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))
    await expect(render()).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.auth).not.toHaveBeenCalled()
    expectNoApprovalReads()
  })

  it('sends a live principal with no company to /login, before any approval read', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT', null))
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/login')
    expectNoApprovalReads()
  })

  it('turns away a role demoted to one without approvals.view even when the token names an admin', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/mobile/home')
    expect(mocks.prisma.company.findFirst).not.toHaveBeenCalled()
    expectNoApprovalReads()
  })

  it('turns away a live CLIENT and a SUPER_ADMIN without tenant context', async () => {
    mocks.requireUser.mockResolvedValue(principal('CLIENT'))
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/client-portal')
    mocks.requireUser.mockResolvedValue(principal('SUPER_ADMIN', null))
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/super-admin/dashboard')
    expectNoApprovalReads()
  })

  it('turns away when the live company is soft deleted', async () => {
    mocks.prisma.company.findFirst.mockResolvedValue(null)
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/login')
    expect(mocks.prisma.company.findFirst.mock.calls[0][0].where).toEqual({ id: 'company_1', deletedAt: null })
    expectNoApprovalReads()
  })

  it('turns away when APPROVALS is disabled for the live company', async () => {
    modules = ALL_MODULES.filter((name) => name !== 'APPROVALS')
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/dashboard')
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/mobile/home')
    expectNoApprovalReads()
  })

  it('renders for an allowed live role and never reads the token', async () => {
    for (const role of ['ACCOUNTANT', 'SITE_ENGINEER']) {
      mocks.requireUser.mockResolvedValue(principal(role))
      await expect(render()).resolves.toBeTruthy()
    }
    expect(mocks.auth).not.toHaveBeenCalled()
  })
})

describe('/mobile/approvals/[id] binding', () => {
  it.each([
    ['a foreign id', 'appr_foreign', 'Approval not found or access denied'],
    ['a deleted or orphaned id', 'appr_deleted', 'Approval not found or access denied'],
    ['a cross-bound or malformed row', 'appr_malformed', 'Approval has an invalid site binding'],
  ])('leaves for the list when the action refuses %s', async (_label, id, message) => {
    mocks.getApprovalByIdAction.mockRejectedValue(new Error(message))
    await expect(MobileApprovalDetailPage({ params: Promise.resolve({ id }) })).rejects.toThrow('NEXT_REDIRECT:/mobile/approvals')
    expect(mocks.getApprovalByIdAction).toHaveBeenCalledWith(id)
  })

  it('never renders a row of another company even if one is returned', async () => {
    mocks.getApprovalByIdAction.mockResolvedValue(approval('company_2'))
    await expect(MobileApprovalDetailPage({ params: Promise.resolve({ id: 'appr_1' }) })).rejects.toThrow('NEXT_REDIRECT:/mobile/approvals')
  })

  it('derives the approve/pay hints from the live role, not the token', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    const engineer = await MobileApprovalDetailPage({ params: Promise.resolve({ id: 'appr_1' }) })
    expect(findProp(engineer, 'canApprove')).toBe(false)
    expect(findProp(engineer, 'canPay')).toBe(false)

    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))
    const accountant = await MobileApprovalDetailPage({ params: Promise.resolve({ id: 'appr_1' }) })
    expect(findProp(accountant, 'canApprove')).toBe(true)
    expect(findProp(accountant, 'canPay')).toBe(true)
  })
})

describe('/mobile/more', () => {
  it('refuses a revoked principal by sending it to /login without reading the token', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))
    await expect(MobileMorePage()).rejects.toThrow('NEXT_REDIRECT:/login')
    expect(mocks.auth).not.toHaveBeenCalled()
  })

  it('sends a live principal with no company to /login', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER', null))
    await expect(MobileMorePage()).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('turns away CLIENT and SUPER_ADMIN', async () => {
    mocks.requireUser.mockResolvedValue(principal('CLIENT'))
    await expect(MobileMorePage()).rejects.toThrow('NEXT_REDIRECT:/client-portal')
    mocks.requireUser.mockResolvedValue(principal('SUPER_ADMIN', null))
    await expect(MobileMorePage()).rejects.toThrow('NEXT_REDIRECT:/super-admin/dashboard')
  })

  it('reads no company data and shapes the menu on the live role, not the token', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))
    const supervisor = await MobileMorePage()
    expect(hrefs(supervisor)).not.toContain('/mobile/approvals')
    expect(text(supervisor)).toContain('SUPERVISOR')
    expect(text(supervisor)).not.toContain('COMPANY_ADMIN')

    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))
    const accountant = await MobileMorePage()
    expect(hrefs(accountant)).toContain('/mobile/approvals')

    expect(mocks.auth).not.toHaveBeenCalled()
    expect(mocks.prisma.company.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.site.findMany).not.toHaveBeenCalled()
    expectNoApprovalReads()
  })
})
