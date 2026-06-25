import { test, expect } from '@playwright/test'

test.describe('Phase 9 Multi-Tenant Onboarding', () => {
  test('Super Admin can navigate to company creation and see limits', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[name="email"]', 'admin@civiltracker.in')
    await page.fill('input[name="password"]', 'Admin@123456')
    await page.waitForSelector('button[data-hydrated="true"]'); await page.click('button:has-text("Sign in")')
    await page.waitForURL('**/super-admin/dashboard')

    
    // Dashboard should load
    await expect(page).toHaveURL(/\/super-admin\/dashboard/)
    
    // Navigate to companies
    await page.goto('/super-admin/companies/new')
    await expect(page.locator('text=Create New Company')).toBeVisible()
    
    // We don't submit the form to avoid polluting the DB on every test run without teardown,
    // but we can verify the fields exist
    await expect(page.locator('input[name="name"]')).toBeVisible()
    await expect(page.locator('input[name="userLimit"]')).toBeVisible()
    await expect(page.locator('input[name="siteLimit"]')).toBeVisible()
    await expect(page.locator('input[name="ownerEmail"]')).toBeVisible()
  })
})
