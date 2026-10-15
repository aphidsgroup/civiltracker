import { validateSitePhotoLocation, type SitePhotoLocationFailure } from './site-photo-location'

// Wire format sent to /api/upload and server actions (plain JSON-safe values).
export type DeviceLocationTelemetry = {
  latitude: number
  longitude: number
  accuracyMeters: number
  capturedAt: number
}

export type LocationCaptureErrorCode = 'UNSUPPORTED' | 'PERMISSION_DENIED' | 'UNAVAILABLE' | SitePhotoLocationFailure

export class LocationCaptureError extends Error {
  readonly code: LocationCaptureErrorCode

  constructor(code: LocationCaptureErrorCode, message: string) {
    super(message)
    this.name = 'LocationCaptureError'
    this.code = code
  }
}

const GEO_TIMEOUT_MS = 20_000

/**
 * One-shot, user-initiated location fix for a site photo. There is deliberately
 * no fallback coordinate: if a fresh, accurate fix is unavailable the caller
 * must block the evidence upload.
 */
export function captureDeviceLocation({
  geolocation = typeof navigator !== 'undefined' ? navigator.geolocation : undefined,
  now = Date.now,
}: {
  geolocation?: Pick<Geolocation, 'getCurrentPosition'>
  now?: () => number
} = {}): Promise<DeviceLocationTelemetry> {
  if (!geolocation) {
    return Promise.reject(
      new LocationCaptureError('UNSUPPORTED', 'This browser cannot provide device location, so site photo evidence cannot be submitted from it.'),
    )
  }

  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (pos) => {
        const telemetry: DeviceLocationTelemetry = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy,
          capturedAt: pos.timestamp,
        }
        const result = validateSitePhotoLocation(telemetry, now())
        if (!result.ok) {
          reject(new LocationCaptureError(result.reason, result.message))
          return
        }
        resolve(telemetry)
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new LocationCaptureError('PERMISSION_DENIED', 'Location permission was denied. Allow location access for this site in your browser settings to submit photo evidence.'))
        } else {
          reject(new LocationCaptureError('UNAVAILABLE', 'Could not get a GPS fix. Turn on device location, move to open sky and try again.'))
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: GEO_TIMEOUT_MS },
    )
  })
}
