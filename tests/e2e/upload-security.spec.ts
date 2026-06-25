import { test, expect } from '@playwright/test';

test.describe('Cloudinary Upload Security & Validation', () => {
  test('/api/upload blocks unauthenticated POST requests', async ({ request }) => {
    const response = await request.post('/api/upload');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toMatch(/Unauthorized/i);
  });
});
