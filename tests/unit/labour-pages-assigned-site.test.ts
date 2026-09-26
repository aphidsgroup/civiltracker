import type { ReactElement, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'

/**
 * Regression for the `/labour`, `/labour/new` and `/labour/[id]/edit` pages reading
 * company-wide once past the permission gate.
 *
 * The pages bound every read to the live company only: the roster listed every worker of
 * the company with wages, attendance and advances booked on any site, the new/edit forms
 * offered every ACTIVE company site as a destination, and the edit page opened any worker
 * of the company by id and summed its attendance from every site. For a field role
 * (SITE_ENGINEER, SUPERVISOR, SUBCONTRACTOR) holding the labour permissions, that
 * disclosed the wages of sites it is not assigned to and offered them as move targets the
 * labour actions refuse.
 *
 * Now each page checks the live permission and the LABOUR module before any query, then
 * reads through `assignedSiteWhere`: a field role sees only workers of, attendance on and
 * destinations among the live sites it is assigned to (ACTIVE ones for the forms), and
 * privileged roles keep every live site of their company.
 *
 * No field role holds `labour.view` / `labour.manage` today; the matrix is widened for the
 * scoping cases (`widen`) and left real for the permission cases.
 */
const mocks = vi.hoisted(() => ({
  widen: { on: false },
  auth: vi.fn(),
  requireUser: vi.fn(),
  listProps: vi.fn(),
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
    labour: { findMany: vi.fn(), findFirst: vi.fn() },
    labourAttendance: { findMany: vi.fn() },
  },
}))

const FIELD_ROLES = ['SITE_ENGINEER', 'SUPERVISOR', 'SUBCONTRACTOR'] as const

vi.mock('@/lib/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/permissions')>()
  return {
    ...actual,
    hasPermission: (role: string, permission: string) =>
      (mocks.widen.on && (FIELD_ROLES as readonly string[]).includes(role) && (permission === 'labour.view' || permission === 'labour.manage')) ||
      actual.hasPermission(role as never, permission as never),
  }
})
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('@/lib/audit', () => ({ logActivity: vi.fn() }))
vi.mock('next/link', () => ({ default: ({ children }: { children?: ReactNode }) => children }))
vi.mock('@/actions/labour', () => ({
  createLabourAction: vi.fn(),
  updateLabourAction: vi.fn(),
  updateLabourRosterAction: vi.fn(),
  markLabourPaidAction: vi.fn(),
  deactivateLabourAction: vi.fn(),
}))
vi.mock('@/app/(dashboard)/labour/LabourCardList', () => ({
  LabourCardList: (props: Record<string, unknown>) => {
    mocks.listProps(props)
    return null
  },
}))

const { default: LabourPage } = await import('@/app/(dashboard)/labour/page')
const { default: NewLabourPage } = await import('@/app/(dashboard)/labour/new/page')
const { default: EditLabourPage } = await import('@/app/(dashboard)/labour/[id]/edit/page')

const SITES: Row[] = [
  { id: 'site_mine', companyId: 'company_1', name: 'Mine', deletedAt: null, status: 'ACTIVE', assignedEngineerId: null, engineerId: null },
  { id: 'site_engineer', companyId: 'company_1', name: 'Engineered', deletedAt: null, status: 'ACTIVE', assignedEngineerId: 'user_field', engineerId: null },
  { id: 'site_hold', companyId: 'company_1', name: 'On hold', deletedAt: null, status: 'ON_HOLD', assignedEngineerId: 'user_field', engineerId: null },
  { id: 'site_theirs', companyId: 'company_1', name: 'Theirs', deletedAt: null, status: 'ACTIVE', assignedEngineerId: 'someone_else', engineerId: null },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', deletedAt: new Date('2026-01-01'), status: 'ACTIVE', assignedEngineerId: 'user_field', engineerId: null },
  { id: 'site_other', companyId: 'company_2', name: 'Other tenant', deletedAt: null, status: 'ACTIVE', assignedEngineerId: 'user_field', engineerId: null },
]

const LABOUR: Row[] = [
  { id: 'lab_mine', companyId: 'company_1', siteId: 'site_mine', name: 'Ravi', phone: null, trade: 'MASON', dailyWage: 800, overtimeRate: 0, openingAdvance: 0, isActive: true },
  { id: 'lab_hold', companyId: 'company_1', siteId: 'site_hold', name: 'Hold', phone: null, trade: 'MASON', dailyWage: 700, overtimeRate: 0, openingAdvance: 0, isActive: true },
  { id: 'lab_theirs', companyId: 'company_1', siteId: 'site_theirs', name: 'Kumar', phone: null, trade: 'HELPER', dailyWage: 999, overtimeRate: 0, openingAdvance: 0, isActive: true },
  { id: 'lab_dead', companyId: 'company_1', siteId: 'site_dead', name: 'Old', phone: null, trade: 'HELPER', dailyWage: 500, overtimeRate: 0, openingAdvance: 0, isActive: true },
  { id: 'lab_other', companyId: 'company_2', siteId: 'site_other', name: 'Foreign', phone: null, trade: 'HELPER', dailyWage: 500, overtimeRate: 0, openingAdvance: 0, isActive: true },
]

