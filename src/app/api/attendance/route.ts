import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { ensureCompanyContext, requireApiPermission } from '@/lib/auth/require-api-permission'

export async function POST(request: Request) {
  const authResult = await requireApiPermission('attendance.mark', 'LABOUR')
  if (authResult instanceof NextResponse) return authResult

  const companyContextError = ensureCompanyContext(authResult)
  if (companyContextError) return companyContextError

  const { attendance } = await request.json()
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const companyId = authResult.companyId

  const results = await Promise.all(
    attendance.map(async ({ labourId, status }: { labourId: string; status: string }) => {
      const labour = await prisma.labour.findFirst({
        where: { id: labourId, companyId: authResult.role === 'SUPER_ADMIN' ? undefined : companyId }
      })
      if (!labour || !status) return null

      return prisma.labourAttendance.upsert({
        where: { labourId_date: { labourId, date: today } },
        create: { labourId, siteId: labour.siteId, date: today, status: status as 'PRESENT', markedById: authResult.id },
        update: { status: status as 'PRESENT', markedById: authResult.id },
      })
    })
  )

  return NextResponse.json({ success: true, count: results.filter(Boolean).length })
}
