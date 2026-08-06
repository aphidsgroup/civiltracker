import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth/require-super-admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireSuperAdmin()

    const rawSql = [
      `UPDATE "Company" SET "plan" = 'STARTER' WHERE "plan" = 'Starter';`,
      `UPDATE "Company" SET "plan" = 'PRO' WHERE "plan" = 'Pro';`,
      `UPDATE "Company" SET "plan" = 'FREE' WHERE "plan" = 'Free';`,
      `UPDATE "Company" SET "plan" = 'ENTERPRISE' WHERE "plan" = 'Enterprise';`
    ]

    const results = []

    for (const stmt of rawSql) {
      try {
        await prisma.$executeRawUnsafe(stmt)
        results.push({ stmt: stmt, status: 'success' })
      } catch (err: unknown) {
        results.push({
          stmt,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const stack = error instanceof Error ? error.stack : undefined
    const status = message.startsWith('FORBIDDEN:') ? 403 : 500
    return NextResponse.json({ success: false, error: message, stack }, { status })
  }
}
