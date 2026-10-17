import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth/require-super-admin'

export const dynamic = 'force-dynamic'

/**
 * Temporary diagnostic endpoint — checks which SA dashboard queries succeed.
 * Remove after root cause is identified.
 */
export async function GET() {
  try {
    await requireSuperAdmin()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: message.startsWith('FORBIDDEN:') ? 403 : 500 })
  }

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

  // Test 9: companyAsset count & findMany
  try {
    results.assetCount = await prisma.companyAsset.count()
  } catch (e: any) {
    results.assetCount = { error: e?.message || String(e), code: e?.code }
  }

  try {
    const assets = await prisma.companyAsset.findMany({ take: 2, include: { site: true } })
    results.assetsSample = assets.length
  } catch (e: any) {
    results.assetsSample = { error: e?.message || String(e), code: e?.code }
  }

  // Test 10: Check sites & users in DB
  try {
    const allUsers = await prisma.user.findMany({ select: { id: true, email: true, role: true } })
    results.allUsers = allUsers
    const allSites = await prisma.site.findMany({ select: { id: true, name: true, companyId: true, budget: true, spent: true } })
    results.allSites = allSites
  } catch (e: any) {
    results.allSitesError = e?.message || String(e)
  }

  return NextResponse.json(results)
}
