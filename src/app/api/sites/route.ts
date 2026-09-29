import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { requireApiPermission } from '@/lib/auth/require-api-permission'
import { assignedSiteScope } from '@/lib/auth/site-mutation'

/**
 * Active sites the live principal may pick from. Needs live `sites.view` with SITES on
 * and a tenant context — SUPER_ADMIN has none and is refused rather than listing every
 * tenant. The list is narrowed at the query to `assignedSiteScope`, so a SITE_ENGINEER or
 * SUPERVISOR reads only its assigned live sites.
 */
export async function GET() {
  const authResult = await requireApiPermission('sites.view', 'SITES')
  if (authResult instanceof NextResponse) return authResult

  if (!authResult.companyId) {
    return NextResponse.json({ error: 'FORBIDDEN: Tenant context required' }, { status: 403 })
  }

  const scope = await assignedSiteScope(authResult, authResult.companyId)

  const sites = await prisma.site.findMany({
    where: { ...scope, status: 'ACTIVE' },
    select: { id: true, name: true, status: true, progress: true, location: true, spent: true, budget: true, currentStage: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ sites })
}
