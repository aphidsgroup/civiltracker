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
      const targetCompanies = await prisma.company.findMany({
        where: {
          OR: [
            { slug: { contains: 'madras' } },
            { name: { contains: 'Madras', mode: 'insensitive' } }
          ]
        },
        select: { id: true, name: true }
      })
      const targetCompanyIds = targetCompanies.map(c => c.id)

      const targetUsers = await prisma.user.findMany({
        where: {
          OR: [
            { email: { contains: 'madrascrafters.in' } },
            { email: { contains: 'madras-crafters.in' } },
            { email: 'client@annanagar.in' }
          ]
        },
        select: { id: true, email: true }
      })
      const targetUserIds = targetUsers.map(u => u.id)

      log.push(`Found ${targetCompanies.length} companies, ${targetUsers.length} users to delete`)

      // Clean up standalone references
      await prisma.activityLog.deleteMany({
        where: { OR: [{ userId: { in: targetUserIds } }, { companyId: { in: targetCompanyIds } }] }
      }).catch(e => log.push('activityLog err: ' + String(e)))

      await prisma.auditLog.deleteMany({
        where: { OR: [{ userId: { in: targetUserIds } }, { companyId: { in: targetCompanyIds } }] }
      }).catch(e => log.push('auditLog err: ' + String(e)))

      await prisma.notification.deleteMany({
        where: { OR: [{ userId: { in: targetUserIds } }, { companyId: { in: targetCompanyIds } }] }
      }).catch(e => log.push('notification err: ' + String(e)))

      await prisma.reportExport.deleteMany({
        where: { OR: [{ generatedById: { in: targetUserIds } }, { companyId: { in: targetCompanyIds } }] }
      }).catch(e => log.push('reportExport err: ' + String(e)))

      await prisma.companyMember.deleteMany({
        where: { OR: [{ userId: { in: targetUserIds } }, { companyId: { in: targetCompanyIds } }] }
      }).catch(e => log.push('companyMember err: ' + String(e)))

      // Delete companies
      for (const c of targetCompanies) {
        try {
          await prisma.company.delete({ where: { id: c.id } })
          log.push(`Deleted company: ${c.name} (${c.id})`)
        } catch (e) {
          log.push(`Failed to delete company ${c.name}: ${String(e)}`)
        }
      }

      // Delete users
      for (const u of targetUsers) {
        try {
          await prisma.user.delete({ where: { id: u.id } })
          log.push(`Deleted user: ${u.email} (${u.id})`)
        } catch (e) {
          log.push(`Failed to delete user ${u.email}: ${String(e)}`)
        }
      }
    } catch (err) {
      log.push('General error: ' + String(err))
    }
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
    log,
    remainingUsers,
    remainingCompanies
  })
}
