import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.user.companyId && session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized: No active company context' }, { status: 401 })
  }

  const companyFilter = session.user.role === 'SUPER_ADMIN' ? {} : { companyId: session.user.companyId }

  const sites = await prisma.site.findMany({
    where: { ...companyFilter, deletedAt: null },
    select: { id: true, name: true, status: true, progress: true, location: true, spent: true, budget: true, currentStage: true },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ sites })
}
