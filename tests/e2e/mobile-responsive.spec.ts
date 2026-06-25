import { test, expect } from '@playwright/test';

test.describe('Mobile Responsiveness', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const routes = [
    '/super-admin/dashboard',
    '/dashboard'
  ];

  for (const route of routes) {
    test(`${route} does not have horizontal overflow`, async ({ page }) => {
      await page.goto(route);
      
      const hasHorizontalScrollbar = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      
      expect(hasHorizontalScrollbar).toBe(false);
    });
  }
});
