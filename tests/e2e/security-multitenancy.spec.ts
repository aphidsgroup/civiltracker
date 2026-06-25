import { test, expect } from '@playwright/test';

test.describe('Multi-Tenant Security & Isolation', () => {
  test('unauthenticated API requests return 401 Unauthorized', async ({ request }) => {
    const endpoints = [
      { method: 'GET', url: '/api/sites' },
      { method: 'GET', url: '/api/expenses' },
      { method: 'POST', url: '/api/attendance', data: { attendance: [] } },
      { method: 'POST', url: '/api/upload', data: {} }
    ];

    for (const ep of endpoints) {
      const res = ep.method === 'GET' 
        ? await request.get(ep.url) 
        : await request.post(ep.url, { data: ep.data });
      expect(res.status()).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/Unauthorized/i);
    }
  });

  test('approve and reject routes reject unauthenticated mutations', async ({ request }) => {
    const fakeId = 'cm00000000000000000000001';
    const resApprove = await request.post(`/api/expenses/${fakeId}/approve`);
    expect(resApprove.status()).toBe(401);

    const resReject = await request.post(`/api/expenses/${fakeId}/reject`);
    expect(resReject.status()).toBe(401);
  });
});
