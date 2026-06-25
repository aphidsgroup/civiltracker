import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { attendance } = await request.json()
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const results = await Promise.all(
    attendance.map(async ({ labourId, status }: { labourId: string; status: string }) => {
      // Verify labour belongs to company
      const labour = await prisma.labour.findFirst({ where: { id: labourId, companyId: session.user.companyId } })
      if (!labour || !status) return null

      return prisma.labourAttendance.upsert({
        where: { labourId_date: { labourId, date: today } },
        create: { labourId, siteId: labour.siteId, date: today, status: status as 'PRESENT', markedById: session.user.id },
        update: { status: status as 'PRESENT', markedById: session.user.id },
      })
    })
  )

  return NextResponse.json({ success: true, count: results.filter(Boolean).length })
}
