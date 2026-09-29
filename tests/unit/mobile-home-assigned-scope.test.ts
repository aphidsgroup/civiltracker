import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for `/mobile/home` widening a field role to every site of its company.
 *
 * The page read the membership's `siteIds` itself and narrowed the site picker only when
 * that list was non-empty: a SITE_ENGINEER assigned solely as a site's engineer, or with
 * no assignment at all, got every active site of the company, and any `?siteId=` of them
 * drove the finance, labour and DPR tiles. It also ignored `assignedEngineerId` and
 * `engineerId`.
 *
 * Now the picker and the active site come from `assignedSiteWhere`, the one live-principal
 * scope every other field page and action uses. A requested site outside it falls back
 * to the first assigned site; a field role with no assignment reads no site data.
 *
 * `@/lib/permissions`, `@/lib/pages/tenant-page-access` and `@/lib/auth/site-mutation`
 * are real.
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
  prisma: {
    company: { findFirst: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findMany: vi.fn() },
    expense: { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    labourAttendance: { count: vi.fn() },
    labour: { count: vi.fn() },
    sitePhoto: { count: vi.fn() },
    payment: { aggregate: vi.fn() },
    dailyProgressReport: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('next/link', () => ({ default: () => null }))
vi.mock('@/components/mobile/PWAInstallBanner', () => ({ default: () => null }))
vi.mock('@/components/mobile/SiteSelectorClient', () => ({ default: () => null }))
vi.mock('@/components/ui/LiveClock', () => ({ default: () => null }))

const { default: MobileHome } = await import('@/app/(mobile)/mobile/home/page')

const ENGINEER_ID = 'user_site_engineer'
const SUPERVISOR_ID = 'user_supervisor'

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', name: 'Tower A', status: 'ACTIVE', deletedAt: null },
  { id: 'site_assigned', companyId: 'company_1', name: 'Assigned Tower', status: 'ACTIVE', deletedAt: null, assignedEngineerId: ENGINEER_ID },
  { id: 'site_engineer', companyId: 'company_1', name: 'Engineer Tower', status: 'ACTIVE', deletedAt: null, engineerId: SUPERVISOR_ID },
  { id: 'site_member', companyId: 'company_1', name: 'Member Tower', status: 'ACTIVE', deletedAt: null },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', status: 'ACTIVE', deletedAt: new Date('2026-01-01'), assignedEngineerId: ENGINEER_ID },
  { id: 'site_other', companyId: 'company_2', name: 'Other Tenant Tower', status: 'ACTIVE', deletedAt: null, assignedEngineerId: ENGINEER_ID },
]

const MEMBERS: Row[] = [
  { userId: ENGINEER_ID, companyId: 'company_1', isActive: true, siteIds: ['site_member', 'site_other', 'site_dead'] },
  { userId: SUPERVISOR_ID, companyId: 'company_1', isActive: false, siteIds: ['site_1'] },
  // An active membership with an empty assignment list.
  { userId: 'user_empty', companyId: 'company_1', isActive: true, siteIds: [] },
  // An admin whose membership happens to list sites keeps the whole company.
  { userId: 'user_company_admin', companyId: 'company_1', isActive: true, siteIds: ['site_member'] },
]

function principal(role: string, id = `user_${role.toLowerCase()}`) {
  return { id, name: `${role} Person`, email: `${id}@acme.test`, role, companyId: 'company_1', companyName: 'Acme' }
}

const P = <T,>(value: T) => Promise.resolve(value)

type Delegate = Record<string, ReturnType<typeof vi.fn>>

function calledReads() {
  return Object.entries(mocks.prisma as Record<string, Delegate>)
    .filter(([model]) => model !== 'company')
    .flatMap(([model, delegate]) => Object.entries(delegate).map(([op, fn]) => ({ name: `${model}.${op}`, fn })))
    .filter(({ fn }) => fn.mock.calls.length > 0)
    .map(({ name }) => name)
}

function wheres(fn: ReturnType<typeof vi.fn>) {
  return fn.mock.calls.map((call) => (call[0] as { where?: Row } | undefined)?.where)
}

async function listedSiteIds() {
  const rows = (await mocks.prisma.site.findMany.mock.results[0].value) as Row[]
  return rows.map((row) => row.id).sort()
}

/** Site ids of every per-site tile read. */
function tileSiteIds() {
  const tiles = [
    mocks.prisma.expense.aggregate, mocks.prisma.expense.count, mocks.prisma.expense.findMany,
    mocks.prisma.labourAttendance.count, mocks.prisma.labour.count, mocks.prisma.sitePhoto.count,
    mocks.prisma.payment.aggregate, mocks.prisma.dailyProgressReport.findFirst,
  ]
  return [...new Set(tiles.flatMap(wheres).map((where) => where?.siteId))]
}

beforeEach(() => {
  vi.clearAllMocks()
  // The JWT claims an admin of another tenant; only the live principal may decide.
  mocks.auth.mockResolvedValue({ user: { id: 'jwt_user', companyId: 'company_jwt', role: 'COMPANY_ADMIN', siteIds: ['site_1'] } })
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: null })
  mocks.prisma.site.findMany.mockImplementation(inMemoryDelegate(SITES).findMany)
  mocks.prisma.companyMember.findFirst.mockImplementation(inMemoryDelegate(MEMBERS).findFirst)

  mocks.prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
  mocks.prisma.expense.count.mockResolvedValue(0)
  mocks.prisma.expense.findMany.mockResolvedValue([])
  mocks.prisma.labourAttendance.count.mockResolvedValue(0)
  mocks.prisma.labour.count.mockResolvedValue(0)
  mocks.prisma.sitePhoto.count.mockResolvedValue(0)
  mocks.prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
  mocks.prisma.dailyProgressReport.findFirst.mockResolvedValue(null)
})

