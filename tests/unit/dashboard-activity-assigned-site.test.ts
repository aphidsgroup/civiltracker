import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for `/activity` widening a field role to every live site of its company.
 *
 * The page gated on the live principal but derived its site ids from
 * `liveCompanySiteWhere`, so a SITE_ENGINEER or SUPERVISOR — bound everywhere else to the
 * sites it is the engineer of or that its active membership lists — read the expense,
 * DPR, attendance, photo and checklist feeds of every other site of the company.
 *
 * Now the site ids come from `assignedSiteWhere(gate.access)` and every feed is bound to
 * exactly those ids. Privileged roles keep every live site of their company; a field role
 * with no active assignment reads no feed at all.
 *
 * `@/lib/permissions`, `@/lib/pages/tenant-page-access` and `@/lib/auth/site-mutation`
 * are real; the feeds are in-memory delegates that honour their `where`.
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
    expense: { findMany: vi.fn() },
    dailyProgressReport: { findMany: vi.fn() },
    labourAttendance: { findMany: vi.fn() },
    contractorAttendance: { findMany: vi.fn() },
    sitePhoto: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('next/link', () => ({ default: () => null }))

const { default: DashboardActivityPage } = await import('@/app/(dashboard)/activity/page')

const ENGINEER_ID = 'user_site_engineer'
const SUPERVISOR_ID = 'user_supervisor'
const NOW = new Date('2026-09-20T06:00:00.000Z')

const SITES: Row[] = [
  { id: 'site_assigned', companyId: 'company_1', name: 'Assigned Tower', deletedAt: null, assignedEngineerId: ENGINEER_ID },
  { id: 'site_member', companyId: 'company_1', name: 'Member Tower', deletedAt: null },
  { id: 'site_engineer', companyId: 'company_1', name: 'Supervised Tower', deletedAt: null, engineerId: SUPERVISOR_ID },
  { id: 'site_hidden', companyId: 'company_1', name: 'Hidden Tower', deletedAt: null },
  { id: 'site_dead', companyId: 'company_1', name: 'Deleted Tower', deletedAt: NOW, assignedEngineerId: ENGINEER_ID },
  { id: 'site_other', companyId: 'company_2', name: 'Foreign Tower', deletedAt: null, assignedEngineerId: ENGINEER_ID },
]

const MEMBERS: Row[] = [
  { userId: ENGINEER_ID, companyId: 'company_1', isActive: true, siteIds: ['site_member', 'site_other', 'site_dead'] },
  // A deactivated membership still names a site; it must grant nothing.
  { userId: SUPERVISOR_ID, companyId: 'company_1', isActive: false, siteIds: ['site_hidden'] },
  { userId: 'user_revoked_engineer', companyId: 'company_1', isActive: false, siteIds: ['site_hidden', 'site_assigned'] },
]

const siteById = (id: string) => SITES.find((site) => site.id === id) ?? null
const author = { name: 'Author' }

/** One record of every feed on every site, each tagged with its site name so the render proves it. */
function feedRows(build: (site: Row) => Row) {
  return SITES.map((site) => ({ siteId: site.id, companyId: site.companyId, site, createdAt: NOW, ...build(site) }))
}

const EXPENSES = feedRows((site) => ({ id: `exp_${site.id}`, amount: 100, category: 'MISC', deletedAt: null, createdBy: author }))
const DPRS = feedRows((site) => ({ id: `dpr_${site.id}`, createdBy: author }))
const LABOUR_ATTENDANCE = feedRows((site) => ({
  id: `att_${site.id}`, date: NOW, status: 'PRESENT', startTime: null,
  labour: { siteId: site.id, companyId: site.companyId, name: `Worker of ${site.name}`, trade: 'Mason', site },
}))
const CONTRACTOR_ATTENDANCE = feedRows((site) => ({ id: `con_${site.id}`, date: NOW, labourCount: 3, contractorType: 'Civil', subcontractor: { name: `Crew of ${site.name}` } }))
const PHOTOS = feedRows((site) => ({ id: `photo_${site.id}`, caption: `Photo of ${site.name}` }))
const CHECKLIST_LOGS: Row[] = SITES.map((site) => ({
  id: `log_${site.id}`, companyId: site.companyId, recordId: site.id, module: 'CHECKLIST', action: 'TICK',
  createdAt: NOW, after: { taskName: `Task of ${site.name}` }, user: author,
}))

const labourRelation = (row: Row, key: string) => (key === 'labour' ? (row.labour as Row) : undefined)

function principal(role: string, id = `user_${role.toLowerCase()}`) {
  return { id, name: `${role} Person`, email: `${id}@acme.test`, role, companyId: 'company_1' }
}

const FEEDS = [
  mocks.prisma.expense.findMany,
  mocks.prisma.dailyProgressReport.findMany,
  mocks.prisma.labourAttendance.findMany,
  mocks.prisma.contractorAttendance.findMany,
  mocks.prisma.sitePhoto.findMany,
  mocks.prisma.auditLog.findMany,
]

type Delegate = Record<string, ReturnType<typeof vi.fn>>

function dataReads() {
  return Object.entries(mocks.prisma as Record<string, Delegate>)
    .filter(([model]) => model !== 'company')
    .flatMap(([model, delegate]) => Object.entries(delegate).map(([op, fn]) => ({ name: `${model}.${op}`, fn })))
}

function calledReads() {
  return dataReads().filter(({ fn }) => fn.mock.calls.length > 0).map(({ name }) => name)
}

