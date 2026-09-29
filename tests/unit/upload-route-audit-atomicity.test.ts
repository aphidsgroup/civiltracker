import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDelegate } from './support/prisma-where'
import type { Row } from './support/prisma-where'

/**
 * Regression for `POST /api/upload` creating tenant MediaAssets without an audit trail.
 *
 * A stored file became a tenant-owned MediaAsset with nothing recording who created it.
 * Now the MediaAsset row and a MEDIA_ASSET CREATE audit event are written on one
 * transaction client, only after the principal, module, file type, site scope and the
 * storage upload have all succeeded. The event names the server-derived actor, company,
 * site and asset with safe metadata: never the stored URL, the provider public id or the
 * client-sent file name. An audit failure rolls the asset back and the stored file is
 * removed again; a failed storage upload never reaches the transaction, so no asset audit
 * is ever claimed for it.
 *
 * `@/lib/permissions`, `@/lib/auth/require-module`, `@/lib/auth/site-mutation` and
 * `@/lib/uploads/upload-policy` are real.
 */
const mocks = vi.hoisted(() => {
  const forbidden = (name: string) => vi.fn(async () => {
    throw new Error(`test: ${name} must run on the transaction client`)
  })
  return {
    auth: vi.fn(),
    requireUser: vi.fn(),
    tx: {
      mediaAsset: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    },
    prisma: {
      company: { findUnique: vi.fn() },
      companyMember: { findFirst: vi.fn() },
      site: { findFirst: vi.fn() },
      mediaAsset: { create: forbidden('prisma.mediaAsset.create') },
      auditLog: { create: forbidden('prisma.auditLog.create') },
      $transaction: vi.fn(),
    },
    cloudinary: { uploader: { upload: vi.fn(), destroy: vi.fn() } },
  }
})

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }))
vi.mock('@/lib/cloudinary', () => ({
  default: mocks.cloudinary,
  getCloudinaryFolder: (company: string, site: string, module: string) => `civil-tracker/${company}/${site}/${module}`,
}))

const { POST } = await import('@/app/api/upload/route')

const SITES: Row[] = [
  { id: 'site_1', companyId: 'company_1', deletedAt: null, assignedEngineerId: 'user_site_engineer', engineerId: null },
  { id: 'site_theirs', companyId: 'company_1', deletedAt: null, assignedEngineerId: 'user_someone_else', engineerId: null },
  { id: 'site_other', companyId: 'company_2', deletedAt: null, assignedEngineerId: 'user_site_engineer', engineerId: null },
]

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
const STORED_URL = 'https://res.cloudinary.com/demo/image/upload/abc123.jpg'
const PUBLIC_ID = 'civil-tracker/acme/site_1/SITE_PHOTO/abc123'
const CLIENT_NAME = 'https://evil.test/track?token=s3cret.jpg'

function principal(role: string, companyId = 'company_1') {
  return { id: `user_${role.toLowerCase()}`, name: role, email: `${role.toLowerCase()}@acme.test`, role, companyId, companySlug: 'acme' }
}

function upload(siteId: string | null = 'site_1', name = CLIENT_NAME) {
  const fd = new FormData()
  fd.append('file', new File([JPEG], name, { type: 'image/jpeg' }))
  fd.append('module', 'SITE_PHOTO')
  if (siteId !== null) fd.append('siteId', siteId)
  return POST(new Request('http://localhost/api/upload', { method: 'POST', body: fd }))
}

let assets: Row[]
let audit: Row[]
let failAudit: boolean

beforeEach(() => {
  vi.clearAllMocks()
  assets = []
  audit = []
  failAudit = false
  mocks.requireUser.mockResolvedValue(principal('SITE_ENGINEER'))
  mocks.prisma.company.findUnique.mockResolvedValue({ modulesJson: ['TASKS', 'SITES'], status: 'ACTIVE' })
  mocks.prisma.companyMember.findFirst.mockResolvedValue({ siteIds: [] })
  mocks.prisma.site.findFirst.mockImplementation(inMemoryDelegate(SITES).findFirst)
  mocks.tx.mediaAsset.create.mockImplementation(async ({ data }: { data: Row }) => {
    const row = { id: `asset_${assets.length + 1}`, ...data }
    assets.push(row)
    return { id: row.id }
  })
  mocks.tx.auditLog.create.mockImplementation(async ({ data }: { data: Row }) => {
    if (failAudit) throw new Error('audit store unavailable')
    audit.push(data)
    return data
  })
  mocks.prisma.$transaction.mockImplementation(async (fn: (client: typeof mocks.tx) => unknown) => {
    const snapshot = { assets: structuredClone(assets), audit: structuredClone(audit) }
    try {
      return await fn(mocks.tx)
    } catch (error) {
      assets = snapshot.assets
      audit = snapshot.audit
      throw error
    }
  })
  mocks.cloudinary.uploader.upload.mockImplementation((_file: string, _options: Row, callback: (error: unknown, result?: unknown) => void) => {
    callback(null, { public_id: PUBLIC_ID, secure_url: STORED_URL, format: 'jpg', bytes: 12, width: 10, height: 10 })
  })
  mocks.cloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' })
})

describe('POST /api/upload audits the MediaAsset it creates', () => {
  it('writes the asset and a MEDIA_ASSET CREATE event in one transaction', async () => {
    const response = await upload()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, assetId: 'asset_1' })

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(assets).toHaveLength(1)
    expect(audit).toEqual([{
      userId: 'user_site_engineer',
      companyId: 'company_1',
      module: 'MEDIA_ASSET',
      action: 'CREATE',
      recordId: 'asset_1',
      after: { mediaAssetId: 'asset_1', uploadModule: 'SITE_PHOTO', siteId: 'site_1', format: 'jpg', bytes: 12 },
    }])
  })

  it('never records the stored URL, provider public id or client file name', async () => {
    await upload()
    const serialized = JSON.stringify(audit)
    for (const leak of [STORED_URL, PUBLIC_ID, 'abc123', 'evil.test', 's3cret', 'token', '@acme.test']) {
      expect(serialized).not.toContain(leak)
    }
  })

  it('records a site-less upload with a null site', async () => {
    expect((await upload(null)).status).toBe(200)
    expect(audit[0]).toMatchObject({ companyId: 'company_1', recordId: 'asset_1', after: { siteId: null } })
  })

  it('rolls the asset back and removes the stored file when the audit fails', async () => {
    failAudit = true
    const response = await upload()

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.assetId).toBeUndefined()
    expect(body.url).toBeUndefined()
    expect(body.error).not.toMatch(/audit store/)
    expect(mocks.tx.mediaAsset.create).toHaveBeenCalledTimes(1)
    expect(assets).toEqual([])
    expect(audit).toEqual([])
    expect(mocks.cloudinary.uploader.destroy).toHaveBeenCalledWith(PUBLIC_ID, { resource_type: 'image' })
  })

  it('claims no asset audit when the storage upload fails', async () => {
    mocks.cloudinary.uploader.upload.mockImplementation((_file: string, _options: Row, callback: (error: unknown) => void) => {
      callback(new Error('Invalid api_key 1234567890'))
    })
    const response = await upload()

    expect(response.status).toBe(502)
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.tx.mediaAsset.create).not.toHaveBeenCalled()
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
  })

  it.each(['site_theirs', 'site_other'])('writes no asset or audit for an out-of-scope site %s', async (siteId) => {
    expect((await upload(siteId)).status).toBe(403)
    expect(mocks.cloudinary.uploader.upload).not.toHaveBeenCalled()
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled()
  })
})
