import { describe, expect, it } from 'vitest'
import { getPhotoDisplayCategory, toSitePhotoLocationView } from './site-photo-location-view'

const capturedAt = new Date('2026-10-15T05:59:55.000Z')

const gpsPhoto = {
  companyId: 'company-a',
  locationStatus: 'DEVICE_REPORTED' as const,
  latitude: 13.0827123,
  longitude: 80.2707456,
  locationAccuracyMeters: 8.5,
  locationCapturedAt: capturedAt,
}

const legacyPhoto = {
  companyId: 'company-a',
  locationStatus: 'UNAVAILABLE' as const,
  latitude: null,
  longitude: null,
  locationAccuracyMeters: null,
  locationCapturedAt: null,
}

describe('toSitePhotoLocationView', () => {
  it('gives the same-company admin the exact device-reported location and a maps link', () => {
    const view = toSitePhotoLocationView(gpsPhoto, { role: 'COMPANY_ADMIN', companyId: 'company-a' })
    expect(view).toEqual({
      status: 'DEVICE_REPORTED',
      exact: {
        latitude: 13.0827123,
        longitude: 80.2707456,
        accuracyMeters: 8.5,
        capturedAt: capturedAt.toISOString(),
        mapsUrl: 'https://www.google.com/maps/search/?api=1&query=13.0827123%2C80.2707456',
      },
    })
  })

  it('hides exact coordinates from an admin of another company', () => {
    const view = toSitePhotoLocationView(gpsPhoto, { role: 'COMPANY_ADMIN', companyId: 'company-b' })
    expect(view).toEqual({ status: 'DEVICE_REPORTED', exact: null })
  })

  it('hides exact coordinates from non-admin roles, clients and super admins', () => {
    for (const role of ['PROJECT_MANAGER', 'SITE_ENGINEER', 'SUPERVISOR', 'ACCOUNTANT', 'CLIENT', 'SUPER_ADMIN'] as const) {
      const view = toSitePhotoLocationView(gpsPhoto, { role, companyId: 'company-a' })
      expect(view, role).toEqual({ status: 'DEVICE_REPORTED', exact: null })
    }
  })

  it('hides exact coordinates when the viewer has no company context', () => {
    expect(toSitePhotoLocationView(gpsPhoto, { role: 'COMPANY_ADMIN', companyId: undefined }).exact).toBeNull()
  })

  it('labels legacy GPS-less photos as unavailable, even for the admin', () => {
    expect(toSitePhotoLocationView(legacyPhoto, { role: 'COMPANY_ADMIN', companyId: 'company-a' })).toEqual({
      status: 'UNAVAILABLE',
      exact: null,
    })
  })

  it('treats a DEVICE_REPORTED row with missing coordinates as unavailable', () => {
    const view = toSitePhotoLocationView({ ...gpsPhoto, latitude: null }, { role: 'COMPANY_ADMIN', companyId: 'company-a' })
    expect(view).toEqual({ status: 'UNAVAILABLE', exact: null })
  })
})

describe('getPhotoDisplayCategory', () => {
  it('never surfaces legacy free-text GPS strings stored in category', () => {
    expect(getPhotoDisplayCategory('GPS:28.5355° N, 77.3910° E')).toBeNull()
    expect(getPhotoDisplayCategory('gps: 13.1, 80.2')).toBeNull()
    expect(getPhotoDisplayCategory('Safety')).toBe('Safety')
    expect(getPhotoDisplayCategory(null)).toBeNull()
  })
})
