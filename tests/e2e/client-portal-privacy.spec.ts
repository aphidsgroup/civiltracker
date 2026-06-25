import { test, expect } from '@playwright/test';

test.describe('Client Portal Privacy & Data Isolation', () => {
  test('client portal route redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/client-portal');
    await expect(page).toHaveURL(/.*\/login.*/);
  });

  test('client document and payment subroutes redirect when unauthenticated', async ({ page }) => {
    const subroutes = ['/client-portal/documents', '/client-portal/payments', '/client-portal/photos', '/client-portal/projects'];
    for (const route of subroutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/.*\/login.*/);
    }
  });
});
