-- Phase 9 columns that were added to the migration file AFTER it ran in production.
-- All statements use IF NOT EXISTS so this is safe to run even if some columns already exist.

-- Company columns (Phase 9 AlterTable that didn't apply)
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "userLimit"      INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "siteLimit"      INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "storageLimitMb" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "storageUsed"    FLOAT   NOT NULL DEFAULT 0;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "modulesJson"    JSONB;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "createdById"    TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "logo"           TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "slug"           TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "gst"            TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "phone"          TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "email"          TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "address"        TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "city"           TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "state"          TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "pincode"        TEXT;

-- Site columns (Phase 9 AlterTable that didn't apply)
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "areaSqft"           DECIMAL(10,2);
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "floors"             INTEGER;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "budget"             DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "contractValue"      DECIMAL(14,2);
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "spent"              DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "progress"           INTEGER       NOT NULL DEFAULT 0;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "currentStage"       TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "startDate"          TIMESTAMP(3);
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "targetEndDate"      TIMESTAMP(3);
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "handoverDate"       TIMESTAMP(3);
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "mapLink"            TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "projectType"        TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "contractType"       TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "clientName"         TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "clientPhone"        TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "clientEmail"        TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "clientId"           TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "clientUserId"       TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "assignedPmId"       TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "assignedEngineerId" TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "engineerId"         TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "managerId"          TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "createdById"        TEXT;
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "address"            TEXT;

-- User columns that may be missing
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatar"      TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive"    BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

-- Make Company.slug unique index only if slug column has no nulls (safe to skip if already exists)
DO $$
BEGIN
  -- Backfill slug from id for any companies missing it
  UPDATE "Company" SET "slug" = LOWER(REGEXP_REPLACE("name", '[^a-zA-Z0-9]+', '-', 'g')) || '-' || SUBSTRING("id", 1, 8)
  WHERE "slug" IS NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
