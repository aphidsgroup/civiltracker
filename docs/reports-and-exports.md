# Financial Reports and PDF/Excel Exports

## Architecture
The Report Engine is responsible for rendering high-value founder and admin dashboards and reports.

### Key Components
- **Dashboard Data Fetching:** `src/actions/reports.ts` handles complex financial aggregations (e.g. Total Revenue vs Estimated Cost, Top Spend Sites).
- **Export Formats:**
  - PDF: Uses `pdfmake` generated server-side.
  - Excel: Uses `exceljs` generated server-side.
- **Auditing:** All generated exports are tracked in the database via the `ReportExport` model for accountability.
- **Storage:** Export files are temporarily buffered and returned directly to the client as Base64 strings.

### Security and Isolation
- Strict **Tenant Isolation** is enforced via `requireUser()` and `companyId` filtering on all Prisma queries.
- **Authorization:** Only specific roles (SUPER_ADMIN, COMPANY_ADMIN, PROJECT_MANAGER, ACCOUNTANT) are allowed to access and export these financial reports. Role verification is enforced using the `hasPermission` utility and `ROLE_HIERARCHY`.

### Deployment Pipeline
- The `phase-8-reports-exports` branch includes safe migrations.
- The Vercel Preview environment strictly points to a Neon staging database (`staging-phase-8-reports-exports`) avoiding any accidental manipulation of the production database during Preview.
- Playwright E2E tests target the preview deployment URL explicitly.
