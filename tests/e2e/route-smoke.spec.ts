import { test, expect } from '@playwright/test';

const ROUTES = [
  '/login',
  '/super-admin/dashboard',
  '/super-admin/companies',
  '/super-admin/companies/new',
  '/super-admin/users',
  '/super-admin/subscriptions',
  '/super-admin/module-controls',
  '/super-admin/storage',
  '/super-admin/support',
  '/super-admin/system-logs',
  '/super-admin/settings',
  '/dashboard',
  '/sites',
  '/sites/new',
  '/expenses',
  '/expenses/new',
  '/bills',
  '/bills/upload',
  '/labour',
  '/labour/attendance',
  '/labour/salary',
  '/materials',
  '/materials/requests',
  '/purchase',
  '/vendors',
  '/subcontractors',
  '/boq',
  '/tasks',
  '/documents',
  '/clients',
  '/approvals',
  '/reports',
  '/settings',
  '/client-portal',
  '/client-portal/projects',
  '/client-portal/photos',
  '/client-portal/payments',
  '/client-portal/documents',
  '/mobile/home',
  '/mobile/sites',
  '/mobile/add',
  '/mobile/reports',
  '/mobile/profile',
  '/mobile/upload-bill',
  '/mobile/add-expense',
  '/mobile/attendance',
  '/mobile/dpr',
  '/mobile/site-photo'
];

test.describe('Route Smoke Tests', () => {
  // Login first to set cookie state so protected routes don't redirect to login
  test.beforeEach(async ({ page }) => {
    // We will bypass full login UI for speed and use a mocked session cookie or just login once
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@aphids.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/super-admin/dashboard*');
  });

  for (const route of ROUTES) {
    test(`Route ${route} should render without 404 or 500 errors`, async ({ page }) => {
      
      const response = await page.goto(route);
      
      // Ensure the response was successful
      expect(response?.status()).toBeLessThan(400);
      
      // Check that "404" or "Not Found" is not in the title or main content
      const text = await page.content();
      expect(text).not.toContain('This page could not be found');
      expect(text).not.toContain('404');
    });
  }
});