/** Attendance of `lab_mine`: one log on its own site, one booked on a site the field role is not assigned to. */
const ATTENDANCE: Row[] = [
  { id: 'att_mine', labourId: 'lab_mine', siteId: 'site_mine', status: 'PRESENT', advance: 100, overtimeHours: 0 },
  { id: 'att_theirs', labourId: 'lab_mine', siteId: 'site_theirs', status: 'PRESENT', advance: 5000, overtimeHours: 0 },
]

const MEMBERS: Row[] = [
  { userId: 'user_field', companyId: 'company_1', isActive: true, siteIds: ['site_mine'] },
  { userId: 'user_field', companyId: 'company_1', isActive: false, siteIds: ['site_theirs'] },
]

const relations: RelationResolver = (row, key) => {
  if (key === 'site') return SITES.find((site) => site.id === row.siteId) ?? null
  return undefined
}

function principal(role: string) {
  const id = (FIELD_ROLES as readonly string[]).includes(role) ? 'user_field' : `user_${role.toLowerCase()}`
  return { id, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId: 'company_1' }
}

let modules: unknown

const attendanceStore = inMemoryDelegate(ATTENDANCE)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.widen.on = false
  modules = ['SITES', 'LABOUR']
  mocks.auth.mockResolvedValue({ user: principal('COMPANY_ADMIN') })
  mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
  mocks.prisma.company.findFirst.mockImplementation(async () => ({ modulesJson: modules }))
  mocks.prisma.companyMember.findFirst.mockImplementation(inMemoryDelegate(MEMBERS).findFirst)
  mocks.prisma.site.findMany.mockImplementation(inMemoryDelegate(SITES).findMany)

  const labour = inMemoryDelegate(LABOUR, relations)
  mocks.prisma.labour.findFirst.mockImplementation(labour.findFirst)
  // The roster include's attendance filter is applied the way Prisma would.
  mocks.prisma.labour.findMany.mockImplementation(async (args: { where: Row; include?: { attendance?: { where?: Row } } }) => {
    const rows = await labour.findMany(args)
    const attendanceWhere = args.include?.attendance?.where ?? {}
    return Promise.all(rows.map(async (row) => ({
      ...row,
      site: relations(row, 'site'),
      attendance: await attendanceStore.findMany({ where: { ...attendanceWhere, labourId: row.id } }),
    })))
  })
  mocks.prisma.labourAttendance.findMany.mockImplementation(attendanceStore.findMany)
})

function dataReads() {
  const { prisma } = mocks
  return [prisma.site.findMany, prisma.labour.findMany, prisma.labour.findFirst, prisma.labourAttendance.findMany]
}

function expectNoDataReads() {
  for (const read of dataReads()) expect(read).not.toHaveBeenCalled()
}

const PAGES = [
  { name: '/labour', permission: 'labour.view', run: () => LabourPage() },
  { name: '/labour/new', permission: 'labour.manage', run: () => NewLabourPage() },
  { name: '/labour/[id]/edit', permission: 'labour.manage', run: () => EditLabourPage({ params: Promise.resolve({ id: 'lab_mine' }) }) },
]

describe.each(PAGES)('$name gate', ({ run }) => {
  it('refuses a revoked principal before any data read', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))
    await expect(run()).rejects.toThrow(/UNAUTHORIZED/)
    expectNoDataReads()
  })

  it('turns a CLIENT away before any data read', async () => {
    mocks.requireUser.mockResolvedValue(principal('CLIENT'))
    await expect(run()).rejects.toThrow('NEXT_REDIRECT:/client-portal')
    expectNoDataReads()
  })

  it('turns a SUPER_ADMIN, which has no tenant context, away before any data read', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root', name: 'Root', email: 'root@x', role: 'SUPER_ADMIN' })
    await expect(run()).rejects.toThrow('NEXT_REDIRECT:/super-admin/dashboard')
    expectNoDataReads()
  })

  it.each(['ACCOUNTANT', 'PURCHASE_MANAGER', ...FIELD_ROLES])('turns a live %s without the permission away before any data read', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    await expect(run()).rejects.toThrow(/NEXT_REDIRECT|NEXT_NOT_FOUND/)
    expectNoDataReads()
  })

  it('turns the principal away when LABOUR is disabled', async () => {
    modules = ['SITES']
    await expect(run()).rejects.toThrow(/NEXT_REDIRECT|NEXT_NOT_FOUND/)
    expectNoDataReads()
  })
})

describe('/labour/new and /labour/[id]/edit refuse a labour.view-only PROJECT_MANAGER', () => {
  it.each(PAGES.slice(1))('$name', async ({ run }) => {
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER'))
    await expect(run()).rejects.toThrow('NEXT_REDIRECT:/dashboard')
    expectNoDataReads()
  })
})

