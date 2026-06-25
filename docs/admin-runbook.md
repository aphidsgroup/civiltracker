# Civil Tracker — Admin Runbook

**Audience:** Platform operator / DevOps
**Last updated:** 2026-06-26

---

## Deployment

### Deploy to Production (Normal Push)

```bash
# Ensure you are on the correct branch and tests pass locally
git checkout main
git pull origin main
git merge phase-9-multitenant-expansion   # or whichever feature branch
git push origin main
```

Vercel auto-deploys on push to `main`. Monitor at https://vercel.com/dashboard.

### Deploy with Migration

#### Pre-Migration Safety Checklist

##### Protected Commercial Fields

These columns hold billing and subscription state. **Any `DROP COLUMN` on them is a hard failure.**

| Field | Table | Why protected |
|-------|-------|--------------|
| `plan` | `Company` | Billing tier — Phase 9 incident reset 2 companies to TRIAL |
| `status` | `Company` | Account lifecycle (TRIAL/ACTIVE/SUSPENDED/CANCELLED) |
| `modulesJson` | `Company` | Enabled module list, set per contract |
| `userLimit` | `Company` | Per-contract seat cap |
| `siteLimit` | `Company` | Per-contract site cap |
| `storageLimitMb` | `Company` | Per-contract storage cap |

##### Rule: DROP COLUMN on protected fields fails by default

Run these checks on every migration SQL file before merging:

```bash
# Each of these must return ZERO matches
grep -i 'DROP COLUMN.*"plan"'          migration.sql
grep -i 'DROP COLUMN.*"status"'        migration.sql
grep -i 'DROP COLUMN.*"modulesJson"'   migration.sql
grep -i 'DROP COLUMN.*"userLimit"'     migration.sql
grep -i 'DROP COLUMN.*"siteLimit"'     migration.sql
grep -i 'DROP COLUMN.*"storageLimitMb"' migration.sql
grep -i 'DROP TABLE.*"Company"'        migration.sql
grep -i 'TRUNCATE.*"Company"'          migration.sql
```

The automated Playwright regression suite (`tests/e2e/company-plan-regression.spec.ts`) also runs this check on every migration file at CI time.

> **Why `DROP+ADD` is never safe:** The Phase 9 incident used exactly this pattern — `DROP COLUMN "plan"` followed by `ADD COLUMN "plan" DEFAULT 'TRIAL'`. Even though ADD COLUMN was present, all existing values were silently wiped and replaced with the DEFAULT. The guard rejects this regardless. See `docs/production-migration-audit.md`.

##### Exception: approved backfill-safe migration

If a type change on a protected column is truly unavoidable, the migration **must** include all of the following or the regression test will fail:

1. **Approval marker** — add this exact comment anywhere in the migration file:
   ```sql
   -- APPROVED_COMMERCIAL_STATE_BACKFILL
   ```

2. **Backup/temp column** — create a safe staging column before touching the original:
   ```sql
   ALTER TABLE "Company" ADD COLUMN "plan_new" "CompanyPlan" NOT NULL DEFAULT 'TRIAL';
   ```

3. **Explicit data backfill** — copy existing values before dropping:
   ```sql
   UPDATE "Company" SET "plan_new" = "plan"::text::"CompanyPlan";
   ```

4. **Validation query or comment** — assert data integrity after backfill:
   ```sql
   -- verify: SELECT COUNT(*) FROM "Company" WHERE "plan_new" IS NULL → must be 0
   ```

5. **Drop and rename** — only after steps 2–4:
   ```sql
   ALTER TABLE "Company" DROP COLUMN "plan";
   ALTER TABLE "Company" RENAME COLUMN "plan_new" TO "plan";
   ```

Full approved example:

```sql
-- APPROVED_COMMERCIAL_STATE_BACKFILL
-- Context: changing Company.plan from String → CompanyPlan enum
-- Incident history: see docs/production-migration-audit.md

-- Step 1: add temp column
ALTER TABLE "Company" ADD COLUMN "plan_new" "CompanyPlan" NOT NULL DEFAULT 'TRIAL';

-- Step 2: backfill from existing values (no blind DEFAULT)
UPDATE "Company" SET "plan_new" = "plan"::text::"CompanyPlan";

-- Step 3: validate — run manually before step 4
-- verify: SELECT COUNT(*) FROM "Company" WHERE "plan_new" IS NULL  → must be 0
-- verify: SELECT plan, plan_new FROM "Company"                     → values match

-- Step 4: swap
ALTER TABLE "Company" DROP COLUMN "plan";
ALTER TABLE "Company" RENAME COLUMN "plan_new" TO "plan";
```

#### Steps

1. Verify migration is non-destructive using the checklist above:
   ```bash
   cat prisma/migrations/<migration_name>/migration.sql
   ```

2. Apply migration to production database:
   ```bash
   npx prisma migrate deploy
   ```
   This uses `DATABASE_URL` from the environment. Never use `db push` on production.

3. Push code:
   ```bash
   git push origin main
   ```

4. Verify: check `/api/health` returns `{"status":"ok"}` after deployment.

5. If migration touches Company billing fields: **manually verify all company plans/limits are correct** at `/super-admin/companies`.

---

## Rollback

### Vercel Rollback (Instant)

1. Go to https://vercel.com/dashboard → your project
2. Click **Deployments**
3. Find the last known-good deployment
4. Click **...** → **Promote to Production**

This redeploys the old build without touching the database.

### Database Rollback

Prisma does not support automatic rollback. If a migration must be undone:

1. Write a reverse migration manually:
   ```sql
   -- Reverse what the bad migration did
   ALTER TABLE "Company" DROP COLUMN IF EXISTS "newColumn";
   ```

