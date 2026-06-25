import { auth } from '@/lib/auth'
import cloudinary from '@/lib/cloudinary'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { getCloudinaryFolder } from '@/lib/cloudinary'

const VALID_MODULES = ['BILL', 'SITE_PHOTO', 'DOCUMENT', 'SALARY_PROOF', 'DELIVERY_CHALLAN', 'QUALITY_PHOTO', 'SAFETY_PHOTO', 'PAYMENT_PROOF', 'general']

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.user.companyId && session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden: No active company context' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File
  const moduleName = formData.get('module') as string ?? 'general'
  const siteId = formData.get('siteId') as string | null

  if (!VALID_MODULES.includes(moduleName)) {
    return NextResponse.json({ error: 'Forbidden: Invalid upload module' }, { status: 403 })
  }

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const companyId = session.user.companyId!

  if (siteId && session.user.role !== 'SUPER_ADMIN') {
    const site = await prisma.site.findFirst({
      where: { id: siteId, companyId, deletedAt: null }
    })
    if (!site) {
      return NextResponse.json({ error: 'Forbidden: Site not found or access denied' }, { status: 403 })
    }
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const base64 = `data:${file.type};base64,${buffer.toString('base64')}`

  const companySlug = session.user.companySlug ?? 'company'
  const folder = getCloudinaryFolder(companySlug, siteId ?? 'general', moduleName)

  const result = await new Promise<{
    public_id: string; secure_url: string; format: string; bytes: number; width?: number; height?: number
  }>((resolve, reject) => {
    cloudinary.uploader.upload(base64, {
      folder,
      resource_type: 'auto',
      use_filename: true,
      unique_filename: true,
    }, (error, result) => {
      if (error) reject(error)
      else resolve(result as typeof result & { secure_url: string })
    })
  })

  await prisma.mediaAsset.create({
    data: {
      companyId: siteId ? (await prisma.site.findUnique({ where: { id: siteId } }))?.companyId || companyId : companyId,
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

  return NextResponse.json({ success: true, url: result.secure_url, publicId: result.public_id })
}