describe('MobileHome assigned-site scope', () => {
  it('offers a SITE_ENGINEER only its assignedEngineer and active-membership live sites of the live company', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    await MobileHome({ searchParams: P({}) })

    expect(await listedSiteIds()).toEqual(['site_assigned', 'site_member'])
    expect(wheres(mocks.prisma.companyMember.findFirst)).toEqual([{ userId: ENGINEER_ID, companyId: 'company_1', isActive: true }])
    expect(JSON.stringify(wheres(mocks.prisma.site.findMany))).not.toContain('company_jwt')
  })

  it('opens to a SITE_ENGINEER a site it is only the assignedEngineer of', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    await MobileHome({ searchParams: P({ siteId: 'site_assigned' }) })

    expect(tileSiteIds()).toEqual(['site_assigned'])
  })

  it('offers a SUPERVISOR the site it is the engineer of, never one named by its deactivated membership', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR'))

    await MobileHome({ searchParams: P({ siteId: 'site_1' }) })

    expect(await listedSiteIds()).toEqual(['site_engineer'])
    expect(tileSiteIds()).toEqual(['site_engineer'])
  })

  it.each(['site_1', 'site_dead', 'site_other'])('never reads the tiles of the unassigned, deleted or foreign site %s asked for by a field role', async (siteId) => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))

    await MobileHome({ searchParams: P({ siteId }) })

    expect(tileSiteIds()).not.toContain(siteId)
  })

  it.each([
    ['an empty active membership', 'user_empty'],
    ['no membership row', 'user_nobody'],
  ])('does not widen a field role with %s to the company, and reads no site tiles', async (_label, id) => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER', id))

    await MobileHome({ searchParams: P({ siteId: 'site_1' }) })

    expect(await listedSiteIds()).toEqual([])
    expect(tileSiteIds()).toEqual([])
    expect(calledReads().sort()).toEqual(['companyMember.findFirst', 'site.findMany'])
  })

  it('offers an admin every active live site of the live company, with no assignment narrowing', async () => {
    await MobileHome({ searchParams: P({ siteId: 'site_1' }) })

    expect(await listedSiteIds()).toEqual(['site_1', 'site_assigned', 'site_engineer', 'site_member'])
    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
    expect(tileSiteIds()).toEqual(['site_1'])
  })

  it('sends a SUPER_ADMIN to the platform dashboard before any read', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root', name: 'Root', email: 'root@platform.test', role: 'SUPER_ADMIN' })

    await expect(MobileHome({ searchParams: P({}) })).rejects.toThrow('NEXT_REDIRECT:/super-admin/dashboard')
    expect(calledReads()).toEqual([])
    expect(mocks.prisma.company.findFirst).not.toHaveBeenCalled()
  })

  it('turns a CLIENT away before any read', async () => {
    mocks.requireUser.mockResolvedValue(principal('CLIENT'))

    await expect(MobileHome({ searchParams: P({}) })).rejects.toThrow(/NEXT_REDIRECT|NEXT_NOT_FOUND/)
    expect(calledReads()).toEqual([])
  })

  it('refuses a revoked principal and never consults the JWT', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    await expect(MobileHome({ searchParams: P({}) })).rejects.toThrow(/UNAUTHORIZED/)
    expect(mocks.auth).not.toHaveBeenCalled()
    expect(calledReads()).toEqual([])
  })
})
