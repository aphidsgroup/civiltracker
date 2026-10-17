import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth/require-super-admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireSuperAdmin()

    const rawSql = [
      `DO $$ BEGIN
        CREATE TYPE "AssetStatus" AS ENUM ('OPERATIONAL', 'IN_USE', 'UNDER_MAINTENANCE', 'STANDBY', 'DAMAGED', 'DECOMMISSIONED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,

      `CREATE TABLE IF NOT EXISTS "CompanyAsset" (
        "id" TEXT NOT NULL,
        "companyId" TEXT NOT NULL,
        "siteId" TEXT,
        "name" TEXT NOT NULL,
        "assetCode" TEXT,
        "category" TEXT NOT NULL,
        "brand" TEXT,
        "modelNumber" TEXT,
        "serialNumber" TEXT,
        "quantity" INTEGER NOT NULL DEFAULT 1,
        "unit" TEXT NOT NULL DEFAULT 'Nos',
        "status" "AssetStatus" NOT NULL DEFAULT 'OPERATIONAL',
        "conditionNotes" TEXT,
        "purchaseDate" TIMESTAMP(3),
        "purchaseCost" DECIMAL(14,2),
        "currentValue" DECIMAL(14,2),
        "assignedTo" TEXT,
        "locationName" TEXT,
        "notes" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP(3),
        CONSTRAINT "CompanyAsset_pkey" PRIMARY KEY ("id")
      );`,

      `CREATE INDEX IF NOT EXISTS "CompanyAsset_companyId_idx" ON "CompanyAsset"("companyId");`,
      `CREATE INDEX IF NOT EXISTS "CompanyAsset_siteId_idx" ON "CompanyAsset"("siteId");`,
      `CREATE INDEX IF NOT EXISTS "CompanyAsset_category_idx" ON "CompanyAsset"("category");`,
      `CREATE INDEX IF NOT EXISTS "CompanyAsset_status_idx" ON "CompanyAsset"("status");`,

      `CREATE TABLE IF NOT EXISTS "CompanyCatalogueItem" (
        "id" TEXT NOT NULL,
        "companyId" TEXT NOT NULL,
        "category" TEXT NOT NULL,
        "materialName" TEXT NOT NULL,
        "variantId" TEXT NOT NULL,
        "specification" TEXT NOT NULL,
        "brand" TEXT,
        "defaultUnit" TEXT NOT NULL,
        "allowedUnits" TEXT,
        "isDecimalAllowed" BOOLEAN NOT NULL DEFAULT false,
        "packSize" TEXT,
        "baseUnit" TEXT,
        "conversionFactor" DECIMAL(10,4),
        "aliases" TEXT,
        "notes" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CompanyCatalogueItem_pkey" PRIMARY KEY ("id")
      );`,

      `CREATE INDEX IF NOT EXISTS "CompanyCatalogueItem_companyId_idx" ON "CompanyCatalogueItem"("companyId");`,
      `CREATE INDEX IF NOT EXISTS "CompanyCatalogueItem_category_idx" ON "CompanyCatalogueItem"("category");`,
      `CREATE INDEX IF NOT EXISTS "CompanyCatalogueItem_materialName_idx" ON "CompanyCatalogueItem"("materialName");`
    ]

    const results = []

    for (const stmt of rawSql) {
      try {
        await prisma.$executeRawUnsafe(stmt)
        results.push({ stmt: stmt.substring(0, 40) + '...', status: 'success' })
      } catch (err: unknown) {
        results.push({
          stmt: stmt.substring(0, 40) + '...',
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
