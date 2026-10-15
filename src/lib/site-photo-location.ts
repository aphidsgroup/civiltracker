// Shared (client + server) rules for GPS-tagged site photo evidence.
//
// Location is reported by the uploader's device/browser. It is useful
// operational evidence but NOT cryptographic proof: a modified device or
// browser can report any coordinate.

export const MAX_LOCATION_ACCURACY_METERS = 100
// Covers compression + upload on slow site networks, nothing older.
export const MAX_LOCATION_AGE_MS = 10 * 60_000
// Tolerate small device/server clock skew.
export const MAX_LOCATION_CLOCK_SKEW_MS = 2 * 60_000

// Hard-coded fallback the old mobile client stored when geolocation failed.
const FABRICATED_FALLBACK = { latitude: 28.5355, longitude: 77.391 }

export const LOCATION_DEVICE_REPORTED_NOTICE =
  'Location is reported by the uploader’s device at capture time. It is strong operational evidence, not tamper-proof.'

export const LOCATION_COLLECTION_NOTICE =
  'To submit site photo evidence, your device’s precise location is captured once, only when you take the photo. Only your company admin can view the exact location, for site-work verification. No background tracking.'

export type SitePhotoLocation = {
  latitude: number
  longitude: number
  accuracyMeters: number
  capturedAt: Date
}

export type SitePhotoLocationFailure =
  | 'MISSING'
  | 'INVALID'
  | 'OUT_OF_BOUNDS'
  | 'FABRICATED'
  | 'INACCURATE'
  | 'STALE'

export type SitePhotoLocationResult =
  | { ok: true; value: SitePhotoLocation }
  | { ok: false; reason: SitePhotoLocationFailure; message: string }

const FAILURE_MESSAGES: Record<SitePhotoLocationFailure, string> = {
  MISSING: 'Device location is required for site photo evidence. Allow location access and try again.',
  INVALID: 'Device location data was invalid. Please retake the photo.',
  OUT_OF_BOUNDS: 'Device location is out of range. Please retake the photo with location enabled.',
  FABRICATED: 'Device location could not be verified. Please retake the photo with location enabled.',
  INACCURATE: `Device location is too imprecise (must be within ${MAX_LOCATION_ACCURACY_METERS} m). Move to open sky, enable precise location and retake.`,
  STALE: 'Device location is out of date. Please retake the photo to capture a fresh location.',
}

function fail(reason: SitePhotoLocationFailure): SitePhotoLocationResult {
  return { ok: false, reason, message: FAILURE_MESSAGES[reason] }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function toTimestamp(value: unknown): number | null {
  if (isFiniteNumber(value)) return value
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const ms = Date.parse(value)
    return Number.isFinite(ms) ? ms : null
  }
  return null
}

function round7(value: number) {
  return Math.round(value * 1e7) / 1e7
}

export function validateSitePhotoLocation(input: unknown, now: number = Date.now()): SitePhotoLocationResult {
  if (!input || typeof input !== 'object') return fail('MISSING')
  const raw = input as Record<string, unknown>
  if (raw.latitude == null || raw.longitude == null || raw.accuracyMeters == null || raw.capturedAt == null) {
    return fail('MISSING')
  }

  const { latitude, longitude, accuracyMeters } = raw
  const capturedAtMs = toTimestamp(raw.capturedAt)
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude) || !isFiniteNumber(accuracyMeters) || capturedAtMs === null) {
    return fail('INVALID')
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || (latitude === 0 && longitude === 0)) {
    return fail('OUT_OF_BOUNDS')
  }

  if (
    Math.abs(latitude - FABRICATED_FALLBACK.latitude) < 0.0001 &&
    Math.abs(longitude - FABRICATED_FALLBACK.longitude) < 0.0001
  ) {
    return fail('FABRICATED')
  }

  if (accuracyMeters <= 0 || accuracyMeters > MAX_LOCATION_ACCURACY_METERS) return fail('INACCURATE')

  if (now - capturedAtMs > MAX_LOCATION_AGE_MS || capturedAtMs - now > MAX_LOCATION_CLOCK_SKEW_MS) {
    return fail('STALE')
  }

  return {
    ok: true,
    value: {
      latitude: round7(latitude),
      longitude: round7(longitude),
      accuracyMeters: Math.round(accuracyMeters * 10) / 10,
      capturedAt: new Date(capturedAtMs),
    },
  }
}

const STRICT_NUMBER = /^-?\d+(\.\d+)?$/

// Multipart form fields arrive as strings; only plain decimal numbers are
// converted, so display strings like "13.08° N" fail validation as INVALID.
export function parseLocationFormFields(formData: FormData): Record<string, unknown> {
  const parsed: Record<string, unknown> = {}
  for (const key of ['latitude', 'longitude', 'accuracyMeters', 'capturedAt']) {
    const value = formData.get(key)
    if (typeof value !== 'string' || value.trim() === '') continue
    parsed[key] = STRICT_NUMBER.test(value.trim()) ? Number(value.trim()) : value
  }
  return parsed
}
