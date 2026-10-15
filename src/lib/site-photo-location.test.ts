import { describe, expect, it } from 'vitest'
import {
  MAX_LOCATION_ACCURACY_METERS,
  MAX_LOCATION_AGE_MS,
  validateSitePhotoLocation,
} from './site-photo-location'

const NOW = new Date('2026-10-15T06:00:00.000Z').getTime()

function fresh(overrides: Record<string, unknown> = {}) {
  return {
    latitude: 13.0827123,
    longitude: 80.2707456,
    accuracyMeters: 8.5,
    capturedAt: NOW - 5_000,
    ...overrides,
  }
}

describe('validateSitePhotoLocation', () => {
  it('accepts a legitimate fresh, accurate device coordinate', () => {
    const result = validateSitePhotoLocation(fresh(), NOW)
    expect(result).toEqual({
      ok: true,
      value: {
        latitude: 13.0827123,
        longitude: 80.2707456,
        accuracyMeters: 8.5,
        capturedAt: new Date(NOW - 5_000),
      },
    })
  })

  it('denies missing telemetry', () => {
    for (const input of [undefined, null, {}, '13.08° N, 80.27° E']) {
      const result = validateSitePhotoLocation(input, NOW)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('MISSING')
    }
  })

  it('denies the old fabricated fallback coordinate', () => {
    const result = validateSitePhotoLocation(fresh({ latitude: 28.5355, longitude: 77.391 }), NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('FABRICATED')
  })

  it('denies non-numeric, non-finite and string-encoded values', () => {
    for (const bad of [
      { latitude: '13.08' },
      { longitude: Number.NaN },
      { latitude: Number.POSITIVE_INFINITY },
      { accuracyMeters: '5' },
      { capturedAt: 'yesterday' },
    ]) {
      const result = validateSitePhotoLocation(fresh(bad), NOW)
      expect(result.ok, JSON.stringify(bad)).toBe(false)
      if (!result.ok) expect(result.reason).toBe('INVALID')
    }
  })

  it('denies out-of-bounds coordinates and null island', () => {
    for (const bad of [
      { latitude: 90.0001 },
      { latitude: -91 },
      { longitude: 180.5 },
      { longitude: -181 },
      { latitude: 0, longitude: 0 },
    ]) {
      const result = validateSitePhotoLocation(fresh(bad), NOW)
      expect(result.ok, JSON.stringify(bad)).toBe(false)
      if (!result.ok) expect(result.reason).toBe('OUT_OF_BOUNDS')
    }
  })

  it('denies unusably poor or nonsensical accuracy', () => {
    for (const accuracyMeters of [MAX_LOCATION_ACCURACY_METERS + 1, 0, -3]) {
      const result = validateSitePhotoLocation(fresh({ accuracyMeters }), NOW)
      expect(result.ok, String(accuracyMeters)).toBe(false)
      if (!result.ok) expect(result.reason).toBe('INACCURATE')
    }
    expect(validateSitePhotoLocation(fresh({ accuracyMeters: MAX_LOCATION_ACCURACY_METERS }), NOW).ok).toBe(true)
  })

  it('denies stale fixes and fixes timestamped in the future', () => {
    const stale = validateSitePhotoLocation(fresh({ capturedAt: NOW - MAX_LOCATION_AGE_MS - 1 }), NOW)
    expect(stale.ok).toBe(false)
    if (!stale.ok) expect(stale.reason).toBe('STALE')

    const future = validateSitePhotoLocation(fresh({ capturedAt: NOW + 10 * 60_000 }), NOW)
    expect(future.ok).toBe(false)
    if (!future.ok) expect(future.reason).toBe('STALE')
  })

  it('accepts ISO capturedAt strings and rounds coordinates to 7 decimals', () => {
    const result = validateSitePhotoLocation(
      fresh({ latitude: 13.082712345678, capturedAt: new Date(NOW - 1_000).toISOString() }),
      NOW,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.latitude).toBe(13.0827123)
      expect(result.value.capturedAt).toEqual(new Date(NOW - 1_000))
    }
  })
})