function listed() {
  expect(mocks.listProps).toHaveBeenCalledTimes(1)
  const { workers, sites } = mocks.listProps.mock.calls[0][0] as { workers: Row[]; sites: Row[] }
  return { workers, sites }
}

/** Renders the roster so the mocked `LabourCardList` actually receives its props. */
async function renderList() {
  return renderToStaticMarkup((await LabourPage()) as ReactElement)
}

async function renderEdit(id: string) {
  return renderToStaticMarkup((await EditLabourPage({ params: Promise.resolve({ id }) })) as ReactElement)
}

describe.each(FIELD_ROLES)('field %s with labour permissions', (role) => {
  beforeEach(() => {
    mocks.widen.on = true
    mocks.requireUser.mockResolvedValue(principal(role))
  })

  it('/labour lists only workers of assigned live sites and wages from those sites only', async () => {
    await renderList()
    const { workers, sites } = listed()
    expect(workers.map((worker) => worker.id).sort()).toEqual(['lab_hold', 'lab_mine'])
    expect(sites.map((site) => site.id).sort()).toEqual(['site_engineer', 'site_hold', 'site_mine'])
    const mine = workers.find((worker) => worker.id === 'lab_mine')!
    // The 5000 advance booked on an unassigned site never reaches the roster.
    expect(mine).toMatchObject({ presentDays: 1, totalAdvances: 100 })
  })

  it('/labour/new offers only ACTIVE assigned live sites', async () => {
    const markup = renderToStaticMarkup((await NewLabourPage()) as ReactElement)
    const siteRead = mocks.prisma.site.findMany.mock.calls[0][0]
    const offered = await inMemoryDelegate(SITES).findMany(siteRead)
    expect(offered.map((site) => site.id).sort()).toEqual(['site_engineer', 'site_mine'])
    expect(markup).not.toContain('Theirs')
    expect(markup).not.toContain('On hold')
  })

  it.each(['lab_theirs', 'lab_dead', 'lab_other', 'missing'])('/labour/[id]/edit refuses worker %s before reading its attendance', async (id) => {
    await expect(EditLabourPage({ params: Promise.resolve({ id }) })).rejects.toThrow('NEXT_REDIRECT:/labour')
    expect(mocks.prisma.labourAttendance.findMany).not.toHaveBeenCalled()
    expect(mocks.prisma.site.findMany).not.toHaveBeenCalled()
  })

  it('/labour/[id]/edit sums attendance of assigned sites only and offers ACTIVE assigned destinations', async () => {
    const markup = await renderEdit('lab_mine')
    const [{ where }] = mocks.prisma.labourAttendance.findMany.mock.calls[0]
    expect(where).toMatchObject({ labourId: 'lab_mine' })
    expect((await attendanceStore.findMany({ where })).map((row) => row.id)).toEqual(['att_mine'])
    expect(markup).toContain('₹100')
    expect(markup).not.toContain('5,100')
    expect(markup).not.toContain('Theirs')
    expect(markup).not.toContain('On hold')
  })

  it('a deactivated membership sees no worker and no destination', async () => {
    mocks.prisma.companyMember.findFirst.mockResolvedValue(null)
    await renderList()
    expect(listed().workers.map((worker) => worker.id)).toEqual(['lab_hold'])
    expect(listed().sites.map((site) => site.id).sort()).toEqual(['site_engineer', 'site_hold'])
    await expect(EditLabourPage({ params: Promise.resolve({ id: 'lab_mine' }) })).rejects.toThrow('NEXT_REDIRECT:/labour')
  })
})

describe('privileged roles keep every live company site', () => {
  it('COMPANY_ADMIN sees every live-site worker, and PROJECT_MANAGER may read the roster', async () => {
    for (const role of ['COMPANY_ADMIN', 'PROJECT_MANAGER']) {
      vi.clearAllMocks()
      mocks.requireUser.mockResolvedValue(principal(role))
      await renderList()
      const { workers, sites } = listed()
      expect(workers.map((worker) => worker.id).sort()).toEqual(['lab_hold', 'lab_mine', 'lab_theirs'])
      expect(sites.map((site) => site.id).sort()).toEqual(['site_engineer', 'site_hold', 'site_mine', 'site_theirs'])
      expect(workers.find((worker) => worker.id === 'lab_mine')).toMatchObject({ presentDays: 2, totalAdvances: 5100 })
      expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
    }
  })

  it('COMPANY_ADMIN edits a worker of any live site and never a deleted or foreign one', async () => {
    const markup = await renderEdit('lab_theirs')
    expect(markup).toContain('Theirs')
    await expect(EditLabourPage({ params: Promise.resolve({ id: 'lab_dead' }) })).rejects.toThrow('NEXT_REDIRECT:/labour')
    await expect(EditLabourPage({ params: Promise.resolve({ id: 'lab_other' }) })).rejects.toThrow('NEXT_REDIRECT:/labour')
  })
})
