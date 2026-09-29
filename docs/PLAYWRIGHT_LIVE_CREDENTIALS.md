# Playwright live credential configuration

Use this when running `tests/e2e/launch-readiness.spec.ts` against live Civil Tracker production.

## Why
Production tenant accounts drift over time and do not always match historical seed/demo credentials. The launch-readiness suite therefore supports environment-driven credentials per role.

## Supported variables
- `E2E_SUPER_ADMIN_EMAIL`
- `E2E_SUPER_ADMIN_PASSWORD`
- `E2E_COMPANY_ADMIN_EMAIL`
- `E2E_COMPANY_ADMIN_PASSWORD`
- `E2E_SITE_ENGINEER_EMAIL`
- `E2E_SITE_ENGINEER_PASSWORD`
- `E2E_CLIENT_EMAIL`
- `E2E_CLIENT_PASSWORD`

## Recommended local file
Create an untracked `.env.playwright.local` file at the repo root.

Example:

```env
BASE_URL=https://civiltracker.buildogram.in
E2E_SUPER_ADMIN_EMAIL=admin@civiltracker.in
E2E_SUPER_ADMIN_PASSWORD=<set-in-secure-environment>
E2E_COMPANY_ADMIN_EMAIL=
E2E_COMPANY_ADMIN_PASSWORD=
E2E_SITE_ENGINEER_EMAIL=
E2E_SITE_ENGINEER_PASSWORD=
E2E_CLIENT_EMAIL=
E2E_CLIENT_PASSWORD=
```

## Current behavior
- Super-admin verification can still run with the current default live credential.
- Company-admin, site-engineer, and client suites are skipped on live production unless explicit working credentials are provided.
- Local/dev runs can continue using seeded defaults.
