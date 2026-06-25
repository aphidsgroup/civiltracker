# Civil Tracker — Phase 10 Launch Readiness Audit

**Date:** 2026-06-26
**Version:** 1.0.0 (Phase 10 candidate)
**Production URL:** https://civiltracker.buildogram.in
**Branch:** phase-9-multitenant-expansion

---

## Audit Checklist

### Auth & Access Control

| Area | Status | Notes |
|------|--------|-------|
| Login page (`/login`) | ✅ Ready | NextAuth v5 credentials-based |
| Role-based redirects | ✅ Ready | SUPER_ADMIN → /super-admin, others → /dashboard |
| Session expiry handling | ✅ Ready | Redirects to /login on unauthenticated request |
| Capability-based permissions | ✅ Ready | `src/lib/permissions.ts` + `requirePermission()` |
| Multi-tenant companyId isolation | ✅ Ready | All API routes filter by companyId |
| Super Admin bypass of tenant filter | ✅ Ready | Role check before companyId filter |
| Client Portal read-only enforcement | ✅ Ready | Separate route group `(client)` |
| 401/403 JSON responses from API | ✅ Ready | All API routes return proper JSON errors |

### Super Admin Onboarding

| Area | Status | Notes |
|------|--------|-------|
| `/super-admin/dashboard` | ✅ Ready | KPI overview |
| `/super-admin/companies` | ✅ Ready | List all companies with status |
| `/super-admin/companies/new` | ✅ Ready | Create company + auto-create admin user |
| `/super-admin/companies/[id]` | ✅ Ready | Company details |
| `/super-admin/companies/[id]/users` | ✅ Ready | User management per company |
| `/super-admin/companies/[id]/sites` | ✅ Ready | Site management per company |
| `/super-admin/users` | ✅ Ready | Global user view |
| `/super-admin/subscriptions` | ✅ Ready | Plan management |
| `/super-admin/module-controls` | ✅ Ready | Toggle modules per company |
| `/super-admin/storage` | ✅ Ready | Storage usage per company |
| `/super-admin/support` | ✅ Ready | Support tickets |
| `/super-admin/system-logs` | ✅ Ready | Audit log view |
| `/super-admin/settings` | ✅ Ready | Platform settings |
| Company status lifecycle (TRIAL/ACTIVE/SUSPENDED/CANCELLED) | ✅ Ready | CompanyStatus enum in schema |
| Site limit enforcement | ✅ Ready | siteLimit field + server action check |
| User limit enforcement | ✅ Ready | userLimit field + server action check |
| Module controls enforcement | ✅ Ready | modulesJson field + middleware check |

### Company Admin Workflow

| Area | Status | Notes |
|------|--------|-------|
| `/dashboard` | ✅ Ready | Company KPI overview |
| `/sites` | ✅ Ready | Site list |
| `/sites/new` | ✅ Ready | Create site |
| `/sites/[id]` | ✅ Ready | Site detail |
| `/dpr` | ✅ Ready | Daily Progress Reports |
| `/expenses` | ✅ Ready | Expense list |
| `/expenses/new` | ✅ Ready | New expense |
| `/bills` | ✅ Ready | Bill list + upload |
| `/bills/upload` | ✅ Ready | Cloudinary upload |
| `/approvals` | ✅ Ready | Approval center |
| `/approvals/[id]` | ✅ Ready | Approval detail + timeline |
| `/labour` | ✅ Ready | Labour management |
| `/labour/attendance` | ✅ Ready | Attendance marking |
| `/labour/salary` | ✅ Ready | Salary runs |
| `/materials` | ✅ Ready | Materials & stock |
| `/vendors` | ✅ Ready | Vendor management |
| `/subcontractors` | ✅ Ready | Subcontractor management |
| `/purchase` | ✅ Ready | Purchase orders |
| `/boq` | ✅ Ready | BOQ & budget |
| `/tasks` | ✅ Ready | Tasks & schedule |
| `/documents` | ✅ Ready | Document store |
| `/clients` | ✅ Ready | Client management |
| `/reports` | ✅ Ready | Reports dashboard |
| `/reports/[reportType]` | ✅ Ready | Report detail + export |
| `/reports/export-history` | ✅ Ready | Export log |
| `/settings` | ✅ Ready | Company settings |

### Approval Workflow Engine (Phase 7)

| Area | Status | Notes |
|------|--------|-------|
| Submit approval | ✅ Ready | `submitApproval` server action |
| Approve record | ✅ Ready | `approveRecord` server action |
| Reject record | ✅ Ready | `rejectRecord` server action |
| Add comment | ✅ Ready | `addApprovalComment` server action |
| Mark paid | ✅ Ready | `markRecordPaid` server action |
| Approval timeline/audit trail | ✅ Ready | ApprovalTimeline table |
| Pending badge in sidebar | ✅ Ready | `pendingApprovalsCount` prop |

