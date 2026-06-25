# Phase 9: Multi-Tenant Onboarding & Vercel QA

## Vercel Preview Protection
Vercel Preview Deployments are protected by Vercel Authentication (SSO). To allow automated Playwright testing against the Preview environment, a `VERCEL_AUTOMATION_BYPASS_SECRET` environment variable must be provided.

- The bypass mechanism uses the `x-vercel-protection-bypass` and `x-vercel-set-bypass-cookie` HTTP headers, injected via `playwright.config.ts`.
- **Secret Hygiene**: The automation bypass secret is handled exclusively through `.env.playwright.local` via `dotenv` locally. `.env.playwright.local` is strictly excluded in `.gitignore` and is never committed or hardcoded in any file.

## QA Results
- **Local QA**: Fully passed (240 out of 240 tests passed across all browsers).
- **Preview QA**: Unblocked by `.env.playwright.local` architecture but waiting for real secret insertion to execute.
- **Phase 9 Specific Results**: Waiting on Preview QA execution.

## Remaining Issues
- **Action Required**: The developer must insert the real bypass secret into `.env.playwright.local` and run `npx playwright test`.
- Screenshots of Phase 9 preview pages could not be captured because the preview is pending secret setup.
- Phase 9 is **NOT** ready for production migration/deployment until the Preview QA passes.
