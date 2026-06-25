import { test, expect } from '@playwright/test';

test.describe('Major Routes', () => {
  const routes = [
    '/',
    '/login',
    '/dashboard',
    '/super-admin/dashboard',
    '/company/dashboard',
    '/client/portal',
    '/mobile/home'
  ];

  for (const route of routes) {
    test(`route ${route} does not return 404`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).not.toBe(404);
      expect(response?.status()).not.toBe(500);
      
      // Check that Next.js default 404 page is not rendered
      const bodyText = await page.locator('body').innerText();
      expect(bodyText).not.toContain('This page could not be found');
    });
  }
});