2. Apply it:
   ```bash
   npx prisma db execute --file rollback.sql
   ```

3. Mark the migration as rolled back in the `_prisma_migrations` table if needed:
   ```sql
   UPDATE "_prisma_migrations" SET "rolled_back_at" = NOW() WHERE name = 'migration_name';
   ```

4. Update `schema.prisma` to match the rolled-back DB state, then generate:
   ```bash
   npx prisma generate
   ```

---

## Running Migrations

### Check migration status

```bash
npx prisma migrate status
```

### Apply pending migrations (production)

```bash
npx prisma migrate deploy
```

### Create a new migration (development only)

```bash
npx prisma migrate dev --name describe_what_changes
```

**Never run `prisma migrate dev`, `prisma db push`, or `prisma migrate reset` on production.**

---

## Running Playwright Tests

### Local (against local dev server)

```bash
# Start dev server first in another terminal:
npm run dev

# Then in a new terminal:
npx playwright test
```

### Against preview deployment

1. Update `.env.playwright.local` with real values:
   ```
   BASE_URL="https://your-preview-url.vercel.app"
   VERCEL_AUTOMATION_BYPASS_SECRET="your-real-secret"
   ```
2. Run:
   ```bash
   npx playwright test
   ```

### Against production

```powershell
# Windows PowerShell
$env:BASE_URL="https://civiltracker.buildogram.in"
npx playwright test
```

### Run Phase 9 specific tests only

```bash
npx playwright test tests/e2e/company-onboarding.spec.ts tests/e2e/company-permissions.spec.ts tests/e2e/site-management.spec.ts tests/e2e/module-controls.spec.ts
```

### View HTML report

```bash
npx playwright show-report
```

---

## Managing Preview DB

Civil Tracker uses Neon PostgreSQL. Neon supports database branching:

1. Go to https://console.neon.tech
2. Select your project
3. Create a branch from `main` for preview: **Branches → New Branch**
4. Copy the branch connection string
5. Set it in Vercel preview environment: **Settings → Environment Variables → Preview**

Preview migrations:
```bash
# With preview DATABASE_URL set in environment
npx prisma migrate deploy
```

---

## Rotating Secrets

### Neon Database Password

1. Go to Neon console → Connection Details → Reset Password
2. Update `DATABASE_URL` in:
   - Vercel production environment variables
   - Vercel preview environment variables
   - Local `.env.local` (never commit this)
3. Redeploy on Vercel to pick up new credentials

### Cloudinary API Secret

1. Go to https://cloudinary.com → Settings → Security → API Keys → Generate New Secret
2. Update `CLOUDINARY_API_SECRET` in Vercel environment variables
3. Redeploy

### Vercel Automation Bypass Secret

1. Go to Vercel → Project Settings → Security → Protection Bypass for Automation
2. Regenerate the secret
3. Update `.env.playwright.local` locally (never commit this file)
4. Update `VERCEL_AUTOMATION_BYPASS_SECRET` in your CI secrets if applicable

### NextAuth Secret

1. Generate a new secret: `openssl rand -base64 32`
2. Update `NEXTAUTH_SECRET` in Vercel environment variables
3. Redeploy — all existing sessions will be invalidated

---

## Troubleshooting Login

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| "Invalid credentials" | Wrong password or email | Reset password from Super Admin → Users |
| Redirect loop | Role-route mismatch | Check `src/lib/auth.ts` redirect logic |
| Session expires immediately | `NEXTAUTH_SECRET` mismatch | Verify env var is set in Vercel |
| SUPER_ADMIN redirected to /login | Role not in session | Check `src/types/index.ts` SessionUser |
| Company Admin sees empty dashboard | companyId not in session | Check user has companyId in DB |

---

## Troubleshooting Cloudinary Upload

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Upload returns 401 | `CLOUDINARY_API_KEY` or `API_SECRET` wrong | Verify Vercel env vars |
| Upload returns 400 | Invalid file type or oversized | Check max size in `src/app/api/upload/route.ts` |
| Image URL works in local but 404 in prod | Wrong Cloudinary cloud name | Check `CLOUDINARY_CLOUD_NAME` in Vercel |
| Upload hangs | Neon connection pool exhaustion | Check Neon dashboard for active connections |

---

## Troubleshooting Neon Connection

| Symptom | Fix |
|---------|-----|
| `P1001: Can't reach database server` | Check `DATABASE_URL` is set; check Neon project is active |
| `P2024: Connection pool timeout` | Neon is cold-starting (serverless). Retry once. Add `?connect_timeout=30` to DATABASE_URL |
| `prisma migrate deploy` fails | Verify `DATABASE_URL` points to correct branch; check migration SQL for syntax errors |
| `Cannot find module '@prisma/engines'` | Run `npx prisma generate` on the target platform (Linux/Windows mismatch) |

---

## Verifying Tenant Isolation

Run the security test suite:

```bash
npx playwright test tests/e2e/security-multitenancy.spec.ts tests/e2e/company-permissions.spec.ts
```

Manual checks:
1. Log in as Company A admin
2. Note a Company B site ID from Super Admin view
3. Attempt to access `/sites/[company-b-site-id]` — should return 403 or redirect
4. Attempt `/api/sites` — should only return Company A's sites

---

## Verifying Production Health

```bash
curl https://civiltracker.buildogram.in/api/health
# Expected: {"status":"ok","version":"1.0.0","timestamp":"...","services":{"database":{"status":"ok","latencyMs":...}}}
```

Full production test:

```powershell
$env:BASE_URL="https://civiltracker.buildogram.in"
npx playwright test
```
