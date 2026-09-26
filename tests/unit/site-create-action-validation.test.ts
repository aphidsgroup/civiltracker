import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `createSite` (src/actions/sites.ts) is an exported Server Action, so it is a public POST
 * endpoint whatever the UI does. It checked `sites.create` but never the SITES module,
 * and persisted its untyped payload with `Number(...)` / `new Date(...)` coercion: a
 * negative or `NaN` budget, an `Invalid Date`, a non-string name, an arbitrary project
 * type or a user id of another tenant all reached `site.create`.
 *
 * Now the live principal needs `sites.create` with SITES on before the payload is even
 * parsed, and the payload is validated explicitly — exact field set, bounded strings,
 * known project types, finite non-negative numbers, real dates and assignees that are
 * active members of the live company — before any write.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module` and `@/lib/auth/site-mutation` are real.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  logActivity: vi.fn(),
  prisma: {
    company: { findUnique: vi.fn() },
    companyMember: { findFirst: vi.fn(), findMany: vi.fn() },
    site: { findFirst: vi.fn(), create: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('@/lib/audit', () => ({ logActivity: mocks.logActivity }))

const { createSite } = await import('@/actions/sites')

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId }
}

/** Active members of company_1; user_foreign belongs to another tenant. */
const MEMBERS = new Set(['user_pm', 'user_engineer'])

const VALID = {
  name: 'Tower A',
  location: 'Chennai',
  address: '12 Anna Salai',
  clientName: 'Acme Client',
  clientPhone: '+91 98765 43210',
  clientEmail: 'client@acme.test',
  mapLink: 'https://maps.example.test/tower-a',
  projectType: 'RESIDENTIAL',
  contractType: 'Lump sum',
  areaSqft: '12500.5',
  floors: '12',
  budget: '5000000',
  contractValue: 6000000,
  startDate: '2026-10-01',
  targetEndDate: '2027-10-01',
  assignedPmId: 'user_pm',
  assignedEngineerId: 'user_engineer',
}

let modules: unknown

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['SITES']
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findUnique.mockImplementation(async (args: { include?: unknown }) =>
    args.include
      ? { id: 'company_1', status: 'ACTIVE', siteLimit: 10, _count: { sites: 1 } }
      : { modulesJson: modules, status: 'ACTIVE' }
  )
  mocks.prisma.companyMember.findMany.mockImplementation(
    async ({ where }: { where: { companyId: string; isActive: boolean; userId: { in: string[] } } }) =>
      where.companyId === 'company_1' && where.isActive
        ? where.userId.in.filter((id) => MEMBERS.has(id)).map((userId) => ({ userId }))
        : []
  )
  mocks.prisma.site.findFirst.mockResolvedValue(null)
  mocks.prisma.site.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'site_new', ...data }))
})

function expectNoWrites() {
  expect(mocks.prisma.site.create).not.toHaveBeenCalled()
  expect(mocks.logActivity).not.toHaveBeenCalled()
}

describe('createSite gate', () => {
  it.each([
    ['listed without SITES', ['EXPENSES']],
    ['switched off in the module object', { sites: false }],
  ])('refuses before parsing or any tenant read when SITES is %s', async (_label, value) => {
    modules = value

    await expect(createSite(VALID)).rejects.toThrow(/Module SITES is not enabled/)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.companyMember.findMany).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('refuses a disabled module even for a malformed payload, so the gate runs first', async () => {
    modules = []

    await expect(createSite({ name: 42 })).rejects.toThrow(/Module SITES is not enabled/)
    expectNoWrites()
  })

  it('refuses a role without sites.create before any read', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    await expect(createSite(VALID)).rejects.toThrow(/sites\.create/)
    expect(mocks.prisma.company.findUnique).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('refuses a SUPER_ADMIN, which has no tenant to create the site in', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root_1', name: 'Root', email: 'root@x.test', role: 'SUPER_ADMIN' })

    await expect(createSite(VALID)).rejects.toThrow()
    expectNoWrites()
  })
})

describe('createSite input validation', () => {
  it.each([
    ['a null payload', null],
    ['a string payload', 'Tower A'],
    ['an array payload', [VALID]],
    ['a missing name', { ...VALID, name: undefined }],
    ['a blank name', { ...VALID, name: '   ' }],
    ['a non-string name', { ...VALID, name: { toString: () => 'x' } }],
    ['a name with no sluggable characters', { ...VALID, name: '!!!' }],
    ['an over-long name', { ...VALID, name: 'x'.repeat(500) }],
    ['a missing location', { ...VALID, location: undefined }],
    ['a numeric location', { ...VALID, location: 600001 }],
    ['an unknown project type', { ...VALID, projectType: 'CASINO' }],
    ['a negative budget', { ...VALID, budget: '-1' }],
    ['a non-numeric budget', { ...VALID, budget: 'lots' }],
    ['an infinite budget', { ...VALID, budget: Infinity }],
    ['a budget beyond the column precision', { ...VALID, budget: 1e15 }],
    ['a NaN area', { ...VALID, areaSqft: NaN }],
    ['a fractional floor count', { ...VALID, floors: '2.5' }],
    ['a negative floor count', { ...VALID, floors: -3 }],
    ['a negative contract value', { ...VALID, contractValue: -10 }],
    ['an impossible start date', { ...VALID, startDate: '2026-02-30' }],
    ['a free-text start date', { ...VALID, startDate: 'next week' }],
    ['an end date before the start date', { ...VALID, targetEndDate: '2026-01-01' }],
    ['a malformed client email', { ...VALID, clientEmail: 'not-an-email' }],
    ['a non-http map link', { ...VALID, mapLink: 'javascript:alert(1)' }],
    ['a smuggled status', { ...VALID, status: 'COMPLETED' }],
    ['a smuggled company', { ...VALID, companyId: 'company_2' }],
    ['a smuggled spent figure', { ...VALID, spent: 99 }],
    ['a non-string assignee', { ...VALID, assignedPmId: 7 }],
  ])('rejects %s without writing', async (_label, input) => {
    await expect(createSite(input)).rejects.toThrow(/Invalid site/)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it.each([
    ['a PM of another tenant', { assignedPmId: 'user_foreign' }],
    ['an engineer of another tenant', { assignedEngineerId: 'user_foreign' }],
  ])('refuses %s without writing', async (_label, overrides) => {
    await expect(createSite({ ...VALID, ...overrides })).rejects.toThrow(/Invalid site: assignee/)
    expectNoWrites()
  })

  it('persists exactly the validated fields with the server-owned status', async () => {
    await expect(createSite(VALID)).resolves.toEqual({ success: true, siteId: 'site_new' })

    expect(mocks.prisma.site.create).toHaveBeenCalledTimes(1)
    expect(mocks.prisma.site.create.mock.calls[0][0].data).toEqual({
      companyId: 'company_1',
      name: 'Tower A',
      slug: 'tower-a',
      location: 'Chennai',
      address: '12 Anna Salai',
      clientName: 'Acme Client',
      clientPhone: '+91 98765 43210',
      clientEmail: 'client@acme.test',
      mapLink: 'https://maps.example.test/tower-a',
      projectType: 'RESIDENTIAL',
      contractType: 'Lump sum',
      areaSqft: 12500.5,
      floors: 12,
      budget: 5000000,
      contractValue: 6000000,
      startDate: new Date('2026-10-01'),
      targetEndDate: new Date('2027-10-01'),
      assignedPmId: 'user_pm',
      assignedEngineerId: 'user_engineer',
      status: 'PLANNING',
      createdById: 'user_company_admin',
    })
    expect(mocks.logActivity).toHaveBeenCalledTimes(1)
  })

  it('accepts the minimal payload and defaults the optional fields as before', async () => {
    await expect(createSite({ name: '  Tower B ', location: ' Pune ', budget: '', floors: null })).resolves.toEqual({
      success: true,
      siteId: 'site_new',
    })

    expect(mocks.prisma.companyMember.findMany).not.toHaveBeenCalled()
    expect(mocks.prisma.site.create.mock.calls[0][0].data).toEqual({
      companyId: 'company_1',
      name: 'Tower B',
      slug: 'tower-b',
      location: 'Pune',
      address: null,
      clientName: null,
      clientPhone: null,
      clientEmail: null,
      mapLink: null,
      projectType: null,
      contractType: null,
      areaSqft: null,
      floors: null,
      budget: 0,
      contractValue: null,
      startDate: null,
      targetEndDate: null,
      assignedPmId: null,
      assignedEngineerId: null,
      status: 'PLANNING',
      createdById: 'user_company_admin',
    })
  })
})
