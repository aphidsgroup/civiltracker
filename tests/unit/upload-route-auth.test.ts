import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * `POST /api/upload` only required a live member: any role could upload into any module
 * (a CLIENT could push "bills"), company modules were ignored, a soft-deleted site was
 * accepted, the file size was unbounded, the client-declared MIME type went straight into
 * a Cloudinary `resource_type: 'auto'` upload (so HTML, SVG or executables were stored and
 * served), a failed MediaAsset insert was swallowed (an untracked, tenant-less asset), and
 * raw provider errors were echoed back.
 *
 * Now each upload module maps to an existing permission and company module checked on the
 * live principal before any tenant query, the file is capped at 10 MB and typed by its
 * leading bytes against a per-module allowlist, a supplied site must be a live site of the
 * live company, Cloudinary is restricted to image storage of the allowed formats, and the
 * tenant-bound MediaAsset is mandatory: if it cannot be written the stored file is removed.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module` and `@/lib/uploads/upload-policy` are real.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireUser: vi.fn(),
  prisma: {
    company: { findUnique: vi.fn() },
    site: { findFirst: vi.fn() },
    mediaAsset: { create: vi.fn() },
  },
  cloudinary: { uploader: { upload: vi.fn(), destroy: vi.fn() } },
}))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('@/lib/cloudinary', () => ({
  default: mocks.cloudinary,
  getCloudinaryFolder: (company: string, site: string, module: string) => `civil-tracker/${company}/${site}/${module}`,
}))

const { POST } = await import('@/app/api/upload/route')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', deletedAt: null },
  { id: 'site_dead', companyId: 'company_1', deletedAt: new Date('2026-01-01') },
  { id: 'site_other', companyId: 'company_2', deletedAt: null },
]

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
const PDF = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n')
const HTML = new TextEncoder().encode('<html><script>alert(document.cookie)</script></html>')
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId, companySlug: 'acme' }
}

function upload(fields: { file?: File | string | null; module?: string | null; siteId?: string | null } = {}) {
  const fd = new FormData()
  const file = fields.file === undefined ? new File([JPEG], 'photo.jpg', { type: 'image/jpeg' }) : fields.file
  if (file !== null) fd.append('file', file)
  const uploadModule = fields.module === undefined ? 'SITE_PHOTO' : fields.module
  if (uploadModule !== null) fd.append('module', uploadModule)
  const siteId = fields.siteId === undefined ? 'site_1' : fields.siteId
  if (siteId !== null) fd.append('siteId', siteId)
  return POST(new Request('http://localhost/api/upload', { method: 'POST', body: fd }))
}

let modules: unknown

beforeEach(() => {
  vi.clearAllMocks()
  modules = ['TASKS', 'BILLS', 'DOCUMENTS', 'DPR', 'SITES']
  mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
  mocks.auth.mockResolvedValue({ user: principal('COMPANY_ADMIN') })
  mocks.prisma.company.findUnique.mockImplementation(async () => ({ modulesJson: modules, status: 'ACTIVE' }))
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)
  mocks.prisma.mediaAsset.create.mockImplementation(async (args: { data: Row }) => ({ id: 'asset_1', ...args.data }))
  mocks.cloudinary.uploader.upload.mockImplementation((_file: string, options: Row, callback: (error: unknown, result?: unknown) => void) => {
    callback(null, { public_id: `${options.folder}/abc123`, secure_url: 'https://res.cloudinary.com/demo/image/upload/abc123.jpg', format: 'jpg', bytes: 12, width: 10, height: 10 })
  })
  mocks.cloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' })
})

describe('POST /api/upload authorization', () => {
  it('rejects a stale JWT from a removed member before parsing an upload', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'removed-user', companyId: 'company_1' } })
    mocks.requireUser.mockRejectedValue(new Error('UNAUTHORIZED: Active company membership required'))

    const response = await POST(new Request('http://localhost/api/upload', { method: 'POST' }))

    expect(response.status).toBe(401)
    expect(mocks.cloudinary.uploader.upload).not.toHaveBeenCalled()
  })

  it.each(['GENERAL', 'EXPENSE_HACK', '__proto__', 'constructor', ''])('refuses unknown upload module %j before any tenant query', async (module) => {
    const response = await upload({ module })
    expect(response.status).toBe(403)
    expect(mocks.prisma.company.findUnique).not.toHaveBeenCalled()
    expect(mocks.cloudinary.uploader.upload).not.toHaveBeenCalled()
  })

  it('refuses a missing module instead of defaulting to a general bucket', async () => {
    const response = await upload({ module: null })
    expect(response.status).toBe(403)
    expect(mocks.cloudinary.uploader.upload).not.toHaveBeenCalled()
  })

  it.each([
    ['CLIENT', 'SITE_PHOTO'],
    ['ACCOUNTANT', 'SITE_PHOTO'],
    ['PURCHASE_MANAGER', 'SITE_PHOTO'],
    ['SUBCONTRACTOR', 'BILL'],
    ['CLIENT', 'BILL'],
    ['SUPERVISOR', 'DOCUMENT'],
    ['SITE_ENGINEER', 'SALARY_PROOF'],
    ['SITE_ENGINEER', 'PAYMENT_PROOF'],
  ])('refuses live %s uploading %s before any tenant query', async (role, module) => {
    mocks.requireUser.mockResolvedValue(principal(role))
    const response = await upload({ module })
    expect(response.status).toBe(403)
    expect((await response.json()).error).toMatch(/permission/)
    expect(mocks.prisma.company.findUnique).not.toHaveBeenCalled()
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.cloudinary.uploader.upload).not.toHaveBeenCalled()
  })

  it('refuses SUPER_ADMIN, which has no tenant to own the asset', async () => {
    mocks.requireUser.mockResolvedValue({ id: 'root', role: 'SUPER_ADMIN', email: 'root@x', name: 'Root' })
    const response = await upload()
    expect(response.status).toBe(403)
    expect(mocks.cloudinary.uploader.upload).not.toHaveBeenCalled()
  })

  it.each([
    ['SITE_PHOTO', 'TASKS'],
    ['BILL', 'BILLS'],
  ])('refuses %s when the %s module is disabled', async (module, disabled) => {
    modules = (modules as string[]).filter((name) => name !== disabled)
    mocks.requireUser.mockResolvedValue(principal('COMPANY_ADMIN'))
    const response = await upload({ module })
    expect(response.status).toBe(403)
    expect((await response.json()).error).toMatch(new RegExp(`Module ${disabled} is not enabled`))
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.cloudinary.uploader.upload).not.toHaveBeenCalled()
  })

  it.each(['site_other', 'site_dead', 'missing'])('refuses site %s', async (siteId) => {
    const response = await upload({ siteId })
    expect(response.status).toBe(403)
    expect(mocks.cloudinary.uploader.upload).not.toHaveBeenCalled()
    expect(mocks.prisma.mediaAsset.create).not.toHaveBeenCalled()
  })
})

describe('POST /api/upload file validation', () => {
  it('refuses a request with no file', async () => {
    expect((await upload({ file: null })).status).toBe(400)
    expect((await upload({ file: 'https://evil.test/x.jpg' })).status).toBe(400)
    expect(mocks.cloudinary.uploader.upload).not.toHaveBeenCalled()
  })

  it('refuses an empty file', async () => {
    const response = await upload({ file: new File([], 'empty.jpg', { type: 'image/jpeg' }) })
    expect(response.status).toBe(400)
    expect(mocks.cloudinary.uploader.upload).not.toHaveBeenCalled()
  })

  it('refuses a file over 10 MB', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1)
    big.set(JPEG)
    const response = await upload({ file: new File([big], 'big.jpg', { type: 'image/jpeg' }) })
    expect(response.status).toBe(413)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.cloudinary.uploader.upload).not.toHaveBeenCalled()
  })

  it.each([
    ['HTML disguised as a JPEG', HTML, 'evil.jpg', 'image/jpeg'],
    ['an SVG with script', SVG, 'evil.svg', 'image/svg+xml'],
    ['a Windows executable', EXE, 'photo.jpg', 'image/jpeg'],
    ['a PDF sent as a site photo', PDF, 'doc.pdf', 'application/pdf'],
    ['a JPEG declared as HTML', JPEG, 'x.html', 'text/html'],
    ['a PNG declared as a JPEG', PNG, 'x.jpg', 'image/jpeg'],
  ])('refuses %s', async (_label, bytes, name, type) => {
    const response = await upload({ file: new File([bytes], name, { type }) })
    expect(response.status).toBe(415)
    expect(mocks.cloudinary.uploader.upload).not.toHaveBeenCalled()
    expect(mocks.prisma.mediaAsset.create).not.toHaveBeenCalled()
  })
})

describe('POST /api/upload storage', () => {
  it('stores a sniffed image with restricted Cloudinary options and a tenant-bound MediaAsset', async () => {
    const response = await upload({ file: new File([JPEG], '../../etc/passwd.jpg', { type: '' }) })
    expect(response.status).toBe(200)

    const [dataUri, options] = mocks.cloudinary.uploader.upload.mock.calls[0]
    expect(dataUri).toMatch(/^data:image\/jpeg;base64,/)
    expect(options).toMatchObject({ resource_type: 'image', use_filename: false, unique_filename: true, overwrite: false })
    expect(options.allowed_formats).toEqual(['jpg', 'png', 'webp', 'heic', 'heif'])
    expect(options.folder).toBe('civil-tracker/acme/site_1/SITE_PHOTO')

    expect(mocks.prisma.mediaAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company_1',
        siteId: 'site_1',
        module: 'SITE_PHOTO',
        uploadedById: 'user_site_engineer',
        cloudinaryPublicId: 'civil-tracker/acme/site_1/SITE_PHOTO/abc123',
        bytes: JPEG.byteLength,
      }),
      select: { id: true },
    })
    expect(await response.json()).toEqual({
      success: true,
      assetId: 'asset_1',
      url: 'https://res.cloudinary.com/demo/image/upload/abc123.jpg',
      publicId: 'civil-tracker/acme/site_1/SITE_PHOTO/abc123',
    })
  })

  it('accepts a PDF bill from a live bills.upload holder', async () => {
    mocks.requireUser.mockResolvedValue(principal('PURCHASE_MANAGER'))
    const response = await upload({ module: 'bill', file: new File([PDF], 'bill.pdf', { type: 'application/pdf' }) })
    expect(response.status).toBe(200)
    const [dataUri, options] = mocks.cloudinary.uploader.upload.mock.calls[0]
    expect(dataUri).toMatch(/^data:application\/pdf;base64,/)
    expect(options.allowed_formats).toContain('pdf')
  })

  it('accepts an upload without a site', async () => {
    const response = await upload({ siteId: '' })
    expect(response.status).toBe(200)
    expect(mocks.prisma.site.findFirst).not.toHaveBeenCalled()
    expect(mocks.prisma.mediaAsset.create.mock.calls[0][0].data.siteId).toBeNull()
  })

  it('removes the stored file and fails when the MediaAsset cannot be written', async () => {
    mocks.prisma.mediaAsset.create.mockRejectedValue(new Error('unique constraint'))
    const response = await upload()
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.url).toBeUndefined()
    expect(body.error).not.toMatch(/unique constraint/)
    expect(mocks.cloudinary.uploader.destroy).toHaveBeenCalledWith('civil-tracker/acme/site_1/SITE_PHOTO/abc123', { resource_type: 'image' })
  })

  it('does not echo provider errors', async () => {
    mocks.cloudinary.uploader.upload.mockImplementation((_file: string, _options: Row, callback: (error: unknown) => void) => {
      callback(new Error('Invalid api_key 1234567890'))
    })
    const response = await upload()
    expect(response.status).toBe(502)
    expect((await response.json()).error).not.toMatch(/api_key/)
    expect(mocks.prisma.mediaAsset.create).not.toHaveBeenCalled()
  })
})
