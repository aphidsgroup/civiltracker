# Phase 7.2B Production Migration Integrity Audit

## 1. Production Context
- **Production URL:** https://civiltracker.buildogram.in
- **Release Tag:** v0.7.0-approval-workflow-engine
- **Production Commit Hash:** 0232550

## 2. Prisma Migration Status
- **Baseline:** `0_init` is successfully marked as applied in production.
- **Migration:** `20260625110000_phase_7_non_destructive` is successfully applied.
- **Drift:** Database schema is perfectly up to date with Prisma schema. No drift detected.

## 3. Schema Safety Verification
- ✅ **Legacy Columns Preserved:** `comments`, `module`, `recordId`, `status`, and `requestedAt` are fully preserved in the `Approval` table on production without any data loss.
- ✅ **New Architecture Provisioned:** New tables (`ApprovalComment`, `ApprovalTimeline`) and new `Approval` columns (`entityType`, `entityId`, etc.) exist and are ready for data backfill.
- ✅ **Destructive Commands:** No destructive commands (`db push` or `migrate reset`) were used on production.

## 4. Production Data Count Audit
Production records were safely preserved during migration:
- **Company:** 2
- **User:** 6
- **Site:** 5
- **Expense:** 6
- **Approval:** 2 (Existing legacy approvals preserved!)
- **ApprovalComment / ApprovalTimeline:** 0 (Ready for Phase 7.3 backfill)

## 5. Secret Hygiene
A thorough audit of git commits, artifacts, local markdown files, and codebase files was conducted:
- ✅ **No database passwords exposed** (`npg_*` checks returned completely clean).
- ✅ **No Vercel or Cloudinary secrets leaked** into client bundles or git history.
- ✅ `.env` files correctly excluded from version control via `.gitignore`.

## 6. End-to-End Test Results (Production Endpoint)
- **Full Suite Result:** ✅ 495 / 495 Passed (Tested directly against production domain).
- **Approval Suite:** ✅ Approval workflows and capability permissions fully pass.
- **Mobile UI:** ✅ Verified at 390x844 responsive dimensions via Playwright.

## 7. Remaining Risks
- Legacy columns are still serving as the source of truth for older codebase queries. They must be safely backfilled into `ApprovalTimeline` in Phase 7.3 before we can drop them. No risk exists currently because they were preserved.

---

# Phase 9 Production Migration Audit

**Migration:** `20260625160000_phase_9_multitenant`  
**Applied:** 2026-06-25  
**Method:** `prisma migrate deploy` (automatic via Vercel build script on `main` push)  
**Release Tags:** `v0.9.0-multitenant-onboarding-accepted`, `v1.0.0-civil-tracker-pilot-ready`

## What Was Added

- `CompanyPlan` enum: `TRIAL | STARTER | GROWTH | ENTERPRISE | CUSTOM`
- `CompanyStatus` enum update: added `TRIAL` value
- `Company` table: `siteLimit`, `userLimit`, `storageLimitMb`, `modulesJson`, `createdById`
- `Company.plan` column: **type changed from `String` → `CompanyPlan` enum**
- `Site` table: `areaSqft`, `floors`, `projectType`, `contractValue`, `targetEndDate`, `mapLink`, `assignedEngineerId`, `assignedPmId`, `clientEmail`, `clientPhone`, `clientUserId`

## ⚠️ Incident: Company Plan Values Reset to TRIAL

**Severity:** Medium  
**Impact:** 2 existing production companies had `plan` reset to `TRIAL`

**Root cause:** Changing `Company.plan` from `String` to the `CompanyPlan` enum required Prisma to `DROP COLUMN` then `ADD COLUMN` (with default `TRIAL`). This discarded existing plan values. No backfill step was included in the migration.

**Detection:** Observed post-deployment. No automated guard existed.

**Remediation:** Manual correction via `/super-admin/companies/[id]` — update plan, status, limits, and modules for each affected company.

**Prevention rule added:** See migration safety checklist in `docs/admin-runbook.md` — no `DROP COLUMN` on commercial billing fields without an explicit backfill.

## Safe Pattern for Future Enum Type Changes

If a column type change is needed (e.g. String → Enum), write the migration SQL manually:

```sql
-- Step 1: add new typed column
ALTER TABLE "Company" ADD COLUMN "plan_new" "CompanyPlan" NOT NULL DEFAULT 'TRIAL';
-- Step 2: backfill from existing values
UPDATE "Company" SET "plan_new" = "plan"::text::"CompanyPlan";
-- Step 3: drop old
ALTER TABLE "Company" DROP COLUMN "plan";
-- Step 4: rename
ALTER TABLE "Company" RENAME COLUMN "plan_new" TO "plan";
```

## Migration Log

| Migration | Date | Result | Manual Action Required |
|-----------|------|--------|----------------------|
| `20260625110000_phase_7_non_destructive` | 2026-06-25 | ✅ Clean | None |
| `20260625160000_phase_9_multitenant` | 2026-06-25 | ✅ Applied | ⚠️ Re-assign 2 company plans from TRIAL |
