import { test, expect } from '@playwright/test';

test.describe('Role-Based Access Control (RBAC) Enforcement', () => {
  test('unauthenticated navigation to protected panels redirects to login', async ({ page }) => {
    const protectedRoutes = ['/super-admin/dashboard', '/dashboard', '/mobile/home', '/client-portal'];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/.*\/login.*/);
    }
  });

  test('super admin panel rejects direct unauthenticated API access', async ({ request }) => {
    // Verify protected admin backend endpoints don't leak unauthenticated
    const res = await request.get('/api/sites');
    expect(res.status()).toBe(401);
  });
});
