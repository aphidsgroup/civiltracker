import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { RelationResolver, Row } from './support/prisma-where'

/**
 * Regression for the mobile site-photo gallery.
 *
 * The page resolved the principal but checked no permission or module, then looked up a
 * `companyMember` by user id alone — any company, active or not — and fell back to that
 * row's company when the principal had none. A field role with an empty assignment was
 * shown *every* site of the company, and the gallery listed the latest photos of every
 * site of the company regardless of assignment.
 *
 * Now the live principal must hold a SITE_PHOTO upload grant with TASKS enabled, and the
 * sites and photos are both read through `assignedSiteScope` of exactly the live company:
 * a field role sees only its assigned sites and their photos, and nothing at all without
 * an assignment. `@/lib/pages/tenant-page-access`, `@/lib/auth/site-mutation` and
 * `@/lib/permissions` are real.
 */
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  clientProps: vi.fn(),
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
    sitePhoto: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock('@/components/mobile/MobilePhotoClient', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.clientProps(props)
    return null
  },
}))

const { default: MobileSitePhotoPage } = await import('@/app/(mobile)/mobile/site-photo/page')

const SITES: Row[] = [
  { id: 'site_mine', companyId: 'company_1', name: 'Mine', deletedAt: null, assignedEngineerId: 'user_field', engineerId: null },
  { id: 'site_listed', companyId: 'company_1', name: 'Listed', deletedAt: null, assignedEngineerId: null, engineerId: null },
  { id: 'site_theirs', companyId: 'company_1', name: 'Theirs', deletedAt: null, assignedEngineerId: 'someone_else', engineerId: null },
  { id: 'site_dead', companyId: 'company_1', name: 'Gone', deletedAt: new Date('2026-01-01'), assignedEngineerId: 'user_field', engineerId: null },
  { id: 'site_other', companyId: 'company_2', name: 'Other tenant', deletedAt: null, assignedEngineerId: 'user_field', engineerId: null },
]

const PHOTO = { caption: 'Slab', category: 'Civil', secureUrl: 'https://img.test/p.jpg', createdAt: new Date('2026-09-20T10:00:00Z') }
const PHOTOS: Row[] = [
  { ...PHOTO, id: 'photo_mine', companyId: 'company_1', siteId: 'site_mine', uploadedById: 'user_field' },
  { ...PHOTO, id: 'photo_listed', companyId: 'company_1', siteId: 'site_listed', uploadedById: 'someone_else' },
  { ...PHOTO, id: 'photo_theirs', companyId: 'company_1', siteId: 'site_theirs', uploadedById: 'user_field' },
  { ...PHOTO, id: 'photo_dead', companyId: 'company_1', siteId: 'site_dead', uploadedById: 'user_field' },
  { ...PHOTO, id: 'photo_other', companyId: 'company_2', siteId: 'site_other', uploadedById: 'user_field' },
]

const relations: RelationResolver = (row, key) => {
  if (key === 'site') return SITES.find((site) => site.id === row.siteId) ?? null
  return undefined
}

let modules: unknown
let membership: { siteIds: string[] } | null

function principal(role: string, companyId = 'company_1') {
  return { id: 'user_field', name: role, email: 'field@acme.test', role, companyId }
}

async function render(siteId?: string) {
  return renderToStaticMarkup(await MobileSitePhotoPage({ searchParams: Promise.resolve({ siteId }) }))
}

function shown() {
  const props = mocks.clientProps.mock.calls[0][0] as { sites: Row[]; initialPhotos: Row[]; defaultSiteId?: string }
  return {
    sites: props.sites.map((site) => site.id).sort(),
    photos: props.initialPhotos.map((photo) => photo.id).sort(),
    defaultSiteId: props.defaultSiteId,
  }
}

function expectNoTenantReads() {
  expect(mocks.prisma.site.findMany).not.toHaveBeenCalled()
  expect(mocks.prisma.sitePhoto.findMany).not.toHaveBeenCalled()
  expect(mocks.prisma.companyMember.findFirst).not.toHaveBeenCalled()
  expect(mocks.clientProps).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['TASKS']
  membership = { siteIds: ['site_listed'] }
  mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
  mocks.prisma.company.findFirst.mockImplementation(async () => ({ modulesJson: modules }))
  mocks.prisma.companyMember.findFirst.mockImplementation(async () => membership)
  mocks.prisma.site.findMany.mockImplementation(inMemoryDelegate(SITES).findMany)
  mocks.prisma.sitePhoto.findMany.mockImplementation(inMemoryDelegate(PHOTOS, relations).findMany)
})

describe('MobileSitePhotoPage gate', () => {
  it('refuses a revoked principal before any tenant read', async () => {
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    await expect(render()).rejects.toThrow(/UNAUTHORIZED/)
    expectNoTenantReads()
  })

  it.each(['ACCOUNTANT', 'PURCHASE_MANAGER', 'VENDOR', 'SUBCONTRACTOR', 'CLIENT'])(
    'turns an active %s without a site-photo grant away before any tenant read',
    async (role) => {
      mocks.requireUser.mockResolvedValue(principal(role))

      await expect(render()).rejects.toThrow(/NEXT_REDIRECT/)
      expectNoTenantReads()
    }
  )

  it('turns a SUPER_ADMIN away to the platform dashboard', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root', name: 'Root', email: 'root@x.test', role: 'SUPER_ADMIN' })

    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/super-admin/dashboard')
    expectNoTenantReads()
  })

  it('turns the principal away when the TASKS module is disabled', async () => {
    modules = ['DPR', 'SITES']

    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/mobile/home')
    expectNoTenantReads()
  })
})

describe('MobileSitePhotoPage assigned-site scope', () => {
  it.each(['SITE_ENGINEER', 'SUPERVISOR'])('shows a %s only its assigned live sites and their photos', async (role) => {
    mocks.requireUser.mockResolvedValue(principal(role))

    await render()

    expect(shown()).toMatchObject({ sites: ['site_listed', 'site_mine'], photos: ['photo_listed', 'photo_mine'] })
  })

  it('shows zero sites and zero photos to a field role with an empty assignment', async () => {
    mocks.requireUser.mockResolvedValue({ ...principal('SUPERVISOR'), id: 'user_unassigned' })
    membership = { siteIds: [] }

    await render('site_theirs')

    expect(shown()).toEqual({ sites: [], photos: [], defaultSiteId: undefined })
  })

  it('reads the membership of exactly the live company, and only an active one', async () => {
    await render()

    expect(mocks.prisma.companyMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_field', companyId: 'company_1', isActive: true } })
    )
  })

  it('never preselects a site outside the principal\'s scope', async () => {
    await render('site_theirs')

    expect(shown().defaultSiteId).toBeUndefined()
  })

  it('shows a PROJECT_MANAGER every live site of the live company and their photos', async () => {
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER'))

    await render()

    expect(shown()).toMatchObject({
      sites: ['site_listed', 'site_mine', 'site_theirs'],
      photos: ['photo_listed', 'photo_mine', 'photo_theirs'],
    })
  })

  it('uses the live company, never another tenant\'s rows', async () => {
    mocks.requireUser.mockResolvedValue(principal('PROJECT_MANAGER', 'company_2'))

    await render()

    expect(shown()).toMatchObject({ sites: ['site_other'], photos: ['photo_other'] })
  })
})
