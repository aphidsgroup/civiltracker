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
  const log: string[] = []

  if (doDelete) {
    try {
      const companyId = 'cmr58be790000tpbyvjcu1q8n'
      const emails = [
        'admin@madrascrafters.in',
        'site@madrascrafters.in',
        'client@madrascrafters.in',
        'engineer@madrascrafters.in'
      ]

      await prisma.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE "companyId" = '${companyId}';`).catch(() => {})
      await prisma.$executeRawUnsafe(`DELETE FROM "Notification" WHERE "companyId" = '${companyId}';`).catch(() => {})
      await prisma.$executeRawUnsafe(`DELETE FROM "CompanyMember" WHERE "companyId" = '${companyId}';`).catch(() => {})
      await prisma.$executeRawUnsafe(`DELETE FROM "Expense" WHERE "companyId" = '${companyId}';`).catch(() => {})
      await prisma.$executeRawUnsafe(`DELETE FROM "LabourAttendance" WHERE "siteId" IN (SELECT "id" FROM "Site" WHERE "companyId" = '${companyId}');`).catch(() => {})
      await prisma.$executeRawUnsafe(`DELETE FROM "Labour" WHERE "companyId" = '${companyId}';`).catch(() => {})
      await prisma.$executeRawUnsafe(`DELETE FROM "SitePhoto" WHERE "siteId" IN (SELECT "id" FROM "Site" WHERE "companyId" = '${companyId}');`).catch(() => {})
      await prisma.$executeRawUnsafe(`DELETE FROM "DailyProgressReport" WHERE "siteId" IN (SELECT "id" FROM "Site" WHERE "companyId" = '${companyId}');`).catch(() => {})
      await prisma.$executeRawUnsafe(`DELETE FROM "Site" WHERE "companyId" = '${companyId}';`).catch(() => {})
      await prisma.$executeRawUnsafe(`DELETE FROM "Company" WHERE "id" = '${companyId}';`).catch(() => {})
      log.push('Purged Company Madras Crafters')

      for (const email of emails) {
        await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE "email" = '${email}';`).catch(() => {})
        log.push(`Purged User ${email}`)
      }
    } catch (err: unknown) {
      log.push('SQL Error: ' + String(err))
    }
  }

  const remainingUsers = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true }
  })
  const remainingCompanies = await prisma.company.findMany({
    select: { id: true, name: true, slug: true, status: true, deletedAt: true }
  })

  return NextResponse.json({
    dbHost: process.env.DATABASE_URL ? process.env.DATABASE_URL.split('@')[1]?.split('/')[0] : 'unknown',
    log,
    remainingUsers,
    remainingCompanies
  })
}
