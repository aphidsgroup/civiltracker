import { test, expect } from '@playwright/test';

// Only run visual tests against specific viewports to avoid matrix explosion,
// we will handle mobile and desktop implicitly via the playwright.config.ts projects.

test.describe('Visual Regression Baseline Tests', () => {
  // Login setup
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    // Using admin login for baseline
    await page.fill('input[type="email"]', 'admin@aphids.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/super-admin/dashboard*');
  });

  test('Super Admin Dashboard Visual', async ({ page }) => {
    await page.goto('/super-admin/dashboard');
    // Wait for animations
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('super-admin-dashboard.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.05
    });
  });

  test('Company Dashboard Visual', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('company-dashboard.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.05
    });
  });

  test('Mobile Home Visual', async ({ page }) => {
    await page.goto('/mobile/home');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('mobile-home.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.05
    });
  });

  test('Mobile Upload Bill Visual', async ({ page }) => {
    await page.goto('/mobile/upload-bill');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('mobile-upload-bill.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.05
    });
  });
});
