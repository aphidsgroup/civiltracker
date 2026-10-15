import { LocationCaptureError, type DeviceLocationTelemetry } from './browser-location'
import { validateSitePhotoLocation } from './site-photo-location'

/**
 * Client flow shared by every SITE_PHOTO capture/retake pathway:
 * 1. require a valid, fresh device location — otherwise nothing is uploaded;
 * 2. upload the image with structured telemetry (server re-validates first);
 * 3. claim the server-recorded upload by public id via a server action.
 */
export async function submitSitePhotoEvidence<T>({
  file,
  siteId,
  location,
  compress,
  fetchImpl = fetch,
  claim,
}: {
  file: File
  siteId: string
  location: DeviceLocationTelemetry | null
  compress: (file: File) => Promise<File | Blob>
  fetchImpl?: typeof fetch
  claim: (publicId: string, location: DeviceLocationTelemetry) => Promise<T>
}): Promise<T> {
  const check = validateSitePhotoLocation(location)
  if (!location || !check.ok) {
    throw new LocationCaptureError(check.ok ? 'MISSING' : check.reason, check.ok ? 'Device location is required.' : check.message)
  }

  const compressed = await compress(file)
  const fd = new FormData()
  fd.append('file', compressed)
  fd.append('module', 'SITE_PHOTO')
  fd.append('siteId', siteId)
  fd.append('latitude', String(location.latitude))
  fd.append('longitude', String(location.longitude))
  fd.append('accuracyMeters', String(location.accuracyMeters))
  fd.append('capturedAt', String(location.capturedAt))

  const res = await fetchImpl('/api/upload', { method: 'POST', body: fd })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || typeof data?.publicId !== 'string') {
    throw new Error(data?.error || 'Upload failed')
  }

  return claim(data.publicId, location)
}

// Server actions return expected refusals as values; surface them as errors.
export function unwrapEvidenceResult<T extends { success: boolean; error?: string }>(
  result: T,
): Extract<T, { success: true }> {
  if (!result.success) throw new Error(result.error || 'Photo could not be saved.')
  return result as Extract<T, { success: true }>
}