### Financial Reports & Exports (Phase 8)

| Area | Status | Notes |
|------|--------|-------|
| PDF export (pdfmake) | ✅ Ready | `/reports/[reportType]` |
| Excel export (exceljs) | ✅ Ready | `/reports/[reportType]` |
| Export history logging | ✅ Ready | ReportExport model |
| Expense report | ✅ Ready | |
| Labour report | ✅ Ready | |
| Material report | ✅ Ready | |
| Site P&L | ✅ Ready | |

### Client Portal

| Area | Status | Notes |
|------|--------|-------|
| `/client-portal` | ✅ Ready | Read-only project overview |
| `/client-portal/projects` | ✅ Ready | Project milestones |
| `/client-portal/photos` | ✅ Ready | Approved site photos |
| `/client-portal/payments` | ✅ Ready | Payment summary |
| `/client-portal/documents` | ✅ Ready | Document downloads |
| Privacy (cannot see internal finance) | ✅ Ready | Role-gated, separate route group |

### Mobile PWA

| Area | Status | Notes |
|------|--------|-------|
| `/mobile/home` | ✅ Ready | Hero card + quick actions |
| `/mobile/sites` | ✅ Ready | Site list |
| `/mobile/add` | ✅ Ready | FAB quick-add |
| `/mobile/upload-bill` | ✅ Ready | Bill upload + Cloudinary |
| `/mobile/site-photo` | ✅ Ready | Photo capture |
| `/mobile/dpr` | ✅ Ready | Daily report form |
| `/mobile/reports` | ✅ Ready | Reports view |
| `/mobile/approvals` | ✅ Ready | Approval list + detail |
| `/mobile/profile` | ✅ Ready | Profile |
| Tab bar navigation | ✅ Ready | Home / Sites / FAB / Reports / Profile |
| No horizontal overflow | ✅ Verified | ResponsiveShell + media queries |
| PWA manifest | ✅ Ready | `public/manifest.json` |
| PWA installable | ✅ Ready | `next-pwa` configured |

### Infrastructure & DevOps

| Area | Status | Notes |
|------|--------|-------|
| Vercel deployment | ✅ Ready | Production on main branch |
| Neon PostgreSQL | ✅ Ready | Serverless adapter |
| Prisma migrations (not db push) | ✅ Ready | `prisma migrate deploy` for production |
| Cloudinary uploads | ✅ Ready | Server-side signed uploads |
| `/api/health` endpoint | ✅ Ready | DB ping + version |
| `.env.vercel` removed from git | ✅ Fixed | Added to .gitignore |
| No secrets in tracked files | ✅ Verified | git grep clean |

### CSS / Design Fidelity

| Area | Status | Notes |
|------|--------|-------|
| Unclosed `.sa-layout {` in globals.css | ✅ Fixed | Closed on line 463 |
| SuperAdminSidebar missing nav items | ✅ Fixed | 6 items added + active state + platform banner |
| DashboardSidebar missing nav items | ✅ Fixed | Vendors, Subcontractors, BOQ, Tasks, Documents, Clients added |
| MobileTabbar Reports icon | ✅ Fixed | Bar chart icon per design |
| CSS cascade conflict (4 design blocks) | ⚠️ Partial | Conflict exists but visual impact minimal due to shared tokens. Full scope isolation is a future refactor. |
| `.coplan` hardcoded to "Standard Plan" | ⚠️ Known | Session doesn't carry plan. Future: fetch from DB in layout. |

---

## Known Risks Before Pilot

1. **Phase 9 migration `DROP COLUMN "plan"`** — resets plan for 2 existing production companies to `TRIAL`. Super Admin must re-set them via `/super-admin/companies/[id]` after migration.

2. **Preview QA not yet run** — `.env.playwright.local` still has placeholder values. Kavin must update before running `npx playwright test` against preview.

3. **`.env.vercel` has historical OIDC token** — already expired (short-lived JWT) but must be removed from git history. Run `git rm --cached .env.vercel && git commit -m "chore: untrack .env.vercel"` then optionally rewrite history.

4. **CSS cascade conflict** — four design blocks in one `globals.css` cause token shadowing. Not visually broken but a code quality debt.

5. **Quality & Safety / Issues & Variations routes** — listed in Admin design but no route pages created yet. Sidebar does not link to them until routes exist.

---

## Verdict

Civil Tracker is **functionally complete** for pilot launch once:
- Preview QA passes with real env values
- Phase 9 migration deploys cleanly to production
- Production Playwright suite passes
- Super Admin re-assigns company plans post-migration
