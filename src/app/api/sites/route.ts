import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sites = await prisma.site.findMany({
    where: { companyId: session.user.companyId, deletedAt: null },
    select: { id: true, name: true, status: true, progress: true, location: true, spent: true, budget: true, currentStage: true },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ sites })
}
