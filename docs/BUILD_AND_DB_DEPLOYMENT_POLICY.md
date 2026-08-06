# Civil Tracker Build and Database Deployment Policy

## Rule
Vercel production builds must be **build-only** and must not mutate the database.

## Why
Production currently contains a historical failed Prisma migration record (`P3009` on `20260625160000_phase_9_multitenant`). Running `prisma migrate deploy` during Vercel build causes the entire production deployment to fail before the application can ship.

## Safe production pattern
- **Vercel build:** `npx prisma generate && next build`
- **Database migrations:** run as an explicit operator action after reviewing migration state
- **Idempotent data repair/seeding:** trigger only through protected admin/maintenance paths, never blindly during build

## Operational consequence
If schema changes are required:
1. inspect migration history first
2. resolve any failed migration records explicitly
3. apply migrations intentionally
4. only then deploy code that depends on the new schema

## Current blocker to resolve separately
- Prisma reports `P3009` for migration `20260625160000_phase_9_multitenant`
- The database may already contain the required columns via later recovery work, but the failed migration record still blocks `migrate deploy`
- Fixing that record should be handled as a dedicated database maintenance operation, not in the Vercel build step
