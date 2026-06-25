import { test, expect } from '@playwright/test';

test.describe('Authentication and Redirects', () => {
  // Test Super Admin Login
  test('Super Admin login and redirect', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@aphids.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Should redirect to super-admin dashboard
    await expect(page).toHaveURL(/\/super-admin\/dashboard/);
    await expect(page.locator('text=Platform Overview')).toBeVisible();
  });

  // Test Company Admin Login
  test('Company Admin login and redirect', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'john@construct.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Should redirect to company dashboard
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('text=Company Overview')).toBeVisible();
  });

  // Test Mobile User Login (Site Engineer)
  test('Site Engineer login and redirect to Mobile PWA', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'engineer@construct.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Should redirect to mobile home
    await expect(page).toHaveURL(/\/mobile\/home/);
    await expect(page.locator('text=Upload Bill').first()).toBeVisible();
  });

  // Test Client Login
  test('Client login and redirect to Client Portal', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'client@construct.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Should redirect to client portal
    await expect(page).toHaveURL(/\/client-portal/);
  });
});
