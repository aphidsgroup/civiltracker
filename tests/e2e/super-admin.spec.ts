import { test, expect } from '@playwright/test';

test.describe('Super Admin', () => {
  test('super admin dashboard renders', async ({ page }) => {
    const response = await page.goto('/super-admin/dashboard');
    expect(response?.status()).toBeLessThan(400);
    
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('This page could not be found');
  });

  test('company list renders', async ({ page }) => {
    const response = await page.goto('/super-admin/companies');
    expect(response?.status()).toBeLessThan(400);
    
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('This page could not be found');
  });
});
