import { describe, expect, it, vi } from 'vitest'
import { captureDeviceLocation, LocationCaptureError } from './browser-location'

const NOW = new Date('2026-10-15T06:00:00.000Z').getTime()

type Geo = Pick<Geolocation, 'getCurrentPosition'>

function geoReturning(position: Partial<GeolocationPosition> | null, error?: Partial<GeolocationPositionError>) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getCurrentPosition = vi.fn((ok: PositionCallback, ko?: PositionErrorCallback | null, _options?: PositionOptions) => {
    if (position) ok(position as GeolocationPosition)
    else ko?.({ PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: '', ...error } as GeolocationPositionError)
  })
  return { getCurrentPosition } as unknown as Geo & { getCurrentPosition: typeof getCurrentPosition }
}

function position(coords: Partial<GeolocationCoordinates>, timestamp = NOW - 1_000) {
  return { timestamp, coords: { latitude: 13.0827, longitude: 80.2707, accuracy: 6, ...coords } as GeolocationCoordinates }
}

describe('captureDeviceLocation', () => {
  it('requests a fresh high-accuracy fix and returns structured telemetry', async () => {
    const geo = geoReturning(position({ latitude: 13.0827123, longitude: 80.2707456, accuracy: 6.2 }))
    const result = await captureDeviceLocation({ geolocation: geo, now: () => NOW })

    expect(result).toEqual({ latitude: 13.0827123, longitude: 80.2707456, accuracyMeters: 6.2, capturedAt: NOW - 1_000 })
    const options = geo.getCurrentPosition.mock.calls[0][2]
    expect(options).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 })
  })

  it('fails with an explanation when geolocation is unavailable — never a fallback coordinate', async () => {
    await expect(captureDeviceLocation({ geolocation: undefined, now: () => NOW })).rejects.toMatchObject({
      name: 'LocationCaptureError',
      code: 'UNSUPPORTED',
    })
  })

  it('fails with an explanation when permission is denied', async () => {
    const geo = geoReturning(null, { code: 1 })
    const err = await captureDeviceLocation({ geolocation: geo, now: () => NOW }).catch((e) => e)
    expect(err).toBeInstanceOf(LocationCaptureError)
    expect(err.code).toBe('PERMISSION_DENIED')
    expect(err.message).toMatch(/location permission/i)
  })

  it('fails on timeout / position unavailable', async () => {
    for (const code of [2, 3]) {
      const err = await captureDeviceLocation({ geolocation: geoReturning(null, { code }), now: () => NOW }).catch((e) => e)
      expect(err).toBeInstanceOf(LocationCaptureError)
      expect(err.code).toBe('UNAVAILABLE')
    }
  })

  it('rejects fixes that fail validation (poor accuracy, stale cache)', async () => {
    const inaccurate = await captureDeviceLocation({ geolocation: geoReturning(position({ accuracy: 2500 })), now: () => NOW }).catch((e) => e)
    expect(inaccurate).toBeInstanceOf(LocationCaptureError)
    expect(inaccurate.code).toBe('INACCURATE')

    const stale = await captureDeviceLocation({
      geolocation: geoReturning(position({}, NOW - 60 * 60_000)),
      now: () => NOW,
    }).catch((e) => e)
    expect(stale.code).toBe('STALE')
  })
})
