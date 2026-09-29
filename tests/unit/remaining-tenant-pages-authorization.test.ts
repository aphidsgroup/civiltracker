import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression for the last dashboard pages that read tenant data on the JWT alone.
 *
 * `/subcontractors/[id]/edit`, `/bills/upload`, `/employees`, `/approvals` and
 * `/approvals/[id]` only checked that the token carried a company id (the approval detail
 * not even that), then queried. A revoked member with an unexpired token, a principal with
 * no company, a role without the page permission or a company with the module switched off
 * still got the company's subcontractor terms, staff list and approval queue; the approval
 * pages also derived the approve/pay buttons from the token role, and the subcontractor
 * edit page ran its own unauthenticated-by-role update.
 *
 * Now each page runs `resolveTenantPageAccess` on the live principal before its first data
 * query, binds id pages to exactly the live company (deactivated, foreign and orphaned rows
 * answer like missing ones) and never reads the token.
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
  getApprovalStatsAction: vi.fn(),
  getApprovalByIdAction: vi.fn(),
  updateSubcontractorAction: vi.fn(),
  prisma: {
    company: { findFirst: vi.fn(), findUnique: vi.fn() },
    companyMember: { findFirst: vi.fn(), findMany: vi.fn() },
    site: { findMany: vi.fn() },
    subcontractor: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('@/lib/audit', () => ({ logActivity: vi.fn() }))
vi.mock('@/actions/approvals', () => ({
  getApprovalsAction: mocks.getApprovalsAction,
  getApprovalStatsAction: mocks.getApprovalStatsAction,
  getApprovalByIdAction: mocks.getApprovalByIdAction,
}))
vi.mock('@/actions/subcontractors', () => ({ updateSubcontractorAction: mocks.updateSubcontractorAction }))
vi.mock('@/components/approvals/ApprovalInlineActions', () => ({ default: () => null }))
vi.mock('@/components/approvals/ApprovalDetailActions', () => ({ default: () => null }))
vi.mock('@/components/responsive/ResponsiveTable', () => ({ default: () => null }))
vi.mock('@/components/responsive/MobileCardList', () => ({ default: () => null }))

const { default: EditSubcontractorPage } = await import('@/app/(dashboard)/subcontractors/[id]/edit/page')
const { default: UploadBillPage } = await import('@/app/(dashboard)/bills/upload/page')
const { default: EmployeesPage } = await import('@/app/(dashboard)/employees/page')
const { default: ApprovalsPage } = await import('@/app/(dashboard)/approvals/page')
const { default: ApprovalDetailPage } = await import('@/app/(dashboard)/approvals/[id]/page')

const ALL_MODULES = ['SITES', 'APPROVALS', 'BILLS', 'MATERIALS', 'EXPENSES']

type PageCase = {
  path: string
  render: () => Promise<unknown>
  allowed: string
  denied: string
  module?: string
}

const PAGES: PageCase[] = [
  {
    path: '/subcontractors/sub_1/edit',
    render: () => EditSubcontractorPage({ params: Promise.resolve({ id: 'sub_1' }) }),
    allowed: 'PURCHASE_MANAGER',
    denied: 'PROJECT_MANAGER',
    module: 'MATERIALS',
  },
  { path: '/bills/upload', render: () => UploadBillPage(), allowed: 'SITE_ENGINEER', denied: 'SUPERVISOR', module: 'BILLS' },
  { path: '/employees', render: () => EmployeesPage(), allowed: 'COMPANY_ADMIN', denied: 'PROJECT_MANAGER' },
  {
    path: '/approvals',
    render: () => ApprovalsPage({ searchParams: Promise.resolve({}) }),
    allowed: 'ACCOUNTANT',
    denied: 'SUPERVISOR',
    module: 'APPROVALS',
  },
  {
    path: '/approvals/appr_1',
    render: () => ApprovalDetailPage({ params: Promise.resolve({ id: 'appr_1' }) }),
    allowed: 'ACCOUNTANT',
    denied: 'SUPERVISOR',
    module: 'APPROVALS',
  },
]

function principal(role: string, companyId: string | null = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

function approval(companyId = 'company_1') {
  return {
    approval: {
      id: 'appr_1', companyId, currentStatus: 'PENDING', entityType: 'EXPENSE', priority: 'NORMAL', title: 'Cement',
      description: null, rejectionReason: null, amount: 100, site: { name: 'Site A' },
      requestedBy: { name: 'Eng', role: 'SITE_ENGINEER' }, comments: [], timelines: [],
    },
    entityData: { billAttachments: [] },
  }
}

/** Every tenant data read the five pages can make, beyond the gate's own company lookup. */
function dataReads() {
  return [
    mocks.prisma.subcontractor.findFirst, mocks.prisma.site.findMany, mocks.prisma.companyMember.findMany,
    mocks.getApprovalsAction, mocks.getApprovalStatsAction, mocks.getApprovalByIdAction,
  ]
}

function expectNoDataReads() {
  for (const read of dataReads()) expect(read).not.toHaveBeenCalled()
}

let modules: unknown

beforeEach(() => {
  vi.clearAllMocks()
  modules = ALL_MODULES
  // The token still names an admin of another company; nothing may ever read it.
  mocks.auth.mockResolvedValue({ user: { id: 'user_token', role: 'COMPANY_ADMIN', companyId: 'company_2' } })
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findFirst.mockImplementation(async () => ({ modulesJson: modules, userLimit: 15 }))
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  mocks.prisma.companyMember.findMany.mockResolvedValue([])
  mocks.prisma.site.findMany.mockResolvedValue([])
  mocks.prisma.subcontractor.findFirst.mockResolvedValue({
    id: 'sub_1', name: 'Bricks Co', phone: null, trade: null, gst: null, status: 'Active',
    workOrderValue: 0, raBilled: 0, advance: 0, retention: 0,
  })
  mocks.getApprovalsAction.mockResolvedValue([])
  mocks.getApprovalStatsAction.mockResolvedValue({ pending: 0, urgent: 0, approvedWeek: 0, pendingAmount: 0 })
  mocks.getApprovalByIdAction.mockResolvedValue(approval())
})

describe.each(PAGES)('$path', ({ render, allowed, denied, module }) => {
  it('refuses a revoked principal whose token is still valid, before any data read', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))
    await expect(render()).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.auth).not.toHaveBeenCalled()
    expectNoDataReads()
  })

  it('sends a live principal with no company to /login, before any data read', async () => {
    mocks.requireUser.mockResolvedValue(principal(allowed, null))
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/login')
    expectNoDataReads()
  })

  it('turns away a live role without the page permission even when the token names an admin', async () => {
    mocks.requireUser.mockResolvedValue(principal(denied))
    await expect(render()).rejects.toThrow(/NEXT_REDIRECT|NEXT_NOT_FOUND/)
    expect(mocks.prisma.company.findFirst).not.toHaveBeenCalled()
    expectNoDataReads()
  })

  it('turns away a live CLIENT and a SUPER_ADMIN without tenant context', async () => {
    mocks.requireUser.mockResolvedValue(principal('CLIENT'))
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/client-portal')
    mocks.requireUser.mockResolvedValue(principal('SUPER_ADMIN', null))
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/super-admin/dashboard')
    expectNoDataReads()
  })

  it('turns away when the live company is soft deleted', async () => {
    mocks.requireUser.mockResolvedValue(principal(allowed))
    mocks.prisma.company.findFirst.mockResolvedValue(null)
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/login')
    expect(mocks.prisma.company.findFirst.mock.calls[0][0].where).toEqual({ id: 'company_1', deletedAt: null })
    expectNoDataReads()
  })

  if (module) {
    it(`turns away when ${module} is disabled for the live company`, async () => {
      mocks.requireUser.mockResolvedValue(principal(allowed))
      modules = ALL_MODULES.filter((name) => name !== module)
      await expect(render()).rejects.toThrow(/NEXT_REDIRECT|NEXT_NOT_FOUND/)
      expectNoDataReads()
    })
  }

  it('renders for the allowed live role and never reads the token', async () => {
    mocks.requireUser.mockResolvedValue(principal(allowed))
    await expect(render()).resolves.toBeTruthy()
    expect(mocks.auth).not.toHaveBeenCalled()
  })
})

