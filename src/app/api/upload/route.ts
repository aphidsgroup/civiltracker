import { auth } from '@/lib/auth'
import cloudinary from '@/lib/cloudinary'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { getCloudinaryFolder } from '@/lib/cloudinary'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File
  const module = formData.get('module') as string ?? 'general'
  const siteId = formData.get('siteId') as string | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const base64 = `data:${file.type};base64,${buffer.toString('base64')}`

  const companySlug = session.user.companySlug ?? 'company'
  const folder = getCloudinaryFolder(companySlug, siteId ?? 'general', module)

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

  // Save to MediaAsset
  await prisma.mediaAsset.create({
    data: {
      companyId: session.user.companyId!,
      siteId: siteId ?? null,
      module,
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
