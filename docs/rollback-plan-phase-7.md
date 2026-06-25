# Rollback Plan: Phase 7 Approval Workflow Engine

**Production Release Tag:** `v0.7.0-approval-workflow-engine`
**Previous Stable Tag:** `v0.6.1-permission-matrix-accepted`

If Phase 7 introduces critical production issues (e.g., users cannot submit expenses or approvals fail), execute this rollback procedure immediately to minimize downtime.

## 1. Approval Matrix and Triage
**Who can approve a rollback:**
- Company Founders or Lead Architect
- **Trigger:** Immediate P1 incident where expenses/DPR workflows are hard-blocked on production.

## 2. Vercel Code Rollback
1. Go to your **Vercel Dashboard** > **Deployments**.
2. Locate the deployment associated with `v0.6.1-permission-matrix-accepted` (or commit `a8adb8e` / `9913efb`).
3. Click the three dots `...` next to the deployment.
4. Select **"Promote to Production"** or **"Rollback"**.
5. Vercel will instantly swap the routing layer to point to the Phase 6.1 codebase. This takes ~5 seconds.

## 3. Neon Database Rollback
Because our Phase 7 database migration (`20260625110000_phase_7_non_destructive`) was **completely non-destructive**, the database does NOT need an immediate rollback!
- Phase 6.1 codebase relies on `comments`, `module`, `recordId`, and `status`.
- **These columns still exist in production and were untouched.**
- Therefore, simply rolling back the Vercel deployment is sufficient to restore functionality!

**If you absolutely must revert the database schema (Not Recommended unless Prisma throws errors):**
1. Do **not** use `prisma migrate reset` (it will wipe production).
2. Go to your **Neon Dashboard**.
3. Select your production branch (`br-odd-river-ao5l40om`).
4. Click **Restore to Point in Time**.
5. Select a timestamp from exactly 5 minutes *before* the `v0.7.0` deployment went live.
6. Note: Any expenses submitted *after* Phase 7 went live will be lost if you execute a Neon point-in-time restore. Only do this if data corruption occurred.

## 4. Phase 7.3 Warning
- Do **not** execute the Phase 7.3 cleanup (which will drop the legacy columns) until Phase 7 has survived at least one full production week without rollbacks.
- Once those columns are dropped, this seamless Vercel rollback plan will no longer work without a full Neon point-in-time database restore.
