import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')
  if (key !== 'clean_civil_tracker_2026') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const doDelete = searchParams.get('delete') === 'true'
  let deletedResult = null

  if (doDelete) {
    // 1. Delete users
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        OR: [
          { email: { contains: 'madrascrafters.in' } },
          { email: { contains: 'madras-crafters.in' } },
          { email: 'client@annanagar.in' }
        ]
      }
    })

    // 2. Delete test companies
    const deletedCompanies = await prisma.company.deleteMany({
      where: {
        OR: [
          { slug: { contains: 'madras' } },
          { name: { contains: 'Madras', mode: 'insensitive' } }
        ]
      }
    })

    deletedResult = { deletedUsers, deletedCompanies }
  }

  // Fetch remaining state
  const remainingUsers = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true }
  })
  const remainingCompanies = await prisma.company.findMany({
    select: { id: true, name: true, slug: true, status: true, deletedAt: true }
  })

  return NextResponse.json({
    dbHost: process.env.DATABASE_URL ? process.env.DATABASE_URL.split('@')[1]?.split('/')[0] : 'unknown',
    deletedResult,
    remainingUsers,
    remainingCompanies
  })
}
