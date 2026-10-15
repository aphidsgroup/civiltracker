-- GPS-tagged site photo evidence.
--
-- Additive and non-destructive: all new columns are nullable or defaulted.
-- Existing (legacy) photos receive locationStatus = 'UNAVAILABLE' with NULL
-- coordinates; their unverified free-text "GPS:..." category values are NOT
-- promoted to structured location (the old client stored a fabricated
-- fallback coordinate) and are hidden from display by application code.

-- CreateEnum
CREATE TYPE "SitePhotoLocationStatus" AS ENUM ('DEVICE_REPORTED', 'UNAVAILABLE');

-- AlterTable
ALTER TABLE "SitePhoto" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "locationAccuracyMeters" DOUBLE PRECISION,
ADD COLUMN     "locationCapturedAt" TIMESTAMP(3),
ADD COLUMN     "locationStatus" "SitePhotoLocationStatus" NOT NULL DEFAULT 'UNAVAILABLE',
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "mediaAssetId" TEXT;

-- CreateIndex (one photo per server-verified upload; NULLs allowed for legacy rows)
CREATE UNIQUE INDEX "SitePhoto_mediaAssetId_key" ON "SitePhoto"("mediaAssetId");

-- AddForeignKey
ALTER TABLE "SitePhoto" ADD CONSTRAINT "SitePhoto_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A DEVICE_REPORTED row must carry complete, in-bounds telemetry.
-- Legacy rows (UNAVAILABLE, all NULL) satisfy this trivially.
ALTER TABLE "SitePhoto" ADD CONSTRAINT "SitePhoto_device_location_check" CHECK (
  "locationStatus" = 'UNAVAILABLE'
  OR (
    "latitude" IS NOT NULL AND "latitude" BETWEEN -90 AND 90
    AND "longitude" IS NOT NULL AND "longitude" BETWEEN -180 AND 180
    AND "locationAccuracyMeters" IS NOT NULL AND "locationAccuracyMeters" > 0
    AND "locationCapturedAt" IS NOT NULL
  )
);
