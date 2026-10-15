import { beforeEach, describe, expect, it, vi } from 'vitest'

const NOW = new Date('2026-10-15T06:00:00.000Z').getTime()

const mocks = vi.hoisted(() => ({
  session: { current: null as null | { user: Record<string, unknown> } },
  prisma: {
    site: { findUnique: vi.fn(), findFirst: vi.fn() },
    companyMember: { findFirst: vi.fn() },
    company: { findUnique: vi.fn() },
    mediaAsset: { create: vi.fn() },
  },
  upload: vi.fn(),
  destroy: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: async () => mocks.session.current }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('@/lib/cloudinary', () => ({
  default: { uploader: { upload: mocks.upload, destroy: mocks.destroy } },
  getCloudinaryFolder: (c: string, s: string, m: string) => `civil-tracker/${c}/${s}/${m}/2026/10`,
}))

import { POST } from './route'

function form(fields: Record<string, string>) {
  const fd = new FormData()
  fd.append('file', new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' }))
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return new Request('http://localhost/api/upload', { method: 'POST', body: fd })
}

const location = {
  latitude: '13.0827123',
  longitude: '80.2707456',
  accuracyMeters: '7',
  capturedAt: String(NOW - 2_000),
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  mocks.session.current = { user: { id: 'user-eng', role: 'SITE_ENGINEER', companyId: 'company-a', companySlug: 'a' } }
  mocks.prisma.site.findFirst.mockReset().mockResolvedValue({ id: 'site-a', companyId: 'company-a' })
  mocks.prisma.mediaAsset.create.mockReset().mockResolvedValue({ id: 'asset-1' })
  mocks.destroy.mockReset().mockResolvedValue({ result: 'ok' })
  mocks.upload.mockReset().mockImplementation((_data: string, _opts: unknown, cb: (e: unknown, r: unknown) => void) =>
    cb(null, { public_id: 'civil-tracker/a/site-a/SITE_PHOTO/2026/10/photo_abc', secure_url: 'https://res.cloudinary.com/x.jpg', format: 'jpg', bytes: 3 }),
  )
})

describe('POST /api/upload — SITE_PHOTO evidence', () => {
  it('uploads when fresh structured device location accompanies the photo', async () => {
    const res = await POST(form({ module: 'SITE_PHOTO', siteId: 'site-a', ...location }))
    expect(res.status).toBe(200)
    expect(mocks.upload).toHaveBeenCalledTimes(1)
    expect(await res.json()).toMatchObject({ publicId: 'civil-tracker/a/site-a/SITE_PHOTO/2026/10/photo_abc' })
  })

  it.each([
    ['missing location', {}],
    ['fabricated fallback', { ...location, latitude: '28.5355', longitude: '77.3910' }],
    ['display string', { ...location, latitude: '13.08° N' }],
    ['out of bounds', { ...location, latitude: '95' }],
    ['poor accuracy', { ...location, accuracyMeters: '900' }],
    ['stale', { ...location, capturedAt: String(NOW - 60 * 60_000) }],
  ])('rejects %s before anything is stored', async (_label, fields) => {
    const res = await POST(form({ module: 'SITE_PHOTO', siteId: 'site-a', ...fields }))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toMatch(/location/i)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.prisma.mediaAsset.create).not.toHaveBeenCalled()
  })

  it('requires a site for SITE_PHOTO evidence', async () => {
    const res = await POST(form({ module: 'SITE_PHOTO', ...location }))
    expect(res.status).toBe(400)
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('removes the Cloudinary image if the upload cannot be recorded for a later claim', async () => {
    mocks.prisma.mediaAsset.create.mockRejectedValue(new Error('db down'))
    const res = await POST(form({ module: 'SITE_PHOTO', siteId: 'site-a', ...location }))
    expect(res.status).toBe(500)
    expect(mocks.destroy).toHaveBeenCalledWith('civil-tracker/a/site-a/SITE_PHOTO/2026/10/photo_abc')
  })

  it('refuses SITE_PHOTO evidence without a company context (it could never be claimed)', async () => {
    mocks.session.current = { user: { id: 'root', role: 'SUPER_ADMIN' } }
    const res = await POST(form({ module: 'SITE_PHOTO', siteId: 'site-a', ...location }))
    expect(res.status).toBe(403)
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('leaves non-photo modules unaffected', async () => {
    const res = await POST(form({ module: 'BILL', siteId: 'site-a' }))
    expect(res.status).toBe(200)
  })
})
