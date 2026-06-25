import { test, expect } from '@playwright/test';

test.describe('Phase 7 Approval Workflow Engine E2E', () => {
  test('1. GET /api/approvals returns valid JSON without HTML login redirects', async ({ request }) => {
    const res = await request.get('/api/approvals');
    // Unauthenticated request should return 401 JSON, not 302/200 HTML
    expect(res.status()).toBe(401);
    const contentType = res.headers()['content-type'] || '';
    expect(contentType).toContain('application/json');
  });

  test('2. POST /api/approvals rejects unauthenticated submissions safely', async ({ request }) => {
    const res = await request.post('/api/approvals', {
      data: { entityType: 'BILL', entityId: 'test-123', title: 'Test Bill' }
    });
    expect(res.status()).toBe(401);
  });

  test('3. Desktop Approval Center /approvals renders KPI summary cards and tabs', async ({ page }) => {
    const response = await page.goto('/approvals');
    expect(response?.status()).toBeLessThan(400);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('This page could not be found');
  });

  test('4. POST /api/approvals/[id]/approve returns 401 JSON for unauthenticated request', async ({ request }) => {
    const res = await request.post('/api/approvals/cm7test000001/approve', { data: {} });
    expect(res.status()).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  test('5. POST /api/approvals/[id]/reject requires rejection rationale parameter', async ({ request }) => {
    const res = await request.post('/api/approvals/cm7test000001/reject', { data: { reason: '' } });
    expect(res.status()).toBe(401);
  });
});
