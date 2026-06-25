# Civil Tracker — First Customer Onboarding Guide

**Audience:** Super Admin (Kavin / platform operator)
**Purpose:** Step-by-step guide to onboard the first real construction company onto Civil Tracker.

---

## Prerequisites

- You are logged in as Super Admin at https://civiltracker.buildogram.in
- Phase 9 migration has been deployed (`prisma migrate deploy`)
- You have the customer's company details: name, location, primary contact email

---

## Step 1 — Create the Company

1. Go to **Super Admin → Companies → Create Company** (`/super-admin/companies/new`)
2. Fill in:
   - **Company Name** (e.g. "Sunrise Builders Pvt Ltd")
   - **City / Location**
   - **Plan** — start with `TRIAL` or `STARTER`
   - **Site Limit** — default 1 for trial, increase as needed
   - **User Limit** — default 5
   - **Status** — set to `ACTIVE`
3. Click **Create Company**
4. Note the auto-generated **Company ID** from the URL

## Step 2 — Create the Company Admin Login

The company creation form auto-creates a Company Admin user. You will see:

- **Email:** the email you entered for the primary contact
- **Temporary password:** shown once — copy it and send to the customer

If you need to create additional admins later:
1. Go to **Companies → [Company Name] → Users**
2. Click **Add User**
3. Set role to `COMPANY_ADMIN`

## Step 3 — Customer's First Login

Send the customer:
```
URL: https://civiltracker.buildogram.in/login
Email: [their email]
Password: [temporary password from Step 2]
```

They will be redirected to the Company Admin dashboard on first login.

## Step 4 — Create the First Site

The Company Admin should:
1. Go to **Sites → New Site** (`/sites/new`)
2. Fill in:
   - Site Name (e.g. "Bungalow Project — Koramangala")
   - Location / Address
   - Client Name
   - Budget (₹)
   - Target End Date
3. Click **Create Site**

## Step 5 — Create the Site Engineer

1. Go to **Settings → Users** (`/settings`)
2. Click **Add User**
3. Fill in:
   - Name, Email, Phone
   - Role: `SITE_ENGINEER`
4. Share login credentials with the site engineer
5. Assign the site engineer to the site from **Sites → [Site Name] → Settings**

## Step 6 — Add the Accountant

1. Go to **Settings → Users**
2. Add user with role: `ACCOUNTANT`
3. The accountant will have access to Expenses, Bills, Approvals, Labour & Salary, Reports

## Step 7 — Enable Modules (if on a plan with module controls)

1. As Super Admin, go to **Module Controls** (`/super-admin/module-controls`)
2. Select the company
3. Enable relevant modules: Reports, Labour, Materials, Documents, etc.
4. Save

## Step 8 — Upload the First Bill

The Site Engineer or Company Admin:
1. Mobile: tap **+** FAB → **Upload Bill**
2. Desktop: go to **Bills → Upload Bill**
3. Take a photo or upload a PDF of the invoice
4. Fill in: Vendor, Amount, Date, Category
5. Submit for approval

## Step 9 — Approve the First Expense

The Accountant or Company Admin:
1. Go to **Approvals** (sidebar badge will show pending count)
2. Open the bill approval
3. Review details + photo
4. Click **Approve** or **Reject with comment**

## Step 10 — Generate the First Report

1. Go to **Reports** → select report type (e.g. Expense Report)
2. Set date range
3. Click **Export PDF** or **Export Excel**
4. File downloads immediately

## Step 11 — Give Client Access

1. Go to **Clients** (`/clients`)
2. Add the client with their email
3. Set their role to `CLIENT`
4. The client can log in and view the **Client Portal** — progress, photos, payments, documents
5. They cannot see internal finance or labour data

---

## Checklist Before Handing Off

- [ ] Company created and status is ACTIVE
- [ ] Company Admin login credentials sent
- [ ] First site created
- [ ] Site Engineer added and assigned to site
- [ ] Accountant added
- [ ] Modules enabled per plan
- [ ] Client login created (if applicable)
- [ ] Customer confirmed they can log in
- [ ] Demo call completed: walk through bill upload → approval → report

---

## Support Contacts

- Platform issues: Super Admin → Support Tickets
- Database/infra: See `docs/admin-runbook.md`
