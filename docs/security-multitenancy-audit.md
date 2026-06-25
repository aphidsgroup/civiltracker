# Civil Tracker — Multi-Tenant Security & Data Isolation Audit Report

**Date:** 2026-06-25  
**Release Target:** Phase 6 Security Hardening  
**Audit Scope:** Multi-Tenant Isolation, Role-Based Access Control (RBAC), Client Portal Privacy, Cloudinary Upload Security, and Audit Logging.

---

## Executive Summary

Civil Tracker operates as a multi-tenant SaaS construction management platform. This Phase 6 hardening audit establishes guaranteed tenant isolation, strict role boundary enforcement, complete client portal data redaction, and tamper-resistant media uploads.

All permission assertions and database queries now pass through central server-side helpers (`src/lib/auth/`). Frontend UI hiding is treated strictly as an aesthetic convenience, never as a security barrier.

---

## 1. Multi-Tenant Isolation Matrix

| Layer / Module | Isolation Strategy | Enforcement Point | Verification Status |
| :--- | :--- | :--- | :--- |
| **API Endpoints** (`/api/*`) | Strict `companyId` filtering & session verification | Server Route Handlers | PASSED (Hardened) |
| **Server Actions** (`createExpenseAction`) | Session `companyId` injection & site ownership check | `assertCanAccessSite()` | PASSED (Hardened) |
| **Prisma ORM Queries** | Indexed `companyId` matching across all models | Schema & Query level | PASSED (Audited) |
| **Proxy Middleware** | Role-based routing gates (`/super-admin`, `/mobile`, `/client-portal`) | `src/proxy.ts` | PASSED (Hardened) |

### Key Hardening Guarantees
1. **No Cross-Tenant Leaks:** A Company Admin or user belonging to `Company A` attempting to query or mutate records belonging to `Company B` receives an immediate `401 Unauthorized` or `403 Forbidden` response.
2. **Super Admin Exception Handling:** Super Admin accounts bypass tenant filtering where global administration is required, while maintaining full attribution in audit trails.

---

## 2. Role-Based Access Control (RBAC) Hierarchy

Civil Tracker enforces a strict 10-tier numerical role hierarchy:

```
SUPER_ADMIN (100) > COMPANY_ADMIN (90) > PROJECT_MANAGER (70) > ACCOUNTANT (60) > 
PURCHASE_MANAGER (55) > SUPERVISOR (50) > SITE_ENGINEER (40) > CLIENT (20) > VENDOR / SUBCONTRACTOR (10)
```

### Module Permission Matrix

| Role | Financial Approvals | Expense / Bill Uploads | Attendance Marking | Client Portal | Super Admin Panel |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Super Admin** | ✔ | ✔ | ✔ | ✔ | ✔ |
| **Company Admin** | ✔ | ✔ | ✔ | ✖ (Redirects) | ✖ |
| **Project Manager** | ✔ | ✔ | ✔ | ✖ | ✖ |
| **Accountant** | ✔ | ✔ | ✔ | ✖ | ✖ |
| **Purchase Manager** | ✖ | ✔ | ✔ | ✖ | ✖ |
| **Supervisor / Engineer**| ✖ | ✔ | ✔ | ✖ | ✖ |
| **Client** | ✖ | ✖ | ✖ | ✔ (Isolated) | ✖ |

---

## 3. Client Portal Privacy Audit

The Client Portal (`/client-portal`) is structurally isolated to prevent exposure of internal contractor margins and communication.

### Redaction Verification
- **Financial Privacy:** Clients only see high-level project budget and total expenditure milestones. Individual labour wage rates, material unit costs, vendor invoices, and internal markups are stripped at the ORM query layer.
- **Media Sanitization:** Site photographs and quality updates must be explicitly flagged (`approvedForClient: true`) before becoming accessible via client endpoints.
- **Route Lockdown:** Any attempt by a Client session to navigate to `/dashboard`, `/approvals`, or `/api/attendance` is blocked by proxy middleware and API controllers.

---

## 4. Cloudinary Signed Upload Security

Media uploads across all 8 supported operational modules are secured against unauthorized storage consumption and path tampering.

### Security Controls
1. **Server-Side Secret Isolation:** `CLOUDINARY_API_SECRET` is strictly contained in server environment variables and never bundled into frontend assets.
2. **Tenant Folder Namespacing:** Uploaded media files are organized into isolated directory structures:
   `civil-tracker/<companySlug>/<siteSlug>/<module>/<yyyy>/<mm>/<filename>`
3. **Module & Ownership Validation:** Upload requests validate module enumeration (`BILL`, `SITE_PHOTO`, `DOCUMENT`, `SALARY_PROOF`, `DELIVERY_CHALLAN`, `QUALITY_PHOTO`, `SAFETY_PHOTO`, `PAYMENT_PROOF`) and verify that the target `siteId` belongs to the authenticated user's company before creating `MediaAsset` records.

---

## 5. Automated E2E Security Test Coverage

The hardening pipeline is verified continuously via automated Playwright test suites located in `tests/e2e/`:
- `security-multitenancy.spec.ts`: Simulates cross-tenant API requests and parameter tampering.
- `security-roles.spec.ts`: Validates role boundary redirects and approval authorization denials.
- `client-portal-privacy.spec.ts`: Verifies absence of sensitive internal data on client endpoints.
- `upload-security.spec.ts`: Ensures unauthenticated upload rejection and module validation.
- `security-permission-matrix.spec.ts`: Asserts capability matrix isolation and prevention of privilege escalation.

---

## 6. Phase 6.1: Capability-Based Permission Matrix Architecture

To comply with multi-company commercial construction compliance standards, Civil Tracker transitioned from pure role hierarchy rank matching (`user.role <= requiredRole`) to explicit capability-based permission matching (`hasPermission(role, permission)`).

### Why Pure Role Hierarchy Fails in Construction SaaS
In a linear hierarchy (`SUPER_ADMIN > COMPANY_ADMIN > PROJECT_MANAGER > ACCOUNTANT > SITE_ENGINEER > CLIENT`), higher rank assumes all privileges of lower rank. In civil construction:
- **Separation of Duties (Finance vs. Execution):** A **Project Manager** oversees site progress and material requisitions but must not approve vendor payments or payroll. Conversely, an **Accountant** approves expenses and disburses salaries but must not execute site engineering tasks or submit daily progress reports (DPRs).
- **Client & Vendor Isolation:** External stakeholders require strict portal sandboxes without access to internal operational route structures (`/expenses`, `/bills`, `/labour`).

### Granular Capability Matrix
| Role | Site Management (`sites.*`, `dpr.*`) | Expense Creation (`expenses.create`) | Finance Approval (`expenses.approve`, `salary.*`) | Financial Reports (`reports.finance`) | Client Portal (`clientPortal.view`) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Super Admin / Company Admin** | ✔ | ✔ | ✔ | ✔ | ✔ |
| **Project Manager** | ✔ | ✔ | ✖ | ✖ | ✖ |
| **Accountant** | ✖ | ✖ | ✔ | ✔ | ✖ |
| **Site Engineer** | ✔ (Assigned Only) | ✔ | ✖ | ✖ | ✖ |
| **Purchase Manager** | ✖ | ✖ | ✖ (Materials Only) | ✖ | ✖ |
| **Client** | ✖ | ✖ | ✖ | ✖ | ✔ (Isolated) |

**Production Readiness Status:** ACCEPTED AND LIVE ON PRODUCTION (`https://civiltracker.buildogram.in`).
