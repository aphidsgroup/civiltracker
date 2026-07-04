import { auth } from '@/lib/auth'
import cloudinary from '@/lib/cloudinary'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { getCloudinaryFolder } from '@/lib/cloudinary'

const VALID_MODULES = ['BILL', 'SITE_PHOTO', 'DOCUMENT', 'SALARY_PROOF', 'DELIVERY_CHALLAN', 'QUALITY_PHOTO', 'SAFETY_PHOTO', 'PAYMENT_PROOF', 'general']

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File
  const moduleName = formData.get('module') as string ?? 'general'
  let siteId = formData.get('siteId') as string | null
  if (siteId === 'undefined' || siteId === 'null' || siteId?.trim() === '') {
    siteId = null
  }

  if (!VALID_MODULES.includes(moduleName)) {
    return NextResponse.json({ error: 'Forbidden: Invalid upload module' }, { status: 403 })
  }

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  // Resolve companyId — prefer session, fall back to site lookup, then CompanyMember
  let companyId = session.user.companyId ?? null

  if (!companyId && session.user.role !== 'SUPER_ADMIN') {
    if (siteId) {
      // Site engineer may not have companyId on token — look it up from the site
      const site = await prisma.site.findUnique({ where: { id: siteId }, select: { companyId: true } })
      if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })
      companyId = site.companyId
    } else {
      // Last resort: resolve from CompanyMember
      const member = await prisma.companyMember.findFirst({ where: { userId: session.user.id, isActive: true } })
      if (!member) return NextResponse.json({ error: 'Forbidden: No active company context' }, { status: 403 })
      companyId = member.companyId
    }
  }

  // If siteId provided, verify it belongs to the resolved companyId (skip for SUPER_ADMIN)
  if (siteId && session.user.role !== 'SUPER_ADMIN' && companyId) {
    const site = await prisma.site.findFirst({
      where: { id: siteId, companyId }
    })
    if (!site) {
      return NextResponse.json({ error: `Forbidden: Site access denied for company ${companyId}` }, { status: 403 })
    }
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const base64 = `data:${file.type};base64,${buffer.toString('base64')}`

  // Resolve companySlug — site engineers may not have it in their JWT
  let companySlug = session.user.companySlug ?? null
  if (!companySlug && companyId) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { slug: true } })
    companySlug = company?.slug ?? 'company'
  }
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
  } catch (cloudErr: any) {
    console.error('[Upload] Cloudinary error:', cloudErr?.message ?? cloudErr)
    return NextResponse.json({ error: `Upload failed: ${cloudErr?.message ?? 'Cloudinary error'}` }, { status: 500 })
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
          uploadedById: session.user.id,
        },
      })
    }
  } catch (dbErr: any) {
    console.error('[Upload] DB mediaAsset error:', dbErr?.message ?? dbErr)
    // Don't fail — image already uploaded to Cloudinary
  }

  return NextResponse.json({ success: true, url: result.secure_url, publicId: result.public_id })
}
