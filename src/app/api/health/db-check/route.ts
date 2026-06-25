import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Temporary diagnostic endpoint — checks which SA dashboard queries succeed.
 * Remove after root cause is identified.
 */
export async function GET() {
  const results: Record<string, unknown> = {}

  // Test 1: plain count (works in layout)
  try {
    results.companyCount = await prisma.company.count()
  } catch (e) {
    results.companyCount = { error: String(e) }
  }

  // Test 2: count with deletedAt filter (used in dashboard)
  try {
    results.companyCountDeletedAt = await prisma.company.count({ where: { deletedAt: null } })
  } catch (e) {
    results.companyCountDeletedAt = { error: String(e) }
  }

  // Test 3: count with status filter
  try {
    results.companyCountActive = await prisma.company.count({ where: { status: 'ACTIVE' } })
  } catch (e) {
    results.companyCountActive = { error: String(e) }
  }

  // Test 4: user count with deletedAt
  try {
    results.userCountDeletedAt = await prisma.user.count({ where: { deletedAt: null } })
  } catch (e) {
    results.userCountDeletedAt = { error: String(e) }
  }

  // Test 5: site count with deletedAt
  try {
    results.siteCountDeletedAt = await prisma.site.count({ where: { deletedAt: null } })
  } catch (e) {
    results.siteCountDeletedAt = { error: String(e) }
  }

  // Test 6: aggregate storageUsed
  try {
    const agg = await prisma.company.aggregate({ _sum: { storageUsed: true } })
    results.storageAgg = agg._sum.storageUsed
  } catch (e) {
    results.storageAgg = { error: String(e) }
  }

  // Test 7: findMany with _count include
  try {
    const companies = await prisma.company.findMany({
      take: 2,
      include: { _count: { select: { sites: true, members: true } } }
    })
    results.findManyCount = companies.length
  } catch (e) {
    results.findManyCount = { error: String(e) }
  }

  // Test 8: findMany with full include (companies list query)
  try {
    const companies = await prisma.company.findMany({
      take: 1,
      include: {
        members: { where: { role: 'COMPANY_ADMIN' }, include: { user: true } },
        sites: true,
        _count: { select: { members: true, sites: true } }
      }
    })
    results.findManyFull = companies.length
  } catch (e) {
    results.findManyFull = { error: String(e) }
  }

  return NextResponse.json(results)
}
