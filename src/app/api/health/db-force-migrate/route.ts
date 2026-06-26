import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
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
      } catch (err: any) {
        results.push({ stmt: stmt, status: 'error', error: err.message })
      }
    }
    
    return NextResponse.json({ success: true, results })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message, stack: error.stack })
  }
}
