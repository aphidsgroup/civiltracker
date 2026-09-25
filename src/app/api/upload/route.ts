import { requireUser } from '@/lib/auth/require-user'
import { requireModuleEnabled } from '@/lib/auth/require-module'
import cloudinary from '@/lib/cloudinary'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/permissions'
import { NextResponse } from 'next/server'
import { getCloudinaryFolder } from '@/lib/cloudinary'
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_FORMATS,
  declaredTypeMatches,
  sniffUploadMime,
  uploadPolicyFor,
} from '@/lib/uploads/upload-policy'

/** Multipart framing and the other form fields on top of the file itself. */
const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 64 * 1024

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

function fieldText(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** A display name only: never used for storage paths. */
function safeOriginalName(name: string): string | null {
  const base = name.split(/[\\/]/).pop()?.trim() ?? ''
  return base ? base.slice(0, 255) : null
}

/*
 * Upload one file into a tenant-owned MediaAsset.
 *
 * The live principal must hold the upload module's permission and its company must have
 * the module enabled, both before any tenant query. The file is capped at 10 MB and typed
 * from its leading bytes against the module's allowlist; the client's type and name are
 * never trusted. A supplied site must be a live site of the live company. Cloudinary only
 * stores images/PDFs of the allowed formats under a random public id, and the MediaAsset
 * row is mandatory: if it cannot be written the stored file is removed again.
 */
export async function POST(request: Request) {
  let user
  try {
    user = await requireUser()
  } catch {
    return fail('Unauthorized', 401)
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return fail('File is too large. The limit is 10 MB.', 413)
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return fail('Invalid upload request', 400)
  }

  const resolved = uploadPolicyFor(fieldText(formData.get('module')))
  if (!resolved) {
    return fail('Forbidden: Invalid upload module', 403)
  }
  const { name: moduleName, policy } = resolved

  if (!policy.permissions.some((permission) => hasPermission(user.role, permission))) {
    return fail(`FORBIDDEN: Missing required permission ${policy.permissions.map((p) => `"${p}"`).join(' or ')}`, 403)
  }
  const companyId = user.companyId
  if (!companyId) {
    return fail('Forbidden: A company context is required for uploads', 403)
  }
  try {
    await requireModuleEnabled(policy.module)
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : 'Forbidden', 403)
  }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return fail('No file provided', 400)
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return fail('File is too large. The limit is 10 MB.', 413)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.length === 0) return fail('No file provided', 400)
  if (buffer.length > MAX_UPLOAD_BYTES) return fail('File is too large. The limit is 10 MB.', 413)

  const mime = sniffUploadMime(buffer)
  if (!mime || !policy.accepts.includes(mime) || !declaredTypeMatches(file.type, mime)) {
    return fail('Unsupported file type', 415)
  }

  const rawSiteId = fieldText(formData.get('siteId'))
  const siteId = rawSiteId && rawSiteId !== 'undefined' && rawSiteId !== 'null' ? rawSiteId : null
  if (siteId) {
    const site = await prisma.site.findFirst({
      where: { id: siteId, companyId, deletedAt: null },
      select: { id: true },
    })
    if (!site) {
      return fail('Forbidden: Site access denied', 403)
    }
  }

  const folder = getCloudinaryFolder(user.companySlug ?? 'company', siteId ?? 'general', moduleName)

  let result: { public_id: string; secure_url: string; format: string; bytes: number; width?: number; height?: number }
  try {
    result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(`data:${mime};base64,${buffer.toString('base64')}`, {
        folder,
        resource_type: 'image',
        allowed_formats: policy.accepts.map((type) => UPLOAD_FORMATS[type]),
        use_filename: false,
        unique_filename: true,
        overwrite: false,
      }, (error, res) => {
        if (error || !res) reject(error ?? new Error('Empty upload result'))
        else resolve(res as typeof result)
      })
    })
  } catch (cloudErr: unknown) {
    const message = cloudErr instanceof Error ? cloudErr.message : 'Cloudinary error'
    console.error('[Upload] Cloudinary error:', message)
    return fail('Upload failed. Please try again.', 502)
  }

  let asset: { id: string }
  try {
    asset = await prisma.mediaAsset.create({
      data: {
        companyId,
        siteId,
        module: moduleName,
        cloudinaryPublicId: result.public_id,
        secureUrl: result.secure_url,
        format: result.format,
        bytes: result.bytes ?? buffer.length,
        width: result.width,
        height: result.height,
        folder,
        originalName: safeOriginalName(file.name),
        uploadedById: user.id,
      },
      select: { id: true },
    })
  } catch (dbErr: unknown) {
    console.error('[Upload] DB mediaAsset error:', dbErr instanceof Error ? dbErr.message : dbErr)
    // An asset no tenant record points at must not stay reachable.
    try {
      await cloudinary.uploader.destroy(result.public_id, { resource_type: 'image' })
    } catch (cleanupErr: unknown) {
      console.error('[Upload] Cloudinary cleanup error:', cleanupErr instanceof Error ? cleanupErr.message : cleanupErr)
    }
    return fail('Upload could not be recorded. Please try again.', 500)
  }

  return NextResponse.json({ success: true, assetId: asset.id, url: result.secure_url, publicId: result.public_id })
}
