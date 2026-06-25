-- Add deletedAt to Company, User, Site (already in schema, missing from production DB)
-- These are nullable soft-delete columns — no data backfill required.

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "User"    ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Site"    ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
