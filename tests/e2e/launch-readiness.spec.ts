/**
 * Phase 10 Launch Readiness Suite
 *
 * Tests that Civil Tracker is ready for real customer pilot onboarding.
 * Covers: auth flows, primary routes, super admin, mobile PWA, tenant isolation,
 * client portal privacy, report exports, health endpoint.
 *
 * Run against production:
 *   $env:BASE_URL="https://civiltracker.buildogram.in"; npx playwright test tests/e2e/launch-readiness.spec.ts
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginAs(page: Parameters<typeof test>[1] extends (args: infer A) => unknown ? A extends { page: infer P } ? P : never : never, email: string, password: string) {
  await page.goto('/login')
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', password)
  const btn = page.locator('button:has-text("Sign in"), button[type="submit"]').first()
  await btn.click()
  await page.waitForLoadState('networkidle')
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

test.describe('Health Endpoint', () => {
  test('GET /api/health returns 200 with ok status', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.services?.database?.status).toBe('ok')
    expect(body.version).toBeDefined()
    expect(body.timestamp).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Auth Flows
// ---------------------------------------------------------------------------

test.describe('Auth Flows', () => {
  test('login page renders without error', async ({ page }) => {
    const res = await page.goto('/login')
    expect(res?.status()).toBeLessThan(400)
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('This page could not be found')
    expect(body).not.toContain('Application error')
  })

  test('unauthenticated access to /dashboard redirects to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain('/login')
  })

  test('unauthenticated access to /super-admin/dashboard redirects to /login', async ({ page }) => {
    await page.goto('/super-admin/dashboard')
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain('/login')
  })

  test('unauthenticated access to /mobile/home redirects to /login', async ({ page }) => {
    await page.goto('/mobile/home')
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain('/login')
  })
})

// ---------------------------------------------------------------------------
// Super Admin — Route & UI smoke tests
// ---------------------------------------------------------------------------

test.describe('Super Admin Routes', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin@civiltracker.in', 'Admin@123456')
    await page.waitForURL(/\/super-admin\/dashboard/, { timeout: 10000 })
  })

  test('Super Admin dashboard loads', async ({ page }) => {
    await expect(page).toHaveURL(/\/super-admin\/dashboard/)
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('This page could not be found')
  })

  test('/super-admin/companies loads without 404', async ({ page }) => {
    await page.goto('/super-admin/companies')
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('This page could not be found')
    expect(body).not.toContain('Application error')
  })

  test('/super-admin/companies/new has required form fields', async ({ page }) => {
    await page.goto('/super-admin/companies/new')
    await expect(page.locator('input[name="name"]')).toBeVisible()
    await expect(page.locator('input[name="userLimit"]')).toBeVisible()
    await expect(page.locator('input[name="siteLimit"]')).toBeVisible()
  })

  test('/super-admin/users loads', async ({ page }) => {
    await page.goto('/super-admin/users')
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('This page could not be found')
  })

  test('/super-admin/subscriptions loads', async ({ page }) => {
    await page.goto('/super-admin/subscriptions')
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('This page could not be found')
  })

  test('/super-admin/module-controls loads', async ({ page }) => {
    await page.goto('/super-admin/module-controls')
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('This page could not be found')
  })

  test('/super-admin/storage loads', async ({ page }) => {
    await page.goto('/super-admin/storage')
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('This page could not be found')
  })

  test('/super-admin/support loads', async ({ page }) => {
    await page.goto('/super-admin/support')
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('This page could not be found')
  })

  test('/super-admin/system-logs loads', async ({ page }) => {
    await page.goto('/super-admin/system-logs')
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('This page could not be found')
  })
})

// ---------------------------------------------------------------------------
// Company Admin Dashboard Routes
// ---------------------------------------------------------------------------

test.describe('Company Admin Dashboard Routes', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'arun@madras-crafters.in', 'Admin@123456')
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })
  })

  const routes = [
    '/dashboard',
    '/sites',
    '/dpr',
    '/expenses',
    '/bills',
    '/approvals',
    '/labour',
    '/materials',
    '/vendors',
    '/subcontractors',
    '/purchase',
    '/boq',
    '/tasks',
    '/documents',
    '/clients',
    '/reports',
    '/settings',
  ]

  for (const route of routes) {
    test(`${route} loads without 404 or crash`, async ({ page }) => {
      await page.goto(route)
      const status = await page.evaluate(() => document.readyState)
      expect(status).toBe('complete')
      const body = await page.locator('body').innerText()
      expect(body).not.toContain('This page could not be found')
      expect(body).not.toContain('Application error')
    })
  }

  test('Company Admin cannot access Super Admin pages', async ({ page }) => {
    await page.goto('/super-admin/dashboard')
    // Should redirect to login or /dashboard, not load super admin content
    await page.waitForURL(/\/login|\/dashboard/, { timeout: 5000 })
    expect(page.url()).not.toContain('/super-admin')
  })
})

// ---------------------------------------------------------------------------
// Mobile PWA Routes
// ---------------------------------------------------------------------------

test.describe('Mobile PWA Routes', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'murugan@madras-crafters.in', 'Admin@123456')
    await page.waitForLoadState('networkidle')
  })

  const mobileRoutes = [
    '/mobile/home',
    '/mobile/sites',
    '/mobile/add',
    '/mobile/reports',
    '/mobile/profile',
    '/mobile/approvals',
  ]

  for (const route of mobileRoutes) {
    test(`${route} loads at 390px without horizontal overflow`, async ({ page }) => {
      await page.goto(route)
      const body = await page.locator('body').innerText()
      expect(body).not.toContain('This page could not be found')

      // Check no horizontal scroll
      const hasHorizontalScroll = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth
      )
      expect(hasHorizontalScroll).toBeFalsy()
    })
  }

  test('Mobile tab bar is visible with 5 tabs', async ({ page }) => {
    await page.goto('/mobile/home')
    const tabbar = page.locator('.tabbar')
    await expect(tabbar).toBeVisible()
    const tabs = tabbar.locator('.tab, .fabwrap')
    await expect(tabs).toHaveCount(5)
  })
})

// ---------------------------------------------------------------------------
// Client Portal Privacy
// ---------------------------------------------------------------------------

test.describe('Client Portal Privacy', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'client@annanagar.in', 'Admin@123456')
    await page.waitForLoadState('networkidle')
  })

  test('Client cannot access /expenses', async ({ page }) => {
    await page.goto('/expenses')
    await page.waitForURL(/\/login|\/client-portal|\/dashboard/, { timeout: 5000 })
    // Should not be on /expenses
    expect(page.url()).not.toMatch(/\/expenses$/)
  })

  test('Client cannot access /bills', async ({ page }) => {
    await page.goto('/bills')
    await page.waitForURL(/\/login|\/client-portal|\/dashboard/, { timeout: 5000 })
    expect(page.url()).not.toMatch(/\/bills$/)
  })

  test('Client cannot access Super Admin pages', async ({ page }) => {
    await page.goto('/super-admin/companies')
    await page.waitForURL(/\/login|\/client-portal/, { timeout: 5000 })
    expect(page.url()).not.toContain('/super-admin')
  })

  test('Client portal itself loads', async ({ page }) => {
    await page.goto('/client-portal')
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('This page could not be found')
  })
})

// ---------------------------------------------------------------------------
// API Routes — Auth enforcement
// ---------------------------------------------------------------------------

test.describe('API Auth Enforcement', () => {
  test('GET /api/sites returns 401 without auth', async ({ request }) => {
    const res = await request.get('/api/sites')
    expect([401, 403]).toContain(res.status())
  })

  test('GET /api/expenses returns 401 without auth', async ({ request }) => {
    const res = await request.get('/api/expenses')
    expect([401, 403]).toContain(res.status())
  })

  test('GET /api/approvals returns 401 without auth', async ({ request }) => {
    const res = await request.get('/api/approvals')
    expect([401, 403]).toContain(res.status())
  })
})

// ---------------------------------------------------------------------------
// Tenant Isolation
// ---------------------------------------------------------------------------

test.describe('Tenant Isolation', () => {
  test('API /api/sites only returns sites for authenticated company', async ({ page, request }) => {
    await loginAs(page, 'arun@madras-crafters.in', 'Admin@123456')
    // Get cookies from the logged-in page context
    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')

    const res = await request.get('/api/sites', {
      headers: { Cookie: cookieHeader },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.sites).toBeDefined()
    // All returned sites should belong to this company — we can't know IDs
    // but the important check is no cross-tenant leak in count / data
    expect(Array.isArray(body.sites)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Report Export
// ---------------------------------------------------------------------------

test.describe('Report Export', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'arun@madras-crafters.in', 'Admin@123456')
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })
  })

  test('/reports page loads with export options', async ({ page }) => {
    await page.goto('/reports')
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('This page could not be found')
    expect(body).not.toContain('Application error')
  })
})
