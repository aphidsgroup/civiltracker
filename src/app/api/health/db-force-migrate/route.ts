import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rawSql = [
      // Site columns
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "areaSqft" DECIMAL(10,2);`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "floors" INTEGER;`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "budget" DECIMAL(14,2) NOT NULL DEFAULT 0;`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "contractValue" DECIMAL(14,2);`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "spent" DECIMAL(14,2) NOT NULL DEFAULT 0;`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "progress" INTEGER NOT NULL DEFAULT 0;`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "currentStage" TEXT;`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "targetEndDate" TIMESTAMP(3);`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "handoverDate" TIMESTAMP(3);`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "mapLink" TEXT;`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "projectType" TEXT;`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "contractType" TEXT;`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "clientName" TEXT;`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "clientPhone" TEXT;`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "clientEmail" TEXT;`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "clientId" TEXT;`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "clientUserId" TEXT;`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "assignedPmId" TEXT;`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "assignedEngineerId" TEXT;`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "engineerId" TEXT;`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "managerId" TEXT;`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "createdById" TEXT;`,
      `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "address" TEXT;`,
      
      // User columns
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatar" TEXT;`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;`,
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);`,

      // Fix enum values that might be in Title Case instead of UPPERCASE
      `UPDATE "Company" SET "plan" = 'GROWTH' WHERE "plan" = 'Growth';`,
      `UPDATE "Company" SET "plan" = 'ENTERPRISE' WHERE "plan" = 'Enterprise';`,
      `UPDATE "Company" SET "plan" = 'TRIAL' WHERE "plan" = 'Trial';`,
      
      // Also ensure backfill for Company slugs just in case it failed earlier
      `UPDATE "Company" SET "slug" = LOWER(REGEXP_REPLACE("name", '[^a-zA-Z0-9]+', '-', 'g')) || '-' || SUBSTRING("id", 1, 8) WHERE "slug" IS NULL;`
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
