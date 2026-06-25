import { test, expect } from '@playwright/test';

test.describe('Client Portal', () => {
  test('client portal home renders', async ({ page }) => {
    const response = await page.goto('/client/portal');
    expect(response?.status()).toBeLessThan(400);
    
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('This page could not be found');
  });
});