/** Site ids every feed returned rows for. */
async function feedSiteIds() {
  const ids = new Set<string>()
  for (const fn of FEEDS) {
    for (const result of fn.mock.results) {
      for (const row of (await result.value) as Row[]) ids.add((row.siteId ?? row.recordId) as string)
    }
  }
  return [...ids].sort()
}

async function render() {
  return renderToStaticMarkup((await DashboardActivityPage({ searchParams: Promise.resolve({}) })) as ReactElement)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: 'jwt_user', companyId: 'company_jwt', role: 'COMPANY_ADMIN' } })
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: null })
  mocks.prisma.companyMember.findFirst.mockImplementation(inMemoryDelegate(MEMBERS).findFirst)
  mocks.prisma.site.findMany.mockImplementation(inMemoryDelegate(SITES).findMany)
  mocks.prisma.expense.findMany.mockImplementation(inMemoryDelegate(EXPENSES).findMany)
  mocks.prisma.dailyProgressReport.findMany.mockImplementation(inMemoryDelegate(DPRS).findMany)
  mocks.prisma.labourAttendance.findMany.mockImplementation(inMemoryDelegate(LABOUR_ATTENDANCE, labourRelation).findMany)
  mocks.prisma.contractorAttendance.findMany.mockImplementation(inMemoryDelegate(CONTRACTOR_ATTENDANCE).findMany)
  mocks.prisma.sitePhoto.findMany.mockImplementation(inMemoryDelegate(PHOTOS).findMany)
  mocks.prisma.auditLog.findMany.mockImplementation(inMemoryDelegate(CHECKLIST_LOGS).findMany)
})

describe('DashboardActivityPage under the assigned-site scope', () => {
  it('reads a SITE_ENGINEER only its assignedEngineer and active-membership live sites of the live company', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER', ENGINEER_ID))

    const html = await render()

    expect(mocks.prisma.companyMember.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: ENGINEER_ID, companyId: 'company_1', isActive: true },
    }))
    expect(await feedSiteIds()).toEqual(['site_assigned', 'site_member'])
    // SITE_ENGINEER holds no expenses.view; every feed it may read is queried, and only
    // with its assigned site ids.
    expect(mocks.prisma.expense.findMany).not.toHaveBeenCalled()
    const queried = FEEDS.filter((fn) => fn.mock.calls.length > 0)
    expect(queried).toHaveLength(FEEDS.length - 1)
    for (const fn of queried) {
      const where = JSON.stringify(fn.mock.calls[0][0].where)
      expect(where).toContain('site_assigned')
      expect(where).not.toContain('site_hidden')
      expect(where).not.toContain('site_engineer')
    }
    expect(html).toContain('Assigned Tower')
    expect(html).toContain('Member Tower')
    for (const name of ['Hidden Tower', 'Supervised Tower', 'Deleted Tower', 'Foreign Tower']) expect(html).not.toContain(name)
  })

  it('reads a SUPERVISOR only the site it is the engineer of, ignoring its deactivated membership', async () => {
    mocks.requireUser.mockResolvedValue(principal('SUPERVISOR', SUPERVISOR_ID))

    const html = await render()

    expect(await feedSiteIds()).toEqual(['site_engineer'])
    expect(html).toContain('Supervised Tower')
    expect(html).not.toContain('Hidden Tower')
    expect(html).not.toContain('Assigned Tower')
  })

  it('narrows even an explicitly requested feed to the assigned sites', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER', ENGINEER_ID))

    const html = renderToStaticMarkup((await DashboardActivityPage({ searchParams: Promise.resolve({ type: 'PHOTO' }) })) as ReactElement)

    expect(mocks.prisma.sitePhoto.findMany.mock.calls[0][0].where).toMatchObject({ siteId: { in: ['site_assigned', 'site_member'] }, companyId: 'company_1' })
    expect(html).not.toContain('Photo of Hidden Tower')
  })

  it.each([
    ['with no assignment at all', 'user_unassigned'],
    ['whose membership is deactivated', 'user_revoked_engineer'],
  ])('reads no feed for a SITE_ENGINEER %s, never the whole company', async (_label, id) => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER', id))

    const html = await render()

    expect(calledReads()).toEqual(['companyMember.findFirst', 'site.findMany'])
    for (const fn of FEEDS) expect(fn).not.toHaveBeenCalled()
    expect(html).toContain('No activities found')
  })

  it('reads nothing for a revoked principal', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    await expect(render()).rejects.toThrow(/UNAUTHORIZED/)
    expect(calledReads()).toEqual([])
    expect(mocks.prisma.company.findFirst).not.toHaveBeenCalled()
  })

  it('reads no data for a field role whose SITES module is disabled', async () => {
    mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER', ENGINEER_ID))
    mocks.prisma.company.findFirst.mockResolvedValue({ modulesJson: [] })

    await expect(render()).rejects.toThrow(/NEXT_REDIRECT|NEXT_NOT_FOUND/)
    expect(calledReads()).toEqual([])
  })

  it('keeps a COMPANY_ADMIN on every live site of its company, with no assignment lookup', async () => {
    const html = await render()

    expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.site.findMany.mock.calls[0][0].where).toEqual({ companyId: 'company_1', deletedAt: null })
    expect(await feedSiteIds()).toEqual(['site_assigned', 'site_engineer', 'site_hidden', 'site_member'])
    expect(html).toContain('Hidden Tower')
    expect(html).not.toContain('Deleted Tower')
    expect(html).not.toContain('Foreign Tower')
  })
})
