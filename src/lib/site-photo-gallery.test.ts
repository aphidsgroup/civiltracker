import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    site: { findFirst: vi.fn() },
    sitePhoto: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))

import { getAdminSitePhotoGallery, toClientPortalPhoto } from './site-photo-gallery'

const capturedAt = new Date('2026-10-15T05:59:55.000Z')
const gpsRow = {
  id: 'p1',
  companyId: 'company-a',
  siteId: 'site-a',
  secureUrl: 'https://res.cloudinary.com/x.jpg',
  caption: 'Slab',
  category: 'Civil',
  createdAt: capturedAt,
  approvedForClient: false,
  approvedAt: null,
  locationStatus: 'DEVICE_REPORTED' as const,
  latitude: 13.0827123,
  longitude: 80.2707456,
  locationAccuracyMeters: 8,
  locationCapturedAt: capturedAt,
  task: null,
}
const legacyRow = {
  ...gpsRow,
  id: 'p0',
  category: 'GPS:28.5355° N, 77.3910° E',
  locationStatus: 'UNAVAILABLE' as const,
  latitude: null,
  longitude: null,
  locationAccuracyMeters: null,
  locationCapturedAt: null,
}

beforeEach(() => {
  mocks.prisma.site.findFirst.mockReset().mockImplementation(async ({ where }: { where: { id: string; companyId: string } }) =>
    where.id === 'site-a' && where.companyId === 'company-a' ? { id: 'site-a' } : null,
  )
  mocks.prisma.sitePhoto.findMany.mockReset().mockResolvedValue([gpsRow, legacyRow])
})

describe('getAdminSitePhotoGallery', () => {
  it('scopes queries to the viewer company and gives the company admin exact location', async () => {
    const gallery = await getAdminSitePhotoGallery('site-a', { role: 'COMPANY_ADMIN', companyId: 'company-a' })
    expect(gallery).not.toBeNull()
    for (const call of mocks.prisma.sitePhoto.findMany.mock.calls) {
      expect(call[0].where).toMatchObject({ siteId: 'site-a', companyId: 'company-a' })
    }
    const [gps, legacy] = gallery!.pending
    expect(gps.location.exact?.latitude).toBe(13.0827123)
    expect(legacy.location).toEqual({ status: 'UNAVAILABLE', exact: null })
    expect(legacy.category).toBeNull()
  })

  it('never serializes coordinates for other company roles', async () => {
    for (const role of ['PROJECT_MANAGER', 'SITE_ENGINEER', 'ACCOUNTANT', 'SUPERVISOR'] as const) {
      const gallery = await getAdminSitePhotoGallery('site-a', { role, companyId: 'company-a' })
      const json = JSON.stringify(gallery)
      expect(json, role).not.toContain('13.0827')
      expect(json, role).not.toContain('80.2707')
      expect(json, role).not.toContain('28.5355')
      expect(gallery!.pending[0].location.status).toBe('DEVICE_REPORTED')
    }
  })

  it('returns nothing for a site in another company (cross-tenant admin)', async () => {
    const gallery = await getAdminSitePhotoGallery('site-a', { role: 'COMPANY_ADMIN', companyId: 'company-b' })
    expect(gallery).toBeNull()
    expect(mocks.prisma.sitePhoto.findMany).not.toHaveBeenCalled()
  })
})

describe('toClientPortalPhoto', () => {
  it('strips all location data and legacy GPS strings for client portal users', () => {
    const json = JSON.stringify([toClientPortalPhoto(gpsRow), toClientPortalPhoto(legacyRow)])
    expect(json).not.toMatch(/latitude|longitude|locationAccuracy|locationCaptured/)
    expect(json).not.toContain('13.0827')
    expect(json).not.toContain('28.5355')
  })
})
