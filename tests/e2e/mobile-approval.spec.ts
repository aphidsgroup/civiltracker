import { test, expect } from '@playwright/test';

test.describe('Phase 7 Mobile Approvals PWA', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('1. Mobile approvals list page /mobile/approvals renders without errors', async ({ page }) => {
    const response = await page.goto('/mobile/approvals');
    expect(response?.status()).toBeLessThan(400);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('This page could not be found');
  });

  test('2. Mobile approval detail page /mobile/approvals/[id] handles unknown ID fallback', async ({ page }) => {
    const response = await page.goto('/mobile/approvals/non-existent-id');
    expect(response?.status()).toBeLessThan(400);
  });
});
