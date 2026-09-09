import { requireUser } from '@/lib/auth/require-user'
import cloudinary from '@/lib/cloudinary'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { getCloudinaryFolder } from '@/lib/cloudinary'

const VALID_MODULES = ['BILL', 'SITE_PHOTO', 'DOCUMENT', 'SALARY_PROOF', 'DELIVERY_CHALLAN', 'QUALITY_PHOTO', 'SAFETY_PHOTO', 'PAYMENT_PROOF', 'GENERAL']

export async function POST(request: Request) {
  let user
  try {
    user = await requireUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File
  const moduleName = ((formData.get('module') as string) ?? 'general').toUpperCase()
  let siteId = formData.get('siteId') as string | null
  if (siteId === 'undefined' || siteId === 'null' || siteId?.trim() === '') {
    siteId = null
  }

  if (!VALID_MODULES.includes(moduleName)) {
    return NextResponse.json({ error: `Forbidden: Invalid upload module '${moduleName}'` }, { status: 403 })
  }

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  // Uploads must have a live, server-verified tenant context. Do not derive it
  // from client-controlled site IDs or an arbitrary membership fallback.
  const companyId = user.companyId
  if (!companyId) {
    return NextResponse.json({ error: 'Forbidden: A company context is required for uploads' }, { status: 403 })
  }

  // Verify every supplied site belongs to the verified company context.
  if (siteId) {
    const site = await prisma.site.findFirst({
      where: { id: siteId, companyId }
    })
    if (!site) {
      return NextResponse.json({ error: 'Forbidden: Site access denied' }, { status: 403 })
    }
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const base64 = `data:${file.type};base64,${buffer.toString('base64')}`

  const companySlug = user.companySlug ?? 'company'
  const folder = getCloudinaryFolder(companySlug ?? 'company', siteId ?? 'general', moduleName)

  let result: { public_id: string; secure_url: string; format: string; bytes: number; width?: number; height?: number }
  try {
    result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(base64, {
        folder,
        resource_type: 'auto',
        use_filename: true,
        unique_filename: true,
      }, (error, res) => {
        if (error) reject(error)
        else resolve(res as typeof result)
      })
    })
  } catch (cloudErr: unknown) {
    const message = cloudErr instanceof Error ? cloudErr.message : 'Cloudinary error'
    console.error('[Upload] Cloudinary error:', message)
    return NextResponse.json({ error: `Upload failed: ${message}` }, { status: 500 })
  }

  // Only create mediaAsset if we have a valid companyId
  try {
    if (companyId) {
      await prisma.mediaAsset.create({
        data: {
          companyId,
          siteId: siteId ?? null,
          module: moduleName,
          cloudinaryPublicId: result.public_id,
          secureUrl: result.secure_url,
          format: result.format,
          bytes: result.bytes,
          width: result.width,
          height: result.height,
          folder,
          originalName: file.name,
          uploadedById: user.id,
        },
      })
    }
  } catch (dbErr: unknown) {
    const message = dbErr instanceof Error ? dbErr.message : dbErr
    console.error('[Upload] DB mediaAsset error:', message)
    // Don't fail — image already uploaded to Cloudinary
  }

  return NextResponse.json({ success: true, url: result.secure_url, publicId: result.public_id })
}
