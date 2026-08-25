-- Link PurchaseOrder to Site (nullable, non-destructive).
-- Safe to re-run: guards each statement so it is a no-op if already applied.

ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "siteId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseOrder_siteId_fkey') THEN
    ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PurchaseOrder_siteId_idx" ON "PurchaseOrder"("siteId");
