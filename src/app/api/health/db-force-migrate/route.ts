import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rawSql = [
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "userLimit" INTEGER NOT NULL DEFAULT 5;`,
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "siteLimit" INTEGER NOT NULL DEFAULT 1;`,
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "storageLimitMb" INTEGER NOT NULL DEFAULT 100;`,
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "storageUsed" FLOAT NOT NULL DEFAULT 0;`,
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "modulesJson" JSONB;`,
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "createdById" TEXT;`,
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "logo" TEXT;`,
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "slug" TEXT;`,
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "gst" TEXT;`,
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "phone" TEXT;`,
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "email" TEXT;`,
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "address" TEXT;`,
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "city" TEXT;`,
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "state" TEXT;`,
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "pincode" TEXT;`
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
