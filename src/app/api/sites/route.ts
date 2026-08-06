import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { ensureCompanyContext, requireApiPermission } from '@/lib/auth/require-api-permission'

export async function GET() {
  const authResult = await requireApiPermission('sites.view', 'SITES')
  if (authResult instanceof NextResponse) return authResult

  const companyContextError = ensureCompanyContext(authResult)
  if (companyContextError) return companyContextError

  const companyFilter = authResult.role === 'SUPER_ADMIN' ? {} : { companyId: authResult.companyId }

  const sites = await prisma.site.findMany({
    where: { ...companyFilter, deletedAt: null, status: 'ACTIVE' },
    select: { id: true, name: true, status: true, progress: true, location: true, spent: true, budget: true, currentStage: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ sites })
}
