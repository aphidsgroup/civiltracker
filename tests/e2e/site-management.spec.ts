import { test, expect } from '@playwright/test'

test.describe('Phase 9 Site Management & Assignment', () => {
  test('Company Admin can assign Project Manager to new site', async ({ page, request }) => {
    // Authenticate
    await page.goto('/login')
    await page.fill('input[name="email"]', 'arun@madras-crafters.in')
    await page.fill('input[name="password"]', 'Admin@123456')
    await page.waitForSelector('button[data-hydrated="true"]'); await page.click('button:has-text("Sign in")')
    await page.waitForURL('**/dashboard')

    await page.waitForURL(/\/dashboard/)
    
    // Check if the create site page shows PM assignment dropdown
    await page.goto('/sites/new')
    await expect(page.locator('text=Create New Site')).toBeVisible()
    await expect(page.locator('select[name="assignedPmId"]')).toBeVisible()
  })
})
