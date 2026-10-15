import type { Role } from '@prisma/client'

// Safe-to-serialize location view for photo galleries. Exact coordinates are
// sensitive employee location data: only an admin of the photo's own company
// receives them, for operational review of site evidence.

export type SitePhotoLocationStatusView = 'DEVICE_REPORTED' | 'UNAVAILABLE'

export type SitePhotoExactLocation = {
  latitude: number
  longitude: number
  accuracyMeters: number
  capturedAt: string
  mapsUrl: string
}

export type SitePhotoLocationView = {
  status: SitePhotoLocationStatusView
  exact: SitePhotoExactLocation | null
}

type PhotoLocationFields = {
  companyId: string
  locationStatus: SitePhotoLocationStatusView
  latitude: number | null
  longitude: number | null
  locationAccuracyMeters: number | null
  locationCapturedAt: Date | null
}

type LocationViewer = { role: Role; companyId?: string | null }

export function canViewExactPhotoLocation(viewer: LocationViewer, photoCompanyId: string) {
  return viewer.role === 'COMPANY_ADMIN' && !!viewer.companyId && viewer.companyId === photoCompanyId
}

export function buildMapsUrl(latitude: number, longitude: number) {
  const query = encodeURIComponent(`${latitude},${longitude}`)
  return `https://www.google.com/maps/search/?api=1&query=${query}`
}

export function toSitePhotoLocationView(photo: PhotoLocationFields, viewer: LocationViewer): SitePhotoLocationView {
  const { latitude, longitude, locationAccuracyMeters, locationCapturedAt } = photo
  if (
    photo.locationStatus !== 'DEVICE_REPORTED' ||
    latitude == null ||
    longitude == null ||
    locationAccuracyMeters == null ||
    locationCapturedAt == null
  ) {
    return { status: 'UNAVAILABLE', exact: null }
  }

  if (!canViewExactPhotoLocation(viewer, photo.companyId)) {
    return { status: 'DEVICE_REPORTED', exact: null }
  }

  return {
    status: 'DEVICE_REPORTED',
    exact: {
      latitude,
      longitude,
      accuracyMeters: locationAccuracyMeters,
      capturedAt: locationCapturedAt.toISOString(),
      mapsUrl: buildMapsUrl(latitude, longitude),
    },
  }
}

// Legacy rows stored free-text, unverified "GPS:..." strings in category.
export function getPhotoDisplayCategory(category: string | null | undefined): string | null {
  if (!category) return null
  if (/^\s*gps\s*:/i.test(category)) return null
  return category
}
