import { test, expect } from '@playwright/test';

test.describe('Mobile PWA', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('mobile home renders', async ({ page }) => {
    const response = await page.goto('/mobile/home');
    expect(response?.status()).toBeLessThan(400);
    
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('This page could not be found');
  });

  test('mobile upload bill renders', async ({ page }) => {
    const response = await page.goto('/mobile/upload-bill');
    expect(response?.status()).toBeLessThan(400);
    
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('This page could not be found');
  });
});
