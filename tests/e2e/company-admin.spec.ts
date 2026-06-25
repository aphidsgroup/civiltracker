import { test, expect } from '@playwright/test';

test.describe('Company Admin', () => {
  test('company dashboard renders', async ({ page }) => {
    const response = await page.goto('/company/dashboard');
    expect(response?.status()).toBeLessThan(400);
    
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('This page could not be found');
  });

  test('sites list renders', async ({ page }) => {
    const response = await page.goto('/company/sites');
    expect(response?.status()).toBeLessThan(400);
    
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('This page could not be found');
  });

  test('expenses list renders', async ({ page }) => {
    const response = await page.goto('/company/expenses');
    expect(response?.status()).toBeLessThan(400);
    
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('This page could not be found');
  });
});
