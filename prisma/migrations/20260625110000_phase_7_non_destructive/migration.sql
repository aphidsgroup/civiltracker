-- Step 1: Create Enums
CREATE TYPE "ApprovalEntityType" AS ENUM ('EXPENSE', 'BILL', 'SALARY_RUN', 'MATERIAL_REQUEST', 'PURCHASE_ORDER', 'DPR', 'VARIATION', 'DOCUMENT');
CREATE TYPE "ApprovalPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

ALTER TYPE "ApprovalStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "ApprovalStatus" ADD VALUE 'PENDING_REVIEW';
ALTER TYPE "ApprovalStatus" ADD VALUE 'CLOSED';
ALTER TYPE "ApprovalStatus" ADD VALUE 'CANCELLED';

-- DropForeignKey
ALTER TABLE "Approval" DROP CONSTRAINT "Approval_expense_fkey";
-- DropIndex
DROP INDEX "Approval_module_idx";
DROP INDEX "Approval_status_idx";

-- Step 2: Add columns as NULLABLE first
ALTER TABLE "Approval" ADD COLUMN "amount" DECIMAL(14,2);
ALTER TABLE "Approval" ADD COLUMN "approvalType" TEXT DEFAULT 'OPERATIONAL';
ALTER TABLE "Approval" ADD COLUMN "closedAt" TIMESTAMP(3);
ALTER TABLE "Approval" ADD COLUMN "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Approval" ADD COLUMN "currentStatus" "ApprovalStatus" DEFAULT 'PENDING';
ALTER TABLE "Approval" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Approval" ADD COLUMN "description" TEXT;
ALTER TABLE "Approval" ADD COLUMN "entityId" TEXT;
ALTER TABLE "Approval" ADD COLUMN "entityType" "ApprovalEntityType";
ALTER TABLE "Approval" ADD COLUMN "metadataJson" JSONB;
ALTER TABLE "Approval" ADD COLUMN "priority" "ApprovalPriority" DEFAULT 'NORMAL';
ALTER TABLE "Approval" ADD COLUMN "rejectedById" TEXT;
ALTER TABLE "Approval" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "Approval" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "Approval" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "Approval" ADD COLUMN "submittedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Approval" ADD COLUMN "title" TEXT;
ALTER TABLE "Approval" ADD COLUMN "updatedAt" TIMESTAMP(3);

-- Step 3: Backfill data from legacy columns to new columns
UPDATE "Approval" SET
  "entityId" = COALESCE("recordId", 'legacy-record'),
  "entityType" = CASE 
    WHEN "module"::TEXT = 'EXPENSE' THEN 'EXPENSE'::"ApprovalEntityType"
    WHEN "module"::TEXT = 'BILL' THEN 'BILL'::"ApprovalEntityType"
    WHEN "module"::TEXT = 'SALARY_RUN' THEN 'SALARY_RUN'::"ApprovalEntityType"
    WHEN "module"::TEXT = 'MATERIAL_REQUEST' THEN 'MATERIAL_REQUEST'::"ApprovalEntityType"
    WHEN "module"::TEXT = 'PURCHASE_ORDER' THEN 'PURCHASE_ORDER'::"ApprovalEntityType"
    WHEN "module"::TEXT = 'DPR' THEN 'DPR'::"ApprovalEntityType"
    WHEN "module"::TEXT = 'VARIATION' THEN 'VARIATION'::"ApprovalEntityType"
    WHEN "module"::TEXT = 'DOCUMENT' THEN 'DOCUMENT'::"ApprovalEntityType"
    ELSE 'EXPENSE'::"ApprovalEntityType"
  END,
  "currentStatus" = COALESCE("status", 'PENDING'),
  "title" = COALESCE("module"::TEXT, 'Approval') || ' ' || COALESCE("recordId", ''),
  "createdAt" = COALESCE("requestedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP;

-- Step 4: Enforce NOT NULL constraints
ALTER TABLE "Approval" ALTER COLUMN "entityId" SET NOT NULL;
ALTER TABLE "Approval" ALTER COLUMN "entityType" SET NOT NULL;
ALTER TABLE "Approval" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "Approval" ALTER COLUMN "approvalType" SET NOT NULL;
ALTER TABLE "Approval" ALTER COLUMN "currentStatus" SET NOT NULL;
ALTER TABLE "Approval" ALTER COLUMN "priority" SET NOT NULL;
ALTER TABLE "Approval" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "Approval" ALTER COLUMN "submittedAt" SET NOT NULL;
ALTER TABLE "Approval" ALTER COLUMN "updatedAt" SET NOT NULL;

-- Make old columns nullable and drop defaults
ALTER TABLE "Approval" ALTER COLUMN "recordId" DROP NOT NULL;
ALTER TABLE "Approval" ALTER COLUMN "requestedAt" DROP NOT NULL;
ALTER TABLE "Approval" ALTER COLUMN "requestedAt" DROP DEFAULT;
ALTER TABLE "Approval" ALTER COLUMN "status" DROP NOT NULL;
ALTER TABLE "Approval" ALTER COLUMN "status" DROP DEFAULT;

-- Step 5: Create new tables and indexes
CREATE TABLE "ApprovalComment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalTimeline" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" "ApprovalStatus",
    "toStatus" "ApprovalStatus" NOT NULL,
    "note" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalTimeline_pkey" PRIMARY KEY ("id")
);

-- Note: Migrate existing comments if any
INSERT INTO "ApprovalComment" ("id", "companyId", "approvalId", "userId", "comment", "createdAt")
SELECT gen_random_uuid()::text, "companyId", "id", "requestedById", "comments", CURRENT_TIMESTAMP
FROM "Approval"
WHERE "comments" IS NOT NULL AND "comments" != '';

CREATE INDEX "ApprovalComment_companyId_idx" ON "ApprovalComment"("companyId");
CREATE INDEX "ApprovalComment_approvalId_idx" ON "ApprovalComment"("approvalId");
CREATE INDEX "ApprovalTimeline_companyId_idx" ON "ApprovalTimeline"("companyId");
CREATE INDEX "ApprovalTimeline_approvalId_idx" ON "ApprovalTimeline"("approvalId");
CREATE INDEX "Approval_siteId_idx" ON "Approval"("siteId");
CREATE INDEX "Approval_entityType_entityId_idx" ON "Approval"("entityType", "entityId");
CREATE INDEX "Approval_currentStatus_idx" ON "Approval"("currentStatus");
CREATE INDEX "Approval_priority_idx" ON "Approval"("priority");

ALTER TABLE "Approval" ADD CONSTRAINT "Approval_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApprovalComment" ADD CONSTRAINT "ApprovalComment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalComment" ADD CONSTRAINT "ApprovalComment_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalComment" ADD CONSTRAINT "ApprovalComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalTimeline" ADD CONSTRAINT "ApprovalTimeline_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalTimeline" ADD CONSTRAINT "ApprovalTimeline_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalTimeline" ADD CONSTRAINT "ApprovalTimeline_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
