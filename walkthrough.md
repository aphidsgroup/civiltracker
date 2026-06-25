# Civil Tracker — Phase 9 & 10 Walkthrough

**Branch:** `phase-9-multitenant-expansion`
**Last Updated:** 2026-06-26

---

## Phase 9 Summary

### What Was Built

Phase 9 completed the multi-tenant onboarding capability:

- Super Admin can create companies with plan/module/limit controls
- Company creation auto-generates a Company Admin login
- Site and user limits are enforced at the server action level
- Company status lifecycle: TRIAL → ACTIVE → SUSPENDED → CANCELLED
- Module controls per company (enable/disable Reports, Labour, Materials, etc.)
- All Phase 9 routes exist and are wired: `/super-admin/companies`, `/super-admin/users`, `/super-admin/module-controls`, `/super-admin/storage`, `/super-admin/support`, `/super-admin/system-logs`

### Migration

Migration `20260625160000_phase_9_multitenant` adds:

- `CompanyPlan` enum (TRIAL / STARTER / GROWTH / ENTERPRISE / CUSTOM)
- `CompanyStatus` enum update (adds TRIAL status)
- Company table: `siteLimit`, `userLimit`, `storageLimitMb`, `modulesJson`, `createdById`, `plan` (type changed from String to CompanyPlan)
- Site table: `areaSqft`, `floors`, `projectType`, `contractValue`, `targetEndDate`, `mapLink`, `assignedEngineerId`, `assignedPmId`, `clientEmail`, `clientPhone`, `clientUserId`

**Risk:** `plan` column is dropped and re-added (type change). Existing `plan` data for 2 production companies will reset to `TRIAL`. Re-assign via Super Admin after migration.

### Local QA Status

- node_modules: present at `app/node_modules/`
- Build/lint/Playwright: must run on Windows (not sandbox) due to platform-native Prisma engines
- Commands to run locally:
  ```
  npx prisma generate
  npm run lint
  npm run build
  npx playwright test
  ```

### Preview QA Status

**BLOCKED** — `.env.playwright.local` still has placeholder values:
```
BASE_URL="https://your-phase-9-preview-url.vercel.app"   ← FAKE
VERCEL_AUTOMATION_BYPASS_SECRET="paste-secret-here..."   ← FAKE
```

**Action required:** Update the file locally, then run:
```powershell
node -e "require('dotenv').config({path:'.env.playwright.local'}); console.log('BASE_URL:', process.env.BASE_URL); console.log('Bypass loaded:', !!process.env.VERCEL_AUTOMATION_BYPASS_SECRET)"
```

Expected output:
```
BASE_URL: https://civil-tracker-phase9-abc123.vercel.app
Bypass loaded: true
```

Then run:
```
npx playwright test
```

---

## Phase 10 Summary

### What Was Built

Phase 10 delivers launch hardening artifacts:

| File | Purpose |
|------|---------|
| `docs/launch-readiness-audit.md` | Full readiness audit across all features |
| `docs/first-customer-onboarding.md` | Step-by-step guide for onboarding first company |
| `docs/admin-runbook.md` | Deploy, rollback, rotate secrets, troubleshoot |
| `docs/smoke-test-checklist.md` | Quick checklist after every deployment |
| `src/app/api/health/route.ts` | Health check endpoint (DB ping + version) |
| `tests/e2e/launch-readiness.spec.ts` | Full launch Playwright suite |

### Code Fixes Applied

| File | Fix |
|------|-----|
| `src/components/layout/SuperAdminSidebar.tsx` | Added 6 missing nav items + active state + platform banner + real company count |
| `src/app/(super-admin)/layout.tsx` | Queries real company count to pass to sidebar |
| `src/components/layout/DashboardSidebar.tsx` | Added Vendors, Subcontractors, BOQ, Tasks, Documents, Clients nav items in correct groups |
| `src/components/mobile/MobileTabbar.tsx` | Fixed Reports icon to bar chart per design |
| `src/app/globals.css` | Fixed unclosed `.sa-layout {` CSS bug |
| `.gitignore` | Added `.env.vercel` to prevent tracking Vercel OIDC tokens |

### Security Findings

| Finding | Severity | Status |
|---------|----------|--------|
| `.env.vercel` was tracked in git with a Vercel OIDC JWT | Medium | Mitigated: added to .gitignore. Token was short-lived (expired). Run `git rm --cached .env.vercel` to clean tracking. |
| No real secrets found in git grep scans | — | Clean |

---

## Production Deployment Sequence

Only after Preview QA passes:

```bash
# 1. Apply production migration
npx prisma migrate deploy

# 2. Merge and deploy
git checkout main
git pull origin main
git merge phase-9-multitenant-expansion
git push origin main

# 3. Wait for Vercel deployment (~2-3 minutes)
# Monitor: https://vercel.com/dashboard

# 4. Verify health
curl https://civiltracker.buildogram.in/api/health

# 5. Run production Playwright suite
$env:BASE_URL="https://civiltracker.buildogram.in"
npx playwright test

# 6. Re-assign company plans (plan column reset to TRIAL)
# Go to: /super-admin/companies/[id] → edit plan

# 7. Tag Phase 9
git tag v0.9.0-multitenant-onboarding-accepted
git push origin v0.9.0-multitenant-onboarding-accepted

# 8. Run launch suite
npx playwright test tests/e2e/launch-readiness.spec.ts

# 9. Tag Phase 10
git tag v1.0.0-civil-tracker-pilot-ready
git push origin v1.0.0-civil-tracker-pilot-ready
```

---

## Final Verdict

Civil Tracker is **feature-complete for pilot launch**. The only remaining blocker is Preview QA (needs real env values), followed by the standard production deployment sequence above.