describe('/subcontractors/[id]/edit binding', () => {
  it('binds the id to exactly the live company, an active row and a live site', async () => {
    mocks.requireUser.mockResolvedValue(principal('PURCHASE_MANAGER'))
    await EditSubcontractorPage({ params: Promise.resolve({ id: 'sub_1' }) })
    const where = mocks.prisma.subcontractor.findFirst.mock.calls[0][0].where
    expect(where).toEqual({
      id: 'sub_1',
      companyId: 'company_1',
      isActive: true,
      OR: [{ siteId: null }, { site: { companyId: 'company_1', deletedAt: null } }],
    })
    expect(JSON.stringify(where)).not.toContain('company_2')
  })

  it('answers a foreign, deactivated or deleted-site id by leaving for the list', async () => {
    mocks.requireUser.mockResolvedValue(principal('PURCHASE_MANAGER'))
    mocks.prisma.subcontractor.findFirst.mockResolvedValue(null)
    await expect(EditSubcontractorPage({ params: Promise.resolve({ id: 'sub_foreign' }) })).rejects.toThrow('NEXT_REDIRECT:/subcontractors')
  })
})

describe('/bills/upload', () => {
  it('reads no company data at all', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
    await UploadBillPage()
    expect(mocks.prisma.site.findMany).not.toHaveBeenCalled()
  })
})

describe('/employees', () => {
  it('lists members and the seat limit of the live company only', async () => {
    await EmployeesPage()
    expect(mocks.prisma.companyMember.findMany.mock.calls[0][0].where).toMatchObject({ companyId: 'company_1' })
    const companyReads = mocks.prisma.company.findFirst.mock.calls.map(([args]) => args.where)
    expect(companyReads).toEqual([{ id: 'company_1', deletedAt: null }, { id: 'company_1', deletedAt: null }])
  })
})

describe('/approvals/[id] binding', () => {
  it('leaves for the list when the action refuses a foreign, deleted or orphaned id', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))
    mocks.getApprovalByIdAction.mockRejectedValue(new Error('Approval not found'))
    await expect(ApprovalDetailPage({ params: Promise.resolve({ id: 'appr_foreign' }) })).rejects.toThrow('NEXT_REDIRECT:/approvals')
  })

  it('never renders a row of another company even if one is returned', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))
    mocks.getApprovalByIdAction.mockResolvedValue(approval('company_2'))
    await expect(ApprovalDetailPage({ params: Promise.resolve({ id: 'appr_1' }) })).rejects.toThrow('NEXT_REDIRECT:/approvals')
  })
})
