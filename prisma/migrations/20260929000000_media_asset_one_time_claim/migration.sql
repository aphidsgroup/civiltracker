-- One-time claim of an uploaded MediaAsset by the evidence record it backs
-- (bill attachment, site photo, checklist photo). See src/lib/uploads/media-claim.ts.
--
-- Additive and idempotent: three nullable columns, no default rewrite, no constraint that
-- existing rows could violate. "MediaAsset", "SitePhoto" and "BillAttachment" were created
-- outside the tracked migration history (db push), so every statement is guarded on the
-- table existing; on a database where they do not exist yet, `prisma db push` / the schema
-- creates them with these columns already present.
--
-- Deploy order: apply this migration BEFORE deploying code that reads or writes the
-- columns. The previous release ignores them, so applying it early is safe.

DO $$
BEGIN
  IF to_regclass('"MediaAsset"') IS NULL THEN
    RAISE NOTICE 'MediaAsset table not present; skipping claim columns';
    RETURN;
  END IF;

  ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "consumedAt"       TIMESTAMP(3);
  ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "consumedBy"       TEXT;
  ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "consumedRecordId" TEXT;

  -- Backfill: an upload an evidence row already points at is consumed. Its owner is not
  -- recorded, so it is marked LEGACY; it can never be claimed again, and deleting any
  -- record that references it may release it once nothing else does.
  IF to_regclass('"SitePhoto"') IS NOT NULL THEN
    UPDATE "MediaAsset" AS ma
       SET "consumedAt" = CURRENT_TIMESTAMP, "consumedBy" = 'LEGACY'
     WHERE ma."consumedAt" IS NULL
       AND EXISTS (SELECT 1 FROM "SitePhoto" sp WHERE sp."cloudinaryPublicId" = ma."cloudinaryPublicId");
  END IF;

  IF to_regclass('"BillAttachment"') IS NOT NULL THEN
    UPDATE "MediaAsset" AS ma
       SET "consumedAt" = CURRENT_TIMESTAMP, "consumedBy" = 'LEGACY'
     WHERE ma."consumedAt" IS NULL
       AND EXISTS (SELECT 1 FROM "BillAttachment" ba WHERE ba."cloudinaryPublicId" = ma."cloudinaryPublicId");
  END IF;
END
$$;
