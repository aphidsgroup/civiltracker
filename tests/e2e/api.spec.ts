import { test, expect } from '@playwright/test';

test.describe('API Endpoint Tests', () => {
  // Test authentication endpoint
  test('GET /api/auth/session should return unauthorized without cookie', async ({ request }) => {
    const response = await request.get('/api/auth/session');
    // next-auth returns 200 with empty object {} if no session
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(Object.keys(data).length).toBe(0);
  });

  // Test sites endpoint
  test('GET /api/sites should return unauthorized', async ({ request }) => {
    const response = await request.get('/api/sites');
    expect(response.status()).toBe(401);
  });

  // Test Cloudinary Upload endpoint (POST /api/upload)
  test('POST /api/upload should reject without file and auth', async ({ request }) => {
    const response = await request.post('/api/upload');
    expect(response.status()).toBe(401);
  });
});
