import { describe, expect, it, vi } from 'vitest'
import { submitSitePhotoEvidence, unwrapEvidenceResult } from './site-photo-upload-client'
import { LocationCaptureError } from './browser-location'

const NOW = Date.now()
const file = new File([new Uint8Array([1])], 'p.jpg', { type: 'image/jpeg' })
const location = { latitude: 13.0827123, longitude: 80.2707456, accuracyMeters: 6, capturedAt: NOW - 1_000 }

function deps(overrides: Partial<Parameters<typeof submitSitePhotoEvidence>[0]> = {}) {
  return {
    file,
    siteId: 'site-a',
    location,
    compress: vi.fn(async (f: File) => f),
    fetchImpl: vi.fn(async () => new Response(JSON.stringify({ url: 'https://u', publicId: 'pid-1' }), { status: 200 })),
    claim: vi.fn(async () => ({ success: true })),
    ...overrides,
  }
}

describe('submitSitePhotoEvidence', () => {
  it('uploads with structured location fields, then claims by public id with the same telemetry', async () => {
    const d = deps()
    await submitSitePhotoEvidence(d)

    const body = ((d.fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as FormData
    expect(body.get('module')).toBe('SITE_PHOTO')
    expect(body.get('siteId')).toBe('site-a')
    expect(body.get('latitude')).toBe('13.0827123')
    expect(body.get('longitude')).toBe('80.2707456')
    expect(body.get('accuracyMeters')).toBe('6')
    expect(body.get('capturedAt')).toBe(String(NOW - 1_000))
    expect(d.claim).toHaveBeenCalledWith('pid-1', location)
  })

  it('blocks before any upload when location is missing — no image is stored', async () => {
    const d = deps({ location: null })
    await expect(submitSitePhotoEvidence(d)).rejects.toBeInstanceOf(LocationCaptureError)
    expect(d.fetchImpl).not.toHaveBeenCalled()
    expect(d.claim).not.toHaveBeenCalled()
  })

  it('blocks before any upload when the fix went stale or is inaccurate', async () => {
    for (const bad of [{ ...location, capturedAt: NOW - 60 * 60_000 }, { ...location, accuracyMeters: 5000 }]) {
      const d = deps({ location: bad })
      await expect(submitSitePhotoEvidence(d)).rejects.toBeInstanceOf(LocationCaptureError)
      expect(d.fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('surfaces server upload rejections and does not claim', async () => {
    const d = deps({
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ error: 'Device location is out of date.' }), { status: 422 })),
    })
    await expect(submitSitePhotoEvidence(d)).rejects.toThrow('Device location is out of date.')
    expect(d.claim).not.toHaveBeenCalled()
  })
})

describe('unwrapEvidenceResult', () => {
  it('surfaces a returned server refusal as an error with its explanation', () => {
    expect(() => unwrapEvidenceResult({ success: false, error: 'Device location is out of date.' })).toThrow('Device location is out of date.')
    expect(unwrapEvidenceResult({ success: true as const, photo: { id: 'p' } })).toEqual({ success: true, photo: { id: 'p' } })
  })
})
