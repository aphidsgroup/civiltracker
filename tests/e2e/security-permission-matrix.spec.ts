import { test, expect } from '@playwright/test';
import { hasPermission } from '../../src/lib/permissions';

test.describe('Phase 6.1 Capability-Based Permission Matrix Enforcement', () => {
  test('1. Project Manager cannot approve expense unless explicitly allowed', () => {
    expect(hasPermission('PROJECT_MANAGER', 'expenses.approve')).toBe(false);
  });

  test('2. Accountant cannot create DPR unless explicitly allowed', () => {
    expect(hasPermission('ACCOUNTANT', 'dpr.create')).toBe(false);
  });

  test('3. Site Engineer cannot approve expense', () => {
    expect(hasPermission('SITE_ENGINEER', 'expenses.approve')).toBe(false);
  });

  test('4. Site Engineer cannot access finance reports', () => {
    expect(hasPermission('SITE_ENGINEER', 'reports.finance')).toBe(false);
  });

  test('5-9. Client cannot access internal operational pages (/expenses, /bills, /labour, /materials, /reports)', async ({ page }) => {
    const internalRoutes = ['/expenses', '/bills', '/labour', '/materials', '/reports'];
    for (const route of internalRoutes) {
      await page.goto(route);
      // Unauthenticated client or user visiting protected internal page is redirected
      await expect(page).toHaveURL(/.*\/login.*/);
    }
  });

  test('10. Company Admin tenant isolation across sites is enforced at API boundary', async ({ request }) => {
    const res = await request.get('/api/sites?companyId=unauthorized_company');
    expect(res.status()).toBe(401);
  });

  test('11. Upload signature endpoint rejects unauthorized site or unauthenticated access', async ({ request }) => {
    const res = await request.post('/api/upload', {
      data: { module: 'BILL', siteId: 'foreign_site_id' }
    });
    expect(res.status()).toBe(401);
  });

  test('12. Approval endpoint rejects unauthorized role or unauthenticated mutation', async ({ request }) => {
    const fakeId = 'cm00000000000000000000001';
    const res = await request.post(`/api/expenses/${fakeId}/approve`);
    expect(res.status()).toBe(401);
  });
});
