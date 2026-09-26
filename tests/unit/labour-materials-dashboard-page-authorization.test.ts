import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { inMemoryDelegate, matchesWhere } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'

/**
 * Regression for three dashboard pages that read before any live guard.
 *
 * `/labour/salary`, `/labour/attendance` and `/materials/requests` called `requireUser`
 * and then read every salary run, worker (with phone and wage), attendance advance and
 * purchase request of the company: no permission, no module, no site scope. A demoted
 * role, a company with the module switched off, or a SITE_ENGINEER assigned to one site
 * saw the whole company, and deleted sites stayed visible.
 *
 * Now each page runs `resolveTenantPageAccess` before its first read, then scopes every
 * read to the principal's `assignedSiteWhere`: live sites of exactly the live company,
 * narrowed for a field role to the sites it is assigned to.
 *
 * `@/lib/permissions`, `@/lib/pages/tenant-page-access` and `@/lib/auth/site-mutation`
 * are real.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  attendanceProps: vi.fn(),
  prisma: {
    company: { findFirst: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    site: { findFirst: vi.fn(), findMany: vi.fn() },
    salaryRun: { findMany: vi.fn() },
    labour: { findMany: vi.fn() },
    purchaseRequest: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('next/link', () => ({ default: ({ children }: { children?: ReactNode }) => children }))
vi.mock('@/actions/mobile-labour', () => ({ addMobileWorkerAction: vi.fn(), updateWorkerAction: vi.fn(), saveMobileAttendanceAction: vi.fn() }))
vi.mock('@/components/labour/AttendanceRegisterClient', () => ({
  default: (props: unknown) => {
    mocks.attendanceProps(props)
    return null
  },
}))

const { default: SalaryPage } = await import('@/app/(dashboard)/labour/salary/page')
const { default: AttendancePage } = await import('@/app/(dashboard)/labour/attendance/page')
const { default: RequestsPage } = await import('@/app/(dashboard)/materials/requests/page')

const ENGINEER_ID = 'user_site_engineer'
const SUBCONTRACTOR_ID = 'user_subcontractor_assigned'
const RECENTLY = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
// The register day exactly as the page derives it from `?date=2026-09-20`.
const DAY = new Date('2026-09-20')
DAY.setHours(0, 0, 0, 0)

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', name: 'Tower A', deletedAt: null },
  { id: 'site_assigned', companyId: 'company_1', name: 'Assigned Tower', deletedAt: null, assignedEngineerId: ENGINEER_ID },
  { id: 'site_member', companyId: 'company_1', name: 'Member Tower', deletedAt: null },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone Tower', deletedAt: RECENTLY, assignedEngineerId: ENGINEER_ID },
  { id: 'site_other', companyId: 'company_2', name: 'Other Tenant Tower', deletedAt: null, assignedEngineerId: ENGINEER_ID },
]

const MEMBERS: Row[] = [
  { userId: ENGINEER_ID, companyId: 'company_1', isActive: true, siteIds: ['site_member', 'site_other', 'site_dead'] },
  { userId: SUBCONTRACTOR_ID, companyId: 'company_1', isActive: true, siteIds: ['site_member', 'site_other', 'site_dead'] },
  // A revoked membership lends no sites.
  { userId: 'user_subcontractor_revoked', companyId: 'company_1', isActive: false, siteIds: ['site_1', 'site_member'] },
]

const bySite: RelationResolver = (row, key) => (key === 'site' ? SITES.find((site) => site.id === row.siteId) ?? null : undefined)

const SALARY_RUNS: Row[] = [
  { id: 'run_company', companyId: 'company_1', siteId: null },
  { id: 'run_site_1', companyId: 'company_1', siteId: 'site_1' },
  { id: 'run_assigned', companyId: 'company_1', siteId: 'site_assigned' },
  { id: 'run_dead', companyId: 'company_1', siteId: 'site_dead' },
  { id: 'run_foreign_site', companyId: 'company_1', siteId: 'site_other' },
  { id: 'run_other_tenant', companyId: 'company_2', siteId: null },
].map((run) => ({ ...run, periodStart: DAY, periodEnd: DAY, createdAt: DAY, runType: 'WEEKLY', status: 'DRAFT', totalGross: 100, totalAdvance: 10, totalNet: 90 }))

const LABOUR: Row[] = [
  { id: 'lab_1', companyId: 'company_1', siteId: 'site_1', name: 'Company Worker', phone: '900001', isActive: true },
  { id: 'lab_assigned', companyId: 'company_1', siteId: 'site_assigned', name: 'Assigned Worker', phone: '900002', isActive: true },
  { id: 'lab_member', companyId: 'company_1', siteId: 'site_member', name: 'Member Worker', phone: '900003', isActive: true },
  { id: 'lab_dead', companyId: 'company_1', siteId: 'site_dead', name: 'Dead Site Worker', phone: '900004', isActive: true },
  { id: 'lab_other', companyId: 'company_2', siteId: 'site_other', name: 'Other Tenant Worker', phone: '900005', isActive: true },
].map((worker) => ({ ...worker, trade: 'HELPER', dailyWage: 700 }))

const ATTENDANCE: Row[] = [
  { id: 'att_assigned', labourId: 'lab_assigned', siteId: 'site_assigned', date: DAY, status: 'PRESENT', overtimeHours: 1, advance: 50 },
  // Logged while the worker was deployed on a site the engineer is not assigned to.
  { id: 'att_member_elsewhere', labourId: 'lab_member', siteId: 'site_1', date: DAY, status: 'ABSENT', overtimeHours: 4, advance: 999 },
]

const REQUESTS: Row[] = [
  { id: 'pr_1', companyId: 'company_1', siteId: 'site_1', description: 'Company cement' },
  { id: 'pr_assigned', companyId: 'company_1', siteId: 'site_assigned', description: 'Assigned steel' },
  { id: 'pr_member', companyId: 'company_1', siteId: 'site_member', description: 'Member sand' },
  { id: 'pr_dead', companyId: 'company_1', siteId: 'site_dead', description: 'Dead site bricks' },
  { id: 'pr_foreign_site', companyId: 'company_1', siteId: 'site_other', description: 'Foreign site pipes' },
  { id: 'pr_other', companyId: 'company_2', siteId: 'site_other', description: 'Other tenant tiles' },
].map((request) => ({ ...request, quantity: 1, unit: 'bag', status: 'PENDING', urgency: 'Normal', createdAt: DAY }))

function principal(role: string, extra: Row = {}) {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId: 'company_1', ...extra }
}

const engineer = () => principal('SITE_ENGINEER', { id: ENGINEER_ID })
const P = <T,>(value: T) => Promise.resolve(value)

type Delegate = Record<string, ReturnType<typeof vi.fn>>

function dataReads(): string[] {
  return Object.entries(mocks.prisma as Record<string, Delegate>)
    .filter(([model]) => model !== 'company')
    .flatMap(([model, delegate]) => Object.entries(delegate).map(([op, fn]) => ({ name: `${model}.${op}`, fn })))
    .filter(({ fn }) => fn.mock.calls.length > 0)
    .map(({ name }) => name)
}

async function ids(fn: ReturnType<typeof vi.fn>) {
  return ((await fn.mock.results[0].value) as Row[]).map((row) => row.id).sort()
}

type Page = { name: string; path: string; run: () => Promise<unknown> }

const PAGES: Page[] = [
  { name: 'salary runs', path: '/labour/salary', run: () => SalaryPage() },
  { name: 'attendance register', path: '/labour/attendance', run: () => AttendancePage({ searchParams: P({ date: '2026-09-20' }) }) },
  { name: 'purchase requests', path: '/materials/requests', run: () => RequestsPage() },
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: null })

  const sites = inMemoryDelegate(SITES)
  mocks.prisma.site.findFirst.mockImplementation(sites.findFirst)
  mocks.prisma.site.findMany.mockImplementation(sites.findMany)
  mocks.prisma.companyMember.findFirst.mockImplementation(inMemoryDelegate(MEMBERS).findFirst)
  mocks.prisma.salaryRun.findMany.mockImplementation(inMemoryDelegate(SALARY_RUNS).findMany)
  mocks.prisma.purchaseRequest.findMany.mockImplementation(inMemoryDelegate(REQUESTS, bySite).findMany)
  // Workers with the `site` and the date-filtered `attendance` includes the page asks for.
  mocks.prisma.labour.findMany.mockImplementation(async (args: { where?: Row; include?: { attendance?: { where?: Row } } }) =>
    LABOUR.filter((worker) => matchesWhere(worker, args.where, bySite)).map((worker) => ({
      ...worker,
      site: bySite(worker, 'site'),
      attendance: ATTENDANCE.filter((log) => log.labourId === worker.id && matchesWhere(log, args.include?.attendance?.where)),
    })),
  )
})

describe.each(PAGES)('$name page gate', (page) => {
  it('lets a revoked or deactivated principal fail before any read', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    await expect(page.run()).rejects.toThrow('UNAUTHORIZED')
    expect(mocks.prisma.company.findFirst).not.toHaveBeenCalled()
    expect(dataReads()).toEqual([])
  })

  it('sends a principal with no company context to /login before any read', async () => {
    mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN', { companyId: undefined }))

    await expect(page.run()).rejects.toThrow('NEXT_REDIRECT:/login')
    expect(dataReads()).toEqual([])
  })

  it('sends SUPER_ADMIN to the platform dashboard without reading any tenant', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root', name: 'Root', email: 'root@x.test', role: 'SUPER_ADMIN' })

    await expect(page.run()).rejects.toThrow('NEXT_REDIRECT:/super-admin/dashboard')
    expect(mocks.prisma.company.findFirst).not.toHaveBeenCalled()
    expect(dataReads()).toEqual([])
  })

  it('sends a CLIENT to its portal before any read', async () => {
    mocks.requireUser.mockResolvedValue(principal('CLIENT'))

    await expect(page.run()).rejects.toThrow('NEXT_REDIRECT:/client-portal')
    expect(mocks.prisma.company.findFirst).not.toHaveBeenCalled()
    expect(dataReads()).toEqual([])
  })

  it('refuses a live company whose module is switched off, reading nothing but the modules', async () => {
    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: { labour: false, materials: false } })

    await expect(page.run()).rejects.toThrow('NEXT_REDIRECT:/dashboard')
    expect(mocks.prisma.company.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'company_1', deletedAt: null } }))
    expect(dataReads()).toEqual([])
  })

  it('refuses a deleted company before any read', async () => {
    mocks.prisma.company.findFirst.mockResolvedValue(null)

    await expect(page.run()).rejects.toThrow('NEXT_REDIRECT:/login')
    expect(dataReads()).toEqual([])
  })
})

describe('salary runs page', () => {
  it.each([
    ['PROJECT_MANAGER', '/dashboard'],
    ['PURCHASE_MANAGER', '/dashboard'],
    ['SITE_ENGINEER', '/mobile/home'],
    ['SUPERVISOR', '/mobile/home'],
  ])('turns a live %s without salary.view away before any read, whatever the JWT said', async (role, home) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    await expect(SalaryPage()).rejects.toThrow(`NEXT_REDIRECT:${home}`)
    expect(mocks.prisma.company.findFirst).not.toHaveBeenCalled()
    expect(dataReads()).toEqual([])
  })

  it('shows an ACCOUNTANT company-wide runs and runs of live company sites, never deleted, foreign-site or other-tenant runs', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))

    const html = renderToStaticMarkup(await SalaryPage() as ReactElement)

    expect(await ids(mocks.prisma.salaryRun.findMany)).toEqual(['run_assigned', 'run_company', 'run_site_1'])
    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
    expect(html).toContain('Tower A')
    expect(html).not.toContain('Gone Tower')
    expect(html).not.toContain('Other Tenant Tower')
  })
})

describe('attendance register page', () => {
  it('turns a live ACCOUNTANT (no attendance permission) away before any read', async () => {
    mocks.requireUser.mockResolvedValue(principal('ACCOUNTANT'))

    await expect(AttendancePage({ searchParams: P({}) })).rejects.toThrow('NEXT_REDIRECT:/dashboard')
    expect(mocks.prisma.company.findFirst).not.toHaveBeenCalled()
    expect(dataReads()).toEqual([])
  })

  async function register() {
    renderToStaticMarkup(await AttendancePage({ searchParams: P({ date: '2026-09-20' }) }) as ReactElement)
    return mocks.attendanceProps.mock.calls[0][0] as {
      initialLabour: { id: string; phone: string | null; advance: number; overtimeHours: number; status: string }[]
      sites: { id: string }[]
    }
  }

  it('shows a SITE_ENGINEER only the workers, sites and attendance of its assigned live sites', async () => {
    mocks.requireUser.mockResolvedValue(engineer())

    const props = await register()

    expect(props.initialLabour.map((worker) => worker.id).sort()).toEqual(['lab_assigned', 'lab_member'])
    expect(props.sites.map((site) => site.id).sort()).toEqual(['site_assigned', 'site_member'])
    expect(props.initialLabour.map((worker) => worker.phone)).not.toContain('900001')
    const assigned = props.initialLabour.find((worker) => worker.id === 'lab_assigned')!
    expect(assigned).toMatchObject({ advance: 50, overtimeHours: 1, status: 'PRESENT' })
    // A log recorded on a site the engineer is not assigned to never surfaces its values.
    const member = props.initialLabour.find((worker) => worker.id === 'lab_member')!
    expect(member).toMatchObject({ advance: 0, overtimeHours: 0 })
  })

  it('shows a SITE_ENGINEER with no assignment nothing, never the company roster', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER', { id: 'user_unassigned' }))

    const props = await register()

    expect(props.initialLabour).toEqual([])
    expect(props.sites).toEqual([])
  })

  // SUBCONTRACTOR holds attendance.mark, so it passes the gate; it must not read the
  // company roster, phones, wages or attendance outside its assigned live site.
  it.each(['user_subcontractor', 'user_subcontractor_revoked'])(
    'shows an unassigned SUBCONTRACTOR (%s) no worker, site, phone, wage or attendance',
    async (id) => {
      mocks.requireUser.mockResolvedValue(principal('SUBCONTRACTOR', { id }))

      const props = await register()

      expect(props.initialLabour).toEqual([])
      expect(props.sites).toEqual([])
      expect(await ids(mocks.prisma.site.findMany)).toEqual([])
      expect(await ids(mocks.prisma.labour.findMany)).toEqual([])
      expect(mocks.prisma.companyMember.findFirst).toHaveBeenCalledWith({
        where: { userId: id, companyId: 'company_1', isActive: true },
        select: { siteIds: true },
      })
    },
  )

  it('shows an assigned SUBCONTRACTOR only its live assigned site, never deleted, foreign or company sites', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUBCONTRACTOR', { id: SUBCONTRACTOR_ID }))

    const props = await register()

    expect(props.sites.map((site) => site.id)).toEqual(['site_member'])
    expect(props.initialLabour.map((worker) => worker.id)).toEqual(['lab_member'])
    expect(props.initialLabour.map((worker) => worker.phone)).toEqual(['900003'])
    // The log recorded on site_1 is outside its scope and never lends its advance or overtime.
    expect(props.initialLabour[0]).toMatchObject({ advance: 0, overtimeHours: 0 })
  })

  it('shows an admin every live-site worker of exactly its company, not deleted-site or other-tenant workers', async () => {
    const props = await register()

    expect(props.initialLabour.map((worker) => worker.id).sort()).toEqual(['lab_1', 'lab_assigned', 'lab_member'])
    expect(props.sites.map((site) => site.id).sort()).toEqual(['site_1', 'site_assigned', 'site_member'])
    expect(props.initialLabour.find((worker) => worker.id === 'lab_member')).toMatchObject({ advance: 999, overtimeHours: 4 })
    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
  })
})

describe('purchase requests page', () => {
  it.each(['ACCOUNTANT', 'VENDOR', 'SUBCONTRACTOR'])('turns a live %s without materials.view away before any read', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    await expect(RequestsPage()).rejects.toThrow('NEXT_REDIRECT:')
    expect(mocks.prisma.company.findFirst).not.toHaveBeenCalled()
    expect(dataReads()).toEqual([])
  })

  it('shows a SITE_ENGINEER only requests of its assigned live sites', async () => {
    mocks.requireUser.mockResolvedValue(engineer())

    const html = renderToStaticMarkup(await RequestsPage() as ReactElement)

    expect(await ids(mocks.prisma.purchaseRequest.findMany)).toEqual(['pr_assigned', 'pr_member'])
    expect(html).not.toContain('Company cement')
    expect(html).not.toContain('Dead site bricks')
  })

  it('shows a SITE_ENGINEER with no assignment no requests at all', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER', { id: 'user_unassigned' }))

    await RequestsPage()

    expect(await ids(mocks.prisma.purchaseRequest.findMany)).toEqual([])
  })

  it('shows a PURCHASE_MANAGER every live-site request of exactly its company', async () => {
    mocks.requireUser.mockResolvedValue(principal('PURCHASE_MANAGER'))

    await RequestsPage()

    expect(await ids(mocks.prisma.purchaseRequest.findMany)).toEqual(['pr_1', 'pr_assigned', 'pr_member'])
    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
  })
})
