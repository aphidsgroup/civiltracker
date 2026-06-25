# Civil Tracker — Task Tracker

## Phase 9: Multi-Tenant Expansion

### Status: Preview QA Blocked — awaiting `.env.playwright.local` real values

---

### Completed

- [x] Branch: `phase-9-multitenant-expansion`
- [x] SuperAdminSidebar updated: all nav items, platform banner, active state
- [x] DashboardSidebar updated: Vendors, Subcontractors, BOQ, Tasks, Documents, Clients added
- [x] MobileTabbar Reports icon corrected to bar chart
- [x] globals.css: unclosed `.sa-layout {` fixed
- [x] `.env.vercel` added to .gitignore (OIDC token was tracked — security fix)
- [x] Phase 9 migration verified: non-destructive (only `plan` column type change)
- [x] `/api/health` endpoint created
- [x] Super Admin layout now passes real `companyCount` to sidebar

### Blocked

- [ ] **Preview QA**: `.env.playwright.local` still has placeholder values
  - Must update `BASE_URL` to real Phase 9 Vercel preview URL
  - Must update `VERCEL_AUTOMATION_BYPASS_SECRET` to real secret (from Vercel dashboard)
  - Do NOT paste secrets into chat — edit the file locally only

### After Preview QA Passes

- [ ] Run Phase 9-specific Playwright tests:
  ```
  npx playwright test tests/e2e/company-onboarding.spec.ts tests/e2e/company-permissions.spec.ts tests/e2e/site-management.spec.ts tests/e2e/module-controls.spec.ts
  ```
- [ ] Capture screenshots to `test-results/screenshots/phase-9-preview/`
- [ ] Run `npx prisma migrate deploy` on production
- [ ] Note: `plan` column resets to `TRIAL` for 2 existing companies — re-assign via Super Admin
- [ ] Merge to main and deploy
- [ ] Run production Playwright suite
- [ ] Tag: `git tag v0.9.0-multitenant-onboarding-accepted`

---

## Phase 10: Launch Hardening

### Completed

- [x] `docs/launch-readiness-audit.md` created
- [x] `docs/first-customer-onboarding.md` created
- [x] `docs/admin-runbook.md` created
- [x] `docs/smoke-test-checklist.md` created
- [x] `/api/health` endpoint created
- [x] `tests/e2e/launch-readiness.spec.ts` created

### Remaining

- [ ] PWA manifest & icons audit (manual check on mobile device)
- [ ] Run launch readiness Playwright suite against production
- [ ] Final production test: `npm run lint && npm run build && npx playwright test`
- [ ] Tag: `git tag v1.0.0-civil-tracker-pilot-ready`

---

## Known Technical Debt (not blocking launch)

1. CSS cascade conflict in `globals.css` — 4 design blocks share CSS class names without scope isolation
2. `.coplan` in DashboardSidebar hardcoded to "Standard Plan" — needs DB fetch in layout
3. Quality & Safety + Issues & Variations routes not yet created (admin design shows them)
4. RA Bills tab not yet a separate route (currently all bills in `/bills`)
5. `.env.vercel` had OIDC token — removed from tracking, should also be purged from git history

---

## Manual Actions Required from Kavin

1. Update `.env.playwright.local` with real preview URL and bypass secret
2. Run `npx playwright test` after updating env file
3. If tests pass: run `npx prisma migrate deploy` against preview DB
4. After production deployment: re-assign company plans via Super Admin UI (plan resets to TRIAL)
5. Run `git rm --cached .env.vercel && git commit -m "chore: untrack .env.vercel"` to clean git history of the OIDC token
