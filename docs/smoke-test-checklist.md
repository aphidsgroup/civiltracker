# Civil Tracker — Smoke Test Checklist

**Run this checklist after every production deployment, before onboarding a real company, and after any migration or permission change.**

---

## Quick Health Check (60 seconds)

```bash
curl https://civiltracker.buildogram.in/api/health
```

Expected: `{"status":"ok","services":{"database":{"status":"ok"}}}`

---

## After Every Deployment

### Auth

- [ ] `/login` page loads without error
- [ ] Login with Super Admin credentials succeeds → redirects to `/super-admin/dashboard`
- [ ] Login with a Company Admin → redirects to `/dashboard`
- [ ] Invalid credentials show error message (not crash)
- [ ] `/api/health` returns `200 ok`

### Primary Routes (no 404s)

- [ ] `/dashboard` loads
- [ ] `/sites` loads
- [ ] `/expenses` loads
- [ ] `/approvals` loads
- [ ] `/reports` loads
- [ ] `/mobile/home` loads (check mobile UA or resize to 390px)
- [ ] `/super-admin/companies` loads
- [ ] `/client-portal` loads (login as CLIENT role first)

---

## Before Onboarding a Real Company

### Super Admin Flow

- [ ] Create a test company via `/super-admin/companies/new`
- [ ] Confirm company admin login credentials are generated
- [ ] Log in as the new company admin
- [ ] Confirm redirect goes to `/dashboard` (not `/login`)
- [ ] Create a test site via `/sites/new`
- [ ] Confirm site appears in `/sites`
- [ ] Delete/deactivate the test company after verification

### Tenant Isolation Spot-Check

- [ ] Company A admin cannot access Company B data via API (`/api/sites` returns only own sites)
- [ ] Suspended company user gets blocked (status check in middleware)

### Mobile PWA

- [ ] Open https://civiltracker.buildogram.in on a real mobile device
- [ ] Tab bar renders without horizontal overflow
- [ ] FAB (+) opens `/mobile/add`
- [ ] Bill upload works end-to-end (photo → Cloudinary → DB)

---

## After Migration

- [ ] `npx prisma migrate status` shows all migrations as Applied
- [ ] `/api/health` returns `200 ok` immediately after migration
- [ ] Login still works for existing users
- [ ] No data loss for existing companies/sites (verify counts in Super Admin dashboard)
- [ ] If Phase 9 migration: re-assign company plans via `/super-admin/companies/[id]` (plan column reset to TRIAL)

---

## After Changing Permissions

- [ ] Run `npx playwright test tests/e2e/security-permission-matrix.spec.ts`
- [ ] Confirm ACCOUNTANT cannot submit DPR
- [ ] Confirm PROJECT_MANAGER cannot approve finance
- [ ] Confirm CLIENT cannot access `/expenses` or `/bills`
- [ ] Confirm SITE_ENGINEER can only see assigned site

---

## Full Playwright Suite (for major releases)

```powershell
# Windows — against production
$env:BASE_URL="https://civiltracker.buildogram.in"
npx playwright test
```

Expected: all tests pass. If any fail, do NOT proceed with customer onboarding.

---

## Sign-Off

| Check | Passed By | Date |
|-------|-----------|------|
| Deployment smoke test | | |
| Mobile PWA check | | |
| Tenant isolation spot-check | | |
| Health endpoint | | |
| Playwright suite (if major release) | | |
