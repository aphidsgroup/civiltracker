-- CreateEnum
CREATE TYPE "CompanyPlan" AS ENUM ('TRIAL', 'STARTER', 'GROWTH', 'ENTERPRISE', 'CUSTOM');

-- AlterEnum
BEGIN;
CREATE TYPE "CompanyStatus_new" AS ENUM ('ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED');
ALTER TABLE "Company" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Company" ALTER COLUMN "status" TYPE "CompanyStatus_new" USING ("status"::text::"CompanyStatus_new");
ALTER TYPE "CompanyStatus" RENAME TO "CompanyStatus_old";
ALTER TYPE "CompanyStatus_new" RENAME TO "CompanyStatus";
DROP TYPE "CompanyStatus_old";
ALTER TABLE "Company" ALTER COLUMN "status" SET DEFAULT 'TRIAL';
COMMIT;



-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "modulesJson" JSONB,
ADD COLUMN     "siteLimit" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "storageLimitMb" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "userLimit" INTEGER NOT NULL DEFAULT 5,
DROP COLUMN "plan",
ADD COLUMN     "plan" "CompanyPlan" NOT NULL DEFAULT 'TRIAL';

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "areaSqft" DECIMAL(10,2),
ADD COLUMN     "assignedEngineerId" TEXT,
ADD COLUMN     "assignedPmId" TEXT,
ADD COLUMN     "clientEmail" TEXT,
ADD COLUMN     "clientPhone" TEXT,
ADD COLUMN     "clientUserId" TEXT,
ADD COLUMN     "contractValue" DECIMAL(14,2),
ADD COLUMN     "floors" INTEGER,
ADD COLUMN     "mapLink" TEXT,
ADD COLUMN     "projectType" TEXT,
ADD COLUMN     "targetEndDate" TIMESTAMP(3);

